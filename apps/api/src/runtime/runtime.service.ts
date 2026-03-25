import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException
} from '@nestjs/common';
import { MachineRuntimeCommandStatus, MachineRuntimeDesiredState, MachineStatus, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface, Interface } from 'node:readline';
import ExcelJS from 'exceljs';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { EventsService } from '../events/events.service';
import { LiveEventsService } from '../live/live-events.service';
import { MachinesService } from '../machines/machines.service';
import { PrismaService } from '../prisma/prisma.service';
import { HeartbeatMachineRuntimeControlDto } from './dto/heartbeat-machine-runtime-control.dto';
import { IngestMachineRuntimeTelemetryDto } from './dto/ingest-machine-runtime-telemetry.dto';
import { StartMachineRuntimeDto } from './dto/start-machine-runtime.dto';
import { StopMachineRuntimeDto } from './dto/stop-machine-runtime.dto';
import {
  BridgeMessage,
  MachineCameraState,
  MachineRuntimeCameraSource,
  MachineRuntimeControlState,
  MachineRuntimeCounts,
  MachineRuntimeModelCatalog,
  MachineRuntimeState,
  MachineRuntimeStateSummary
} from './runtime.types';

interface RuntimeProcessContext {
  child: ChildProcessWithoutNullStreams;
  stdout: Interface;
  stderr: Interface;
  sessionId: string;
  lastHeartbeatPersistAt: number;
  forceKillTimer?: NodeJS.Timeout;
}

interface RuntimeSummaryExportEvent {
  eventType: string;
  occurredAt: string;
  payload: unknown;
}

interface RuntimeSummaryExportContext {
  generatedAt: string;
  state: MachineRuntimeState;
  recentEvents: RuntimeSummaryExportEvent[];
}

interface RuntimeRequestContext {
  requestedByUserId?: string | null;
}

interface RemoteControlHeartbeatContext {
  ip?: string;
  userAgent?: string;
  apiKeyId?: string | null;
}

export interface RemoteControlSnapshot {
  machineCode: string;
  desiredState: MachineRuntimeDesiredState;
  commandVersion: number;
  status: MachineRuntimeCommandStatus;
  config: Record<string, unknown> | null;
  requestedAt: string | null;
  appliedCommandVersion: number;
  appliedAt: string | null;
  lastError: string | null;
  agentHeartbeatAt: string | null;
  agentRuntimeState: string | null;
  agentMessage: string | null;
}

@Injectable()
export class RuntimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RuntimeService.name);
  private readonly runtimeStates = new Map<string, MachineRuntimeState>();
  private readonly processContexts = new Map<string, RuntimeProcessContext>();
  private readonly heartbeatPersistIntervalMs: number;
  private readonly agentOfflineThresholdMs: number;
  private readonly defaultLocation: string;
  private readonly defaultFirmwareVersion: string;
  private readonly defaultMlProjectPath: string;
  private readonly defaultPythonExecutable: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly appSettingsService: AppSettingsService,
    private readonly machinesService: MachinesService,
    private readonly eventsService: EventsService,
    private readonly liveEvents: LiveEventsService
  ) {
    this.heartbeatPersistIntervalMs = Number(this.configService.get('MACHINE_RUNTIME_HEARTBEAT_MS') || 5000);
    this.agentOfflineThresholdMs = Number(this.configService.get('MACHINE_RUNTIME_AGENT_OFFLINE_MS') || 15000);
    this.defaultLocation = String(this.configService.get('MACHINE_RUNTIME_DEFAULT_LOCATION') || 'Vision Counter Line');
    this.defaultFirmwareVersion = String(this.configService.get('MACHINE_RUNTIME_DEFAULT_FIRMWARE') || 'ml-vision-1.0.0');
    this.defaultMlProjectPath = String(this.configService.get('ML_PROJECT_PATH') || 'H:\\ONEDRIVE LINK\\Pill_Counter_Machine');
    this.defaultPythonExecutable = String(this.configService.get('ML_PYTHON_EXECUTABLE') || 'python');
  }

  async onModuleDestroy() {
    for (const machineCode of [...this.processContexts.keys()]) {
      try {
        await this.stop(machineCode);
      } catch (error) {
        this.logger.warn(`Failed to stop runtime session for ${machineCode} during shutdown: ${String(error)}`);
      }
    }
  }

  async listStates(): Promise<MachineRuntimeStateSummary[]> {
    const machines = await this.prisma.machine.findMany({
      orderBy: { machineCode: 'asc' }
    });

    const machinesByCode = new Map(machines.map((machine) => [machine.machineCode, machine]));
    const machineCodes = new Set<string>([...machinesByCode.keys(), ...this.runtimeStates.keys()]);

    return [...machineCodes]
      .sort((left, right) => left.localeCompare(right))
      .map((machineCode) => this.toSummary(this.ensureState(machineCode, machinesByCode.get(machineCode))));
  }

  async getCatalog(): Promise<MachineRuntimeModelCatalog> {
    const catalogPath = this.resolveModelCatalogPath(this.resolveMlProjectPath());
    this.assertPathExists(catalogPath, 'ML_MODEL_CATALOG_NOT_FOUND', 'ML model catalog not found');
    const baseCatalog = JSON.parse(readFileSync(catalogPath, 'utf-8')) as MachineRuntimeModelCatalog;
    return this.appSettingsService.mergeRuntimeCatalog(baseCatalog);
  }

  listCameras(): MachineRuntimeCameraSource[] {
    const mlProjectPath = this.resolveMlProjectPath();
    const bridgeScriptPath = this.resolveBridgeScriptPath(mlProjectPath);
    this.assertPathExists(mlProjectPath, 'ML_PROJECT_NOT_FOUND', 'ML project path not found');
    this.assertPathExists(bridgeScriptPath, 'ML_BRIDGE_NOT_FOUND', 'ML bridge script not found');

    const maxCameraIndex = Math.max(Number(this.configService.get('ML_CAMERA_SCAN_MAX_INDEX') || 5), 0);
    const result = spawnSync(
      this.defaultPythonExecutable,
      [bridgeScriptPath, '--list-cameras', '--max-camera-index', String(maxCameraIndex)],
      {
        cwd: mlProjectPath,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1'
        },
        encoding: 'utf-8',
        timeout: 60_000
      }
    );

    if (result.error) {
      throw new InternalServerErrorException({
        code: 'ML_CAMERA_SCAN_FAILED',
        message: `Failed to scan local cameras: ${result.error.message}`
      });
    }

    if (result.status !== 0) {
      const detail = String(result.stderr || result.stdout || '').trim() || 'Unknown Python error';
      throw new InternalServerErrorException({
        code: 'ML_CAMERA_SCAN_FAILED',
        message: `Failed to scan local cameras: ${detail}`
      });
    }

    return this.parseCameraCatalogOutput(String(result.stdout || ''));
  }

  async details(machineCode: string): Promise<MachineRuntimeState> {
    const normalizedCode = machineCode.trim();
    const machine = await this.prisma.machine.findUnique({
      where: { machineCode: normalizedCode }
    });

    const existing = this.runtimeStates.get(normalizedCode);
    if (!machine && !existing) {
      throw new NotFoundException({ code: 'MACHINE_RUNTIME_NOT_FOUND', message: 'Machine runtime not found' });
    }

    return this.toDetail(this.ensureState(normalizedCode, machine || undefined));
  }

  async snapshot(machineCode: string): Promise<Buffer | null> {
    const state = await this.details(machineCode);
    const snapshotDataUrl = state.snapshotDataUrl?.trim();
    if (!snapshotDataUrl) {
      return null;
    }

    const match = /^data:image\/(?:jpeg|jpg);base64,(.+)$/i.exec(snapshotDataUrl);
    if (!match?.[1]) {
      return null;
    }

    return Buffer.from(match[1], 'base64');
  }

  async ingestRemoteTelemetry(
    machineCode: string,
    input: IngestMachineRuntimeTelemetryDto,
    _context: { ip?: string; userAgent?: string }
  ): Promise<MachineRuntimeStateSummary> {
    const normalizedCode = machineCode.trim();
    if (!normalizedCode) {
      throw new BadRequestException({ code: 'MACHINE_CODE_REQUIRED', message: 'Machine code is required' });
    }

    const emittedAt = this.normalizeTimestamp(input.emitted_at_utc || input.ended_at_utc || input.started_at_utc);
    const location = this.readString(input.location) || this.defaultLocation;
    const firmwareVersion = this.readString(input.firmware_version) || this.defaultFirmwareVersion;
    const displayName = this.readString(input.display_name) || this.readString(input.machine_name) || null;

    const machine = await this.prisma.machine.upsert({
      where: { machineCode: normalizedCode },
      update: {
        displayName,
        location,
        firmwareVersion,
        status: 'ONLINE',
        lastSeen: new Date(emittedAt)
      },
      create: {
        machineCode: normalizedCode,
        displayName,
        location,
        firmwareVersion,
        status: 'ONLINE',
        lastSeen: new Date(emittedAt)
      }
    });

    const state = this.ensureState(normalizedCode, machine);
    const nextControlState = this.normalizeRemoteControlState(input.control_state, input.ended_at_utc, input.latest_error);
    const nextCameraState = this.normalizeRemoteCameraState(input.camera_state, nextControlState);
    const nextSessionId = this.readString(input.session_id) || state.sessionId || `remote-${normalizedCode}`;

    state.displayName = displayName ?? state.displayName;
    state.location = location;
    state.firmwareVersion = firmwareVersion;
    state.sessionId = nextSessionId;
    state.controlState = nextControlState;
    state.cameraState = nextCameraState;
    state.startedAt = this.readString(input.started_at_utc) || state.startedAt || emittedAt;
    state.endedAt = this.readString(input.ended_at_utc) || (nextControlState === 'RUNNING' ? null : state.endedAt || emittedAt);
    state.lastHeartbeatAt = emittedAt;
    state.lastTelemetryAt = emittedAt;
    state.cameraIndex = this.readInteger(input.camera_index) ?? state.cameraIndex;
    state.frameWidth = this.readInteger(input.frame_width) ?? state.frameWidth;
    state.frameHeight = this.readInteger(input.frame_height) ?? state.frameHeight;
    state.frameNumber = this.readInteger(input.frame_number) ?? state.frameNumber;
    state.trackedObjectCount = this.readInteger(input.tracked_object_count) ?? state.trackedObjectCount;
    state.fps = this.readFloat(input.fps) ?? state.fps;
    state.averageConfidence = this.readFloat(input.average_confidence) ?? state.averageConfidence;
    state.modelKey = this.readString(input.model_key) || state.modelKey;
    state.modelName = this.readString(input.model_name) || state.modelName || state.modelKey;
    state.modelProvider = this.readString(input.model_provider) || state.modelProvider || 'local';
    state.modelPath = this.readString(input.model_path) || state.modelPath;

    if (input.visible_counts) {
      state.visibleCounts = this.normalizeCounts(input.visible_counts);
    }

    if (input.cumulative_counts) {
      state.cumulativeCounts = this.normalizeCounts(input.cumulative_counts);
    }

    const latestError = this.readString(input.latest_error);
    state.latestError = latestError || (nextControlState === 'ERROR' ? state.latestError || 'Remote runtime error.' : null);
    state.latestMessage =
      this.readString(input.message) ||
      (nextControlState === 'RUNNING'
        ? `Visible ${state.visibleCounts.total} item(s)`
        : nextControlState === 'ERROR'
          ? state.latestError || 'Remote runtime error.'
          : 'Remote runtime session finished.');

    const snapshotDataUrl = this.readString(input.snapshot_data_url);
    if (snapshotDataUrl) {
      state.snapshotDataUrl = snapshotDataUrl;
      state.snapshotUpdatedAt = emittedAt;
    }

    this.liveEvents.publish('machine.status.changed', {
      machineCode: normalizedCode,
      status: 'ONLINE',
      lastSeen: emittedAt
    });
    this.publishRuntimeUpdate('machine.runtime.remote.telemetry', state);
    return this.toSummary(state);
  }

  async heartbeatRemoteControl(
    machineCode: string,
    input: HeartbeatMachineRuntimeControlDto,
    _context: RemoteControlHeartbeatContext
  ): Promise<RemoteControlSnapshot> {
    const normalizedCode = machineCode.trim();
    if (!normalizedCode) {
      throw new BadRequestException({ code: 'MACHINE_CODE_REQUIRED', message: 'Machine code is required' });
    }

    const occurredAt = new Date();
    const occurredAtIso = occurredAt.toISOString();
    const machine = await this.prisma.machine.upsert({
      where: { machineCode: normalizedCode },
      update: {
        status: MachineStatus.ONLINE,
        lastSeen: occurredAt
      },
      create: {
        machineCode: normalizedCode,
        displayName: normalizedCode,
        location: this.defaultLocation,
        firmwareVersion: this.defaultFirmwareVersion,
        status: MachineStatus.ONLINE,
        lastSeen: occurredAt
      }
    });

    const incomingAppliedVersion = this.readInteger(input.applied_command_version);
    const incomingRuntimeState = this.normalizeRemoteControlState(input.runtime_state, undefined, input.last_error);
    const incomingMessage = this.readString(input.current_message);
    const incomingError = this.readString(input.last_error);
    const incomingPid = this.readInteger(input.active_pid);

    let control = await this.prisma.machineRuntimeControl.upsert({
      where: { machineCode: normalizedCode },
      update: {
        agentHeartbeatAt: occurredAt,
        agentSessionId: this.readString(input.agent_session_id) || undefined,
        agentRuntimeState: incomingRuntimeState,
        agentPid: incomingPid,
        agentMessage: incomingMessage || undefined,
        lastError: incomingError || undefined
      },
      create: {
        machineCode: normalizedCode,
        desiredState: MachineRuntimeDesiredState.IDLE,
        status: MachineRuntimeCommandStatus.APPLIED,
        requestedAt: occurredAt,
        appliedAt: occurredAt,
        appliedCommandVersion: incomingAppliedVersion ?? 0,
        agentHeartbeatAt: occurredAt,
        agentSessionId: this.readString(input.agent_session_id) || null,
        agentRuntimeState: incomingRuntimeState,
        agentPid: incomingPid,
        agentMessage: incomingMessage || null,
        lastError: incomingError || null
      }
    });

    const controlUpdate: Record<string, unknown> = {};
    if (incomingAppliedVersion !== null && incomingAppliedVersion >= control.commandVersion) {
      controlUpdate.appliedCommandVersion = incomingAppliedVersion;
      controlUpdate.appliedAt = occurredAt;
      controlUpdate.status = incomingError ? MachineRuntimeCommandStatus.FAILED : MachineRuntimeCommandStatus.APPLIED;
      controlUpdate.lastError = incomingError || null;
    } else if (incomingError && control.status !== MachineRuntimeCommandStatus.PENDING) {
      controlUpdate.status = MachineRuntimeCommandStatus.FAILED;
      controlUpdate.lastError = incomingError;
    }

    if (Object.keys(controlUpdate).length) {
      control = await this.prisma.machineRuntimeControl.update({
        where: { machineCode: normalizedCode },
        data: controlUpdate
      });
    }

    const state = this.ensureState(normalizedCode, {
      displayName: machine.displayName,
      location: machine.location,
      firmwareVersion: machine.firmwareVersion,
      lastSeen: machine.lastSeen
    });
    this.applyRemoteAgentHeartbeat(state, incomingRuntimeState, {
      message: incomingMessage,
      error: incomingError,
      pid: incomingPid,
      occurredAtIso
    });

    this.liveEvents.publish('machine.status.changed', {
      machineCode: normalizedCode,
      status: 'ONLINE',
      lastSeen: occurredAtIso
    });
    this.publishRuntimeUpdate('machine.runtime.remote.heartbeat', state);
    return this.toRemoteControlSnapshot(control);
  }

  async exportSummaryExcel(machineCode: string): Promise<Buffer> {
    const context = await this.buildRuntimeSummaryExport(machineCode);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Pill Count UI';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = 'Live machine session summary';
    workbook.title = `Machine summary - ${context.state.machineCode}`;

    const summarySheet = workbook.addWorksheet('Summary', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });
    summarySheet.columns = [
      { header: 'Field', key: 'field', width: 28 },
      { header: 'Value', key: 'value', width: 48 }
    ];
    summarySheet.addRows([
      { field: 'Generated at', value: context.generatedAt },
      { field: 'Machine code', value: context.state.machineCode },
      { field: 'Display name', value: context.state.displayName || 'Vision Counter' },
      { field: 'Location', value: context.state.location },
      { field: 'Firmware version', value: context.state.firmwareVersion },
      { field: 'Session ID', value: context.state.sessionId || 'Not started' },
      { field: 'Control state', value: context.state.controlState },
      { field: 'Camera state', value: context.state.cameraState },
      { field: 'Camera index', value: context.state.cameraIndex ?? 'Auto' },
      { field: 'Model key', value: context.state.modelKey || '' },
      { field: 'Model name', value: context.state.modelName || '' },
      { field: 'Model provider', value: context.state.modelProvider || '' },
      { field: 'Model path or id', value: context.state.modelPath || '' },
      { field: 'Frame size', value: `${context.state.frameWidth || 0} x ${context.state.frameHeight || 0}` },
      { field: 'Frame number', value: context.state.frameNumber },
      { field: 'Tracked objects', value: context.state.trackedObjectCount },
      { field: 'FPS', value: context.state.fps ?? '' },
      { field: 'Average confidence', value: context.state.averageConfidence ?? '' },
      { field: 'Started at', value: context.state.startedAt || '' },
      { field: 'Ended at', value: context.state.endedAt || '' },
      { field: 'Last heartbeat', value: context.state.lastHeartbeatAt || '' },
      { field: 'Last telemetry', value: context.state.lastTelemetryAt || '' },
      { field: 'Latest message', value: context.state.latestMessage || '' },
      { field: 'Latest error', value: context.state.latestError || '' }
    ]);
    this.styleWorksheetHeader(summarySheet);

    const countsSheet = workbook.addWorksheet('Counts', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });
    countsSheet.columns = [
      { header: 'Measure', key: 'measure', width: 24 },
      { header: 'Visible', key: 'visible', width: 18 },
      { header: 'Session total', key: 'session', width: 18 }
    ];
    countsSheet.addRows([
      { measure: 'Total items', visible: context.state.visibleCounts.total, session: context.state.cumulativeCounts.total },
      { measure: 'Pills', visible: context.state.visibleCounts.pill, session: context.state.cumulativeCounts.pill },
      { measure: 'Tablets', visible: context.state.visibleCounts.tablet, session: context.state.cumulativeCounts.tablet },
      { measure: 'Medicine', visible: context.state.visibleCounts.medicine, session: context.state.cumulativeCounts.medicine },
      { measure: 'Other', visible: context.state.visibleCounts.other, session: context.state.cumulativeCounts.other }
    ]);
    this.styleWorksheetHeader(countsSheet);

    const visibleLabelsSheet = workbook.addWorksheet('Visible Labels', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });
    visibleLabelsSheet.columns = [
      { header: 'Label', key: 'label', width: 28 },
      { header: 'Count', key: 'count', width: 18 }
    ];
    this.addLabelRows(visibleLabelsSheet, context.state.visibleCounts.byLabel);
    this.styleWorksheetHeader(visibleLabelsSheet);

    const sessionLabelsSheet = workbook.addWorksheet('Session Labels', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });
    sessionLabelsSheet.columns = [
      { header: 'Label', key: 'label', width: 28 },
      { header: 'Count', key: 'count', width: 18 }
    ];
    this.addLabelRows(sessionLabelsSheet, context.state.cumulativeCounts.byLabel);
    this.styleWorksheetHeader(sessionLabelsSheet);

    const eventsSheet = workbook.addWorksheet('Recent Events', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });
    eventsSheet.columns = [
      { header: 'Occurred At', key: 'occurredAt', width: 28 },
      { header: 'Event Type', key: 'eventType', width: 30 },
      { header: 'Payload', key: 'payload', width: 80 }
    ];
    eventsSheet.addRows(
      context.recentEvents.length
        ? context.recentEvents.map((event) => ({
            occurredAt: event.occurredAt,
            eventType: event.eventType,
            payload: this.stringifyPayload(event.payload)
          }))
        : [{ occurredAt: '', eventType: 'No recent events', payload: '' }]
    );
    this.styleWorksheetHeader(eventsSheet);
    eventsSheet.getColumn('payload').alignment = { wrapText: true, vertical: 'top' };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportSummaryDocx(machineCode: string): Promise<Buffer> {
    const context = await this.buildRuntimeSummaryExport(machineCode);

    const document = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              heading: HeadingLevel.TITLE,
              children: [new TextRun('Live Machine Session Summary')]
            }),
            new Paragraph({
              spacing: { after: 240 },
              children: [
                new TextRun({
                  text: `Generated at ${context.generatedAt}`,
                  color: '475569'
                })
              ]
            }),
            new Paragraph({ heading: HeadingLevel.HEADING_1, text: 'Machine Overview' }),
            this.buildDocTable([
              ['Machine code', context.state.machineCode],
              ['Display name', context.state.displayName || 'Vision Counter'],
              ['Location', context.state.location],
              ['Firmware version', context.state.firmwareVersion],
              ['Session ID', context.state.sessionId || 'Not started'],
              ['Control state', context.state.controlState],
              ['Camera state', context.state.cameraState],
              ['Camera index', String(context.state.cameraIndex ?? 'Auto')],
              ['Model', context.state.modelName || context.state.modelKey || 'Not selected'],
              ['Model provider', context.state.modelProvider || ''],
              ['Model path or id', context.state.modelPath || ''],
              ['Frame size', `${context.state.frameWidth || 0} x ${context.state.frameHeight || 0}`],
              ['Frame number', String(context.state.frameNumber)],
              ['Tracked objects', String(context.state.trackedObjectCount)],
              ['FPS', context.state.fps !== null && context.state.fps !== undefined ? context.state.fps.toFixed(1) : ''],
              [
                'Average confidence',
                context.state.averageConfidence !== null && context.state.averageConfidence !== undefined
                  ? context.state.averageConfidence.toFixed(4)
                  : ''
              ]
            ]),
            new Paragraph({ heading: HeadingLevel.HEADING_1, text: 'Counts' }),
            this.buildDocTable([
              ['Visible total', String(context.state.visibleCounts.total)],
              ['Visible pills', String(context.state.visibleCounts.pill)],
              ['Visible tablets', String(context.state.visibleCounts.tablet)],
              ['Visible medicine', String(context.state.visibleCounts.medicine)],
              ['Session total', String(context.state.cumulativeCounts.total)],
              ['Session pills', String(context.state.cumulativeCounts.pill)],
              ['Session tablets', String(context.state.cumulativeCounts.tablet)],
              ['Session medicine', String(context.state.cumulativeCounts.medicine)]
            ]),
            new Paragraph({ heading: HeadingLevel.HEADING_1, text: 'Status' }),
            new Paragraph({
              spacing: { after: 120 },
              children: [new TextRun({ text: `Latest message: ${context.state.latestMessage || 'n/a'}` })]
            }),
            new Paragraph({
              spacing: { after: 240 },
              children: [new TextRun({ text: `Latest error: ${context.state.latestError || 'n/a'}` })]
            }),
            new Paragraph({ heading: HeadingLevel.HEADING_1, text: 'Label Breakdown' }),
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              text: 'Visible labels'
            }),
            ...this.buildDocLabelParagraphs(context.state.visibleCounts.byLabel),
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              text: 'Session labels'
            }),
            ...this.buildDocLabelParagraphs(context.state.cumulativeCounts.byLabel),
            new Paragraph({ heading: HeadingLevel.HEADING_1, text: 'Recent Events' }),
            this.buildEventTable(context.recentEvents)
          ]
        }
      ]
    });

    return Packer.toBuffer(document);
  }

  private async buildRuntimeSummaryExport(machineCode: string): Promise<RuntimeSummaryExportContext> {
    const normalizedCode = machineCode.trim();
    if (!normalizedCode) {
      throw new BadRequestException({ code: 'MACHINE_CODE_REQUIRED', message: 'Machine code is required' });
    }

    const state = await this.details(normalizedCode);
    const machine = await this.prisma.machine.findUnique({
      where: { machineCode: normalizedCode },
      include: {
        events: {
          orderBy: { occurredAt: 'desc' },
          take: 20
        }
      }
    });

    return {
      generatedAt: new Date().toISOString(),
      state,
      recentEvents:
        machine?.events.map((event) => ({
          eventType: event.eventType,
          occurredAt: event.occurredAt.toISOString(),
          payload: event.payload
        })) || []
    };
  }

  private styleWorksheetHeader(worksheet: ExcelJS.Worksheet) {
    const headerRow = worksheet.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font = {
        bold: true,
        color: { argb: 'FFFFFFFF' }
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '0F766E' }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'left',
        wrapText: true
      };
      cell.border = {
        top: { style: 'thin', color: { argb: '0B4F47' } },
        bottom: { style: 'thin', color: { argb: '0B4F47' } }
      };
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }

      row.eachCell((cell) => {
        cell.alignment = {
          vertical: 'top',
          horizontal: 'left',
          wrapText: true
        };
      });
    });
  }

  private addLabelRows(worksheet: ExcelJS.Worksheet, labels: Record<string, number>) {
    const entries = Object.entries(labels).sort(([leftLabel, leftCount], [rightLabel, rightCount]) => {
      if (rightCount !== leftCount) {
        return rightCount - leftCount;
      }

      return leftLabel.localeCompare(rightLabel);
    });

    if (!entries.length) {
      worksheet.addRow({ label: 'No labels recorded', count: 0 });
      return;
    }

    for (const [label, count] of entries) {
      worksheet.addRow({ label, count });
    }
  }

  private stringifyPayload(value: unknown) {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private buildDocTable(rows: Array<[string, string]>) {
    return new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE
      },
      borders: {
        top: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 1 },
        bottom: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 1 },
        left: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 1 },
        right: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 1 },
        insideHorizontal: { style: BorderStyle.SINGLE, color: 'E2E8F0', size: 1 },
        insideVertical: { style: BorderStyle.SINGLE, color: 'E2E8F0', size: 1 }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 32, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'Field', bold: true })]
                })
              ]
            }),
            new TableCell({
              width: { size: 68, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'Value', bold: true })]
                })
              ]
            })
          ]
        }),
        ...rows.map(
          ([label, value]) =>
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 32, type: WidthType.PERCENTAGE },
                  children: [new Paragraph({ text: label || 'n/a' })]
                }),
                new TableCell({
                  width: { size: 68, type: WidthType.PERCENTAGE },
                  children: [new Paragraph({ text: value || 'n/a' })]
                })
              ]
            })
        )
      ]
    });
  }

  private buildDocLabelParagraphs(labels: Record<string, number>) {
    const entries = Object.entries(labels).sort(([leftLabel, leftCount], [rightLabel, rightCount]) => {
      if (rightCount !== leftCount) {
        return rightCount - leftCount;
      }

      return leftLabel.localeCompare(rightLabel);
    });

    if (!entries.length) {
      return [new Paragraph({ spacing: { after: 120 }, text: 'No labels recorded.' })];
    }

    return entries.map(
      ([label, count]) =>
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: `${label}: ${count}` })]
        })
    );
  }

  private buildEventTable(events: RuntimeSummaryExportEvent[]) {
    const rows = events.length
      ? events
      : [
          {
            occurredAt: '',
            eventType: 'No recent events',
            payload: ''
          }
        ];

    return new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE
      },
      borders: {
        top: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 1 },
        bottom: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 1 },
        left: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 1 },
        right: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 1 },
        insideHorizontal: { style: BorderStyle.SINGLE, color: 'E2E8F0', size: 1 },
        insideVertical: { style: BorderStyle.SINGLE, color: 'E2E8F0', size: 1 }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 24, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: [new TextRun({ text: 'Occurred At', bold: true })]
                })
              ]
            }),
            new TableCell({
              width: { size: 26, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: [new TextRun({ text: 'Event Type', bold: true })]
                })
              ]
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: [new TextRun({ text: 'Payload', bold: true })]
                })
              ]
            })
          ]
        }),
        ...rows.map(
          (event) =>
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 24, type: WidthType.PERCENTAGE },
                  children: [new Paragraph({ text: event.occurredAt || 'n/a' })]
                }),
                new TableCell({
                  width: { size: 26, type: WidthType.PERCENTAGE },
                  children: [new Paragraph({ text: event.eventType || 'n/a' })]
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      text: this.stringifyPayload(event.payload).slice(0, 1200) || 'n/a'
                    })
                  ]
                })
              ]
            })
        )
      ]
    });
  }

  private async requestRemoteStart(
    machineCode: string,
    input: StartMachineRuntimeDto,
    context: RuntimeRequestContext
  ): Promise<MachineRuntimeState> {
    const normalizedCode = machineCode.trim();
    if (!normalizedCode) {
      throw new BadRequestException({ code: 'MACHINE_CODE_REQUIRED', message: 'Machine code is required' });
    }

    const control = await this.requireRemoteAgentOnline(normalizedCode);
    const existingMachine = await this.prisma.machine.findUnique({
      where: { machineCode: normalizedCode }
    });
    const catalog = await this.getCatalog();
    const selectedModelKey = input.modelKey?.trim() || catalog.defaultModelKey;
    const selectedModel = catalog.models.find((entry) => entry.key === selectedModelKey);
    if (!selectedModel) {
      throw new BadRequestException({ code: 'MODEL_KEY_INVALID', message: `Model key not found: ${selectedModelKey}` });
    }

    const location = input.location?.trim() || existingMachine?.location || this.defaultLocation;
    const firmwareVersion = input.firmwareVersion?.trim() || existingMachine?.firmwareVersion || this.defaultFirmwareVersion;
    const displayName = input.displayName?.trim() || existingMachine?.displayName || normalizedCode;
    await this.machinesService.register({
      machineCode: normalizedCode,
      location,
      firmwareVersion,
      displayName
    });

    const nextCommandVersion = control.commandVersion + 1;
    const requestedAt = new Date();
    const remoteConfig = this.buildRemoteStartConfig(input);
    await this.prisma.machineRuntimeControl.update({
      where: { machineCode: normalizedCode },
      data: {
        desiredState: MachineRuntimeDesiredState.RUNNING,
        commandVersion: nextCommandVersion,
        status: MachineRuntimeCommandStatus.PENDING,
        config: remoteConfig as Prisma.InputJsonValue,
        requestedAt,
        requestedById: context.requestedByUserId || null,
        lastError: null
      }
    });

    const state = this.ensureState(normalizedCode, {
      displayName,
      location,
      firmwareVersion,
      lastSeen: requestedAt
    });
    state.displayName = displayName;
    state.location = location;
    state.firmwareVersion = firmwareVersion;
    state.controlState = 'STARTING';
    state.cameraState = 'OPENING';
    state.startedAt = state.startedAt || requestedAt.toISOString();
    state.endedAt = null;
    state.cameraIndex = input.cameraIndex ?? state.cameraIndex;
    state.modelKey = selectedModel.key;
    state.modelName = selectedModel.name;
    state.modelProvider = selectedModel.provider;
    state.modelPath = selectedModel.path || selectedModel.modelId || selectedModel.key;
    state.pid = null;
    state.latestError = null;
    state.latestMessage = 'Remote start requested from dashboard.';
    state.visibleCounts = this.createEmptyCounts();
    this.publishRuntimeUpdate('machine.runtime.remote.start.requested', state);
    await this.recordMachineEvent(normalizedCode, 'machine.runtime.remote.start.requested', requestedAt.toISOString(), {
      requestedByUserId: context.requestedByUserId || null,
      commandVersion: nextCommandVersion,
      config: remoteConfig
    });
    return this.toDetail(state);
  }

  private async requestRemoteStop(machineCode: string, context: RuntimeRequestContext): Promise<MachineRuntimeState> {
    const normalizedCode = machineCode.trim();
    if (!normalizedCode) {
      throw new BadRequestException({ code: 'MACHINE_CODE_REQUIRED', message: 'Machine code is required' });
    }

    const control = await this.requireRemoteAgentOnline(normalizedCode);
    const nextCommandVersion = control.commandVersion + 1;
    const requestedAt = new Date();
    await this.prisma.machineRuntimeControl.update({
      where: { machineCode: normalizedCode },
      data: {
        desiredState: MachineRuntimeDesiredState.IDLE,
        commandVersion: nextCommandVersion,
        status: MachineRuntimeCommandStatus.PENDING,
        requestedAt,
        requestedById: context.requestedByUserId || null,
        lastError: null
      }
    });

    const machine = await this.prisma.machine.findUnique({ where: { machineCode: normalizedCode } });
    const state = this.ensureState(normalizedCode, machine || undefined);
    state.controlState = 'STOPPING';
    state.cameraState = 'CLOSED';
    state.pid = null;
    state.visibleCounts = this.createEmptyCounts();
    state.latestMessage = 'Remote stop requested from dashboard.';
    this.publishRuntimeUpdate('machine.runtime.remote.stop.requested', state);
    await this.recordMachineEvent(normalizedCode, 'machine.runtime.remote.stop.requested', requestedAt.toISOString(), {
      requestedByUserId: context.requestedByUserId || null,
      commandVersion: nextCommandVersion
    });
    return this.toDetail(state);
  }

  async start(machineCode: string, input: StartMachineRuntimeDto, context: RuntimeRequestContext = {}): Promise<MachineRuntimeState> {
    if (input.executionMode === 'remote') {
      return this.requestRemoteStart(machineCode, input, context);
    }

    return this.startLocal(machineCode, input);
  }

  private async startLocal(machineCode: string, input: StartMachineRuntimeDto): Promise<MachineRuntimeState> {
    const normalizedCode = machineCode.trim();
    if (!normalizedCode) {
      throw new BadRequestException({ code: 'MACHINE_CODE_REQUIRED', message: 'Machine code is required' });
    }

    const activeContext = this.processContexts.get(normalizedCode);
    if (activeContext && this.isProcessActive(activeContext)) {
      throw new BadRequestException({ code: 'MACHINE_ALREADY_RUNNING', message: 'Machine runtime is already running' });
    }

    if (activeContext) {
      this.disposeContext(normalizedCode, activeContext);
    }

    const existingMachine = await this.prisma.machine.findUnique({
      where: { machineCode: normalizedCode }
    });
    const catalog = await this.getCatalog();
    const selectedModelKey = input.modelKey?.trim() || catalog.defaultModelKey;
    const selectedModel = catalog.models.find((entry) => entry.key === selectedModelKey);
    if (!selectedModel) {
      throw new BadRequestException({ code: 'MODEL_KEY_INVALID', message: `Model key not found: ${selectedModelKey}` });
    }
    const roboflowConfig = await this.resolveRoboflowRuntimeConfig();
    const roboflowApiKey = roboflowConfig.apiKey;
    const hasRoboflowApiKey = Boolean(roboflowApiKey);
    const performanceProfile = this.resolvePerformanceProfile(roboflowConfig.deviceProfile);
    const includesRoboflowModels = this.modelIncludesProvider(selectedModel, catalog, 'roboflow');
    if (selectedModel.provider === 'roboflow' && !hasRoboflowApiKey) {
      throw new BadRequestException({
        code: 'ROBOFLOW_API_KEY_REQUIRED',
        message: 'ROBOFLOW_API_KEY is required for Roboflow models'
      });
    }

    const location = input.location?.trim() || existingMachine?.location || this.defaultLocation;
    const firmwareVersion = input.firmwareVersion?.trim() || existingMachine?.firmwareVersion || this.defaultFirmwareVersion;
    const displayName = input.displayName?.trim() || existingMachine?.displayName || normalizedCode;

    await this.machinesService.register({
      machineCode: normalizedCode,
      location,
      firmwareVersion,
      displayName
    });

    const sessionId = randomUUID();
    const state = this.ensureState(normalizedCode, {
      displayName,
      location,
      firmwareVersion,
      lastSeen: new Date()
    });

    state.displayName = displayName;
    state.location = location;
    state.firmwareVersion = firmwareVersion;
    state.sessionId = sessionId;
    state.controlState = 'STARTING';
    state.cameraState = 'OPENING';
    state.startedAt = new Date().toISOString();
    state.endedAt = null;
    state.lastHeartbeatAt = null;
    state.lastTelemetryAt = null;
    state.snapshotUpdatedAt = null;
    state.cameraIndex = input.cameraIndex ?? null;
    state.modelKey = selectedModel.key;
    state.modelName = selectedModel.name;
    state.modelProvider = selectedModel.provider;
    state.modelPath = selectedModel.path || selectedModel.modelId || selectedModel.key;
    state.pid = null;
    state.frameWidth = null;
    state.frameHeight = null;
    state.frameNumber = 0;
    state.trackedObjectCount = 0;
    state.fps = null;
    state.averageConfidence = null;
    state.visibleCounts = this.createEmptyCounts();
    state.cumulativeCounts = this.createEmptyCounts();
    state.latestMessage =
      selectedModel.provider === 'ensemble' && includesRoboflowModels && !hasRoboflowApiKey
        ? `Launching ${selectedModel.name} in free local mode. Roboflow components will be skipped until ROBOFLOW_API_KEY is configured.`
        : `Launching vision runtime with ${selectedModel.name}...`;
    state.latestError = null;
    state.snapshotDataUrl = null;
    state.logTail = [];

    const mlProjectPath = this.resolveMlProjectPath();
    const bridgeScriptPath = this.resolveBridgeScriptPath(mlProjectPath);
    const baseModelCatalogPath = this.resolveModelCatalogPath(mlProjectPath);
    this.assertPathExists(mlProjectPath, 'ML_PROJECT_NOT_FOUND', 'ML project path not found');
    this.assertPathExists(bridgeScriptPath, 'ML_BRIDGE_NOT_FOUND', 'ML bridge script not found');
    this.assertPathExists(baseModelCatalogPath, 'ML_MODEL_CATALOG_NOT_FOUND', 'ML model catalog not found');
    const modelCatalogPath = this.prepareMergedCatalogPath(mlProjectPath, catalog);

    const args = [
      bridgeScriptPath,
      '--machine-code',
      normalizedCode,
      '--location',
      location,
      '--firmware-version',
      firmwareVersion,
      '--display-name',
      displayName,
      '--model-key',
      selectedModelKey,
      '--catalog-path',
      modelCatalogPath,
      '--frame-width',
      String(performanceProfile.frameWidth),
      '--frame-height',
      String(performanceProfile.frameHeight),
      '--inference-size',
      String(performanceProfile.inferenceSize),
      '--snapshot-quality',
      String(performanceProfile.snapshotQuality)
    ];

    if (typeof input.cameraIndex === 'number') {
      args.push('--camera-index', String(input.cameraIndex));
    }

    if (typeof input.confidenceThreshold === 'number') {
      args.push('--confidence-threshold', String(input.confidenceThreshold));
    }

    if (typeof input.iouThreshold === 'number') {
      args.push('--iou-threshold', String(input.iouThreshold));
    }

    if (typeof input.brightness === 'number') {
      args.push('--brightness', String(input.brightness));
    }

    if (typeof input.contrast === 'number') {
      args.push('--contrast', String(input.contrast));
    }

    if (typeof input.gamma === 'number') {
      args.push('--gamma', String(input.gamma));
    }

    if (typeof input.sharpness === 'number') {
      args.push('--sharpness', String(input.sharpness));
    }

    if (typeof input.exposure === 'number') {
      args.push('--exposure', String(input.exposure));
    }

    if (typeof input.gain === 'number') {
      args.push('--gain', String(input.gain));
    }

    const telemetryIntervalMs =
      typeof input.telemetryIntervalMs === 'number'
        ? Math.max(input.telemetryIntervalMs, performanceProfile.telemetryIntervalMs)
        : performanceProfile.telemetryIntervalMs;
    args.push('--telemetry-interval-ms', String(telemetryIntervalMs));

    const snapshotIntervalMs =
      typeof input.snapshotIntervalMs === 'number'
        ? Math.max(input.snapshotIntervalMs, performanceProfile.snapshotIntervalMs)
        : performanceProfile.snapshotIntervalMs;
    args.push('--snapshot-interval-ms', String(snapshotIntervalMs));

    const child = spawn(this.defaultPythonExecutable, args, {
      cwd: mlProjectPath,
      env: {
        ...process.env,
        ROBOFLOW_API_KEY: roboflowApiKey,
        ROBOFLOW_INFERENCE_SERVER_URL: roboflowConfig.inferenceServerUrl,
        ML_DEVICE_PROFILE: roboflowConfig.deviceProfile,
        PYTHONUNBUFFERED: '1'
      }
    });

    const stdout = createInterface({ input: child.stdout });
    const stderr = createInterface({ input: child.stderr });

    const context: RuntimeProcessContext = {
      child,
      stdout,
      stderr,
      sessionId,
      lastHeartbeatPersistAt: 0
    };

    this.processContexts.set(normalizedCode, context);

    stdout.on('line', (line) => {
      void this.handleStdoutLine(normalizedCode, sessionId, line);
    });

    stderr.on('line', (line) => {
      this.handleStderrLine(normalizedCode, sessionId, line);
    });

    child.on('error', (error) => {
      void this.handleProcessFailure(normalizedCode, sessionId, error);
    });

    child.on('exit', (code, signal) => {
      void this.handleProcessExit(normalizedCode, sessionId, code, signal);
    });

    state.pid = child.pid || null;
    this.publishRuntimeUpdate('machine.runtime.session.starting', state);

    return this.toDetail(state);
  }

  async stop(machineCode: string, input: StopMachineRuntimeDto = {}, context: RuntimeRequestContext = {}): Promise<MachineRuntimeState> {
    if (input.executionMode === 'remote') {
      return this.requestRemoteStop(machineCode, context);
    }

    return this.stopLocal(machineCode);
  }

  private async stopLocal(machineCode: string): Promise<MachineRuntimeState> {
    const normalizedCode = machineCode.trim();
    const state = this.runtimeStates.get(normalizedCode);
    const context = this.processContexts.get(normalizedCode);

    if (!state && !context) {
      throw new NotFoundException({ code: 'MACHINE_RUNTIME_NOT_FOUND', message: 'Machine runtime not found' });
    }

    if (state) {
      state.controlState = 'STOPPING';
      state.cameraState = 'CLOSED';
      state.latestMessage = 'Stopping vision runtime...';
      this.publishRuntimeUpdate('machine.runtime.session.stopping', state);
    }

    if (context && this.isProcessActive(context)) {
      const killed = context.child.kill();
      if (!killed) {
        this.logger.warn(`Unable to terminate runtime process for ${normalizedCode} gracefully.`);
      }

      context.forceKillTimer = setTimeout(() => {
        if (this.isProcessActive(context)) {
          context.child.kill('SIGKILL');
        }
      }, 5000);
    }

    if (!context && state) {
      state.controlState = 'IDLE';
      state.cameraState = 'CLOSED';
      state.endedAt = new Date().toISOString();
    }

    return state ? this.toDetail(state) : this.details(normalizedCode);
  }

  private ensureState(
    machineCode: string,
    machine?: { displayName: string | null; location: string; firmwareVersion: string; lastSeen?: Date | null }
  ) {
    const existing = this.runtimeStates.get(machineCode);
    if (existing) {
      if (machine) {
        existing.displayName = machine.displayName ?? existing.displayName;
        existing.location = machine.location;
        existing.firmwareVersion = machine.firmwareVersion;
        if (!existing.lastHeartbeatAt && machine.lastSeen) {
          existing.lastHeartbeatAt = machine.lastSeen.toISOString();
        }
      }

      return existing;
    }

    const created: MachineRuntimeState = {
      machineCode,
      displayName: machine?.displayName ?? null,
      location: machine?.location ?? this.defaultLocation,
      firmwareVersion: machine?.firmwareVersion ?? this.defaultFirmwareVersion,
      sessionId: null,
      controlState: 'IDLE',
      cameraState: 'CLOSED',
      startedAt: null,
      endedAt: null,
      lastHeartbeatAt: machine?.lastSeen ? machine.lastSeen.toISOString() : null,
      lastTelemetryAt: null,
      snapshotUpdatedAt: null,
      cameraIndex: null,
      modelKey: null,
      modelName: null,
      modelProvider: null,
      modelPath: null,
      pid: null,
      frameWidth: null,
      frameHeight: null,
      frameNumber: 0,
      trackedObjectCount: 0,
      fps: null,
      averageConfidence: null,
      visibleCounts: this.createEmptyCounts(),
      cumulativeCounts: this.createEmptyCounts(),
      latestMessage: null,
      latestError: null,
      snapshotDataUrl: null,
      logTail: []
    };

    this.runtimeStates.set(machineCode, created);
    return created;
  }

  private createEmptyCounts(): MachineRuntimeCounts {
    return {
      total: 0,
      pill: 0,
      tablet: 0,
      medicine: 0,
      other: 0,
      byLabel: {}
    };
  }

  private toSummary(state: MachineRuntimeState): MachineRuntimeStateSummary {
    return {
      machineCode: state.machineCode,
      displayName: state.displayName,
      location: state.location,
      firmwareVersion: state.firmwareVersion,
      sessionId: state.sessionId,
      controlState: state.controlState,
      cameraState: state.cameraState,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      lastHeartbeatAt: state.lastHeartbeatAt,
      lastTelemetryAt: state.lastTelemetryAt,
      snapshotUpdatedAt: state.snapshotUpdatedAt,
      cameraIndex: state.cameraIndex,
      modelKey: state.modelKey,
      modelName: state.modelName,
      modelProvider: state.modelProvider,
      modelPath: state.modelPath,
      pid: state.pid,
      frameWidth: state.frameWidth,
      frameHeight: state.frameHeight,
      frameNumber: state.frameNumber,
      trackedObjectCount: state.trackedObjectCount,
      fps: state.fps,
      averageConfidence: state.averageConfidence,
      visibleCounts: this.cloneCounts(state.visibleCounts),
      cumulativeCounts: this.cloneCounts(state.cumulativeCounts),
      latestMessage: state.latestMessage,
      latestError: state.latestError
    };
  }

  private toDetail(state: MachineRuntimeState): MachineRuntimeState {
    return {
      ...this.toSummary(state),
      snapshotDataUrl: state.snapshotDataUrl,
      logTail: [...state.logTail]
    };
  }

  private normalizeRemoteControlState(controlState?: string, endedAtUtc?: string, latestError?: string): MachineRuntimeControlState {
    const normalized = String(controlState || '').trim().toUpperCase();
    if (normalized === 'IDLE' || normalized === 'STARTING' || normalized === 'RUNNING' || normalized === 'STOPPING' || normalized === 'ERROR') {
      return normalized;
    }

    if (this.readString(latestError)) {
      return 'ERROR';
    }

    if (this.readString(endedAtUtc)) {
      return 'IDLE';
    }

    return 'RUNNING';
  }

  private normalizeRemoteCameraState(cameraState: string | undefined, controlState: MachineRuntimeControlState): MachineCameraState {
    const normalized = String(cameraState || '').trim().toUpperCase();
    if (normalized === 'CLOSED' || normalized === 'OPENING' || normalized === 'OPEN' || normalized === 'ERROR') {
      return normalized;
    }

    if (controlState === 'ERROR') {
      return 'ERROR';
    }

    if (controlState === 'RUNNING' || controlState === 'STARTING' || controlState === 'STOPPING') {
      return 'OPEN';
    }

    return 'CLOSED';
  }

  private async requireRemoteAgentOnline(machineCode: string) {
    const control = await this.prisma.machineRuntimeControl.findUnique({
      where: { machineCode }
    });
    if (!control?.agentHeartbeatAt) {
      throw new ServiceUnavailableException({
        code: 'REMOTE_AGENT_OFFLINE',
        message: 'Remote Raspberry Pi agent is offline. Start the Pi control agent first.'
      });
    }

    const elapsedMs = Date.now() - control.agentHeartbeatAt.getTime();
    if (elapsedMs > this.agentOfflineThresholdMs) {
      throw new ServiceUnavailableException({
        code: 'REMOTE_AGENT_OFFLINE',
        message: 'Remote Raspberry Pi agent heartbeat is stale. Check the Pi control agent service.'
      });
    }

    return control;
  }

  private buildRemoteStartConfig(input: StartMachineRuntimeDto): Record<string, unknown> {
    return {
      cameraIndex: input.cameraIndex ?? null,
      modelKey: input.modelKey?.trim() || null,
      displayName: input.displayName?.trim() || null,
      location: input.location?.trim() || null,
      firmwareVersion: input.firmwareVersion?.trim() || null
    };
  }

  private applyRemoteAgentHeartbeat(
    state: MachineRuntimeState,
    runtimeState: MachineRuntimeControlState,
    input: { message?: string; error?: string; pid?: number | null; occurredAtIso: string }
  ) {
    state.controlState = runtimeState;
    state.cameraState = this.normalizeRemoteCameraState(undefined, runtimeState);
    state.lastHeartbeatAt = input.occurredAtIso;
    state.pid = input.pid ?? null;
    if (runtimeState === 'IDLE' || runtimeState === 'STOPPING' || runtimeState === 'ERROR') {
      state.visibleCounts = this.createEmptyCounts();
      state.frameNumber = runtimeState === 'ERROR' ? state.frameNumber : 0;
      state.trackedObjectCount = runtimeState === 'ERROR' ? state.trackedObjectCount : 0;
      state.fps = runtimeState === 'ERROR' ? state.fps : null;
      state.averageConfidence = runtimeState === 'ERROR' ? state.averageConfidence : null;
      if (runtimeState !== 'STOPPING') {
        state.endedAt = state.endedAt || input.occurredAtIso;
      }
    } else if (runtimeState === 'STARTING' || runtimeState === 'RUNNING') {
      state.startedAt = state.startedAt || input.occurredAtIso;
      state.endedAt = null;
    }

    if (input.error) {
      state.latestError = input.error;
      state.latestMessage = input.error;
    } else {
      state.latestError = runtimeState === 'ERROR' ? state.latestError : null;
      if (input.message) {
        state.latestMessage = input.message;
      } else if (runtimeState === 'IDLE') {
        state.latestMessage = 'Remote Raspberry Pi agent is online.';
      } else if (runtimeState === 'STARTING') {
        state.latestMessage = 'Remote machine runtime is starting.';
      } else if (runtimeState === 'STOPPING') {
        state.latestMessage = 'Remote machine runtime is stopping.';
      }
    }
  }

  private toRemoteControlSnapshot(control: {
    machineCode: string;
    desiredState: MachineRuntimeDesiredState;
    commandVersion: number;
    status: MachineRuntimeCommandStatus;
    config: unknown;
    requestedAt: Date;
    appliedCommandVersion: number;
    appliedAt: Date | null;
    lastError: string | null;
    agentHeartbeatAt: Date | null;
    agentRuntimeState: string | null;
    agentMessage: string | null;
  }): RemoteControlSnapshot {
    return {
      machineCode: control.machineCode,
      desiredState: control.desiredState,
      commandVersion: control.commandVersion,
      status: control.status,
      config: control.config && typeof control.config === 'object' && !Array.isArray(control.config) ? (control.config as Record<string, unknown>) : null,
      requestedAt: control.requestedAt?.toISOString?.() || null,
      appliedCommandVersion: control.appliedCommandVersion,
      appliedAt: control.appliedAt?.toISOString?.() || null,
      lastError: control.lastError,
      agentHeartbeatAt: control.agentHeartbeatAt?.toISOString?.() || null,
      agentRuntimeState: control.agentRuntimeState,
      agentMessage: control.agentMessage
    };
  }

  private cloneCounts(counts: MachineRuntimeCounts): MachineRuntimeCounts {
    return {
      total: counts.total,
      pill: counts.pill,
      tablet: counts.tablet,
      medicine: counts.medicine,
      other: counts.other,
      byLabel: { ...counts.byLabel }
    };
  }

  private resolveMlProjectPath() {
    return resolve(this.defaultMlProjectPath);
  }

  private resolveBridgeScriptPath(mlProjectPath: string) {
    const configuredPath = this.configService.get<string>('ML_BRIDGE_SCRIPT_PATH');
    return resolve(configuredPath || join(mlProjectPath, 'live_runtime_bridge.py'));
  }

  private resolveModelCatalogPath(mlProjectPath: string) {
    const configuredPath = this.configService.get<string>('ML_MODEL_CATALOG_PATH');
    return resolve(configuredPath || join(mlProjectPath, 'model_catalog.json'));
  }

  private prepareMergedCatalogPath(mlProjectPath: string, catalog: MachineRuntimeModelCatalog) {
    const generatedCatalogPath = resolve(join(mlProjectPath, 'runtime_catalog.generated.json'));
    writeFileSync(generatedCatalogPath, JSON.stringify(catalog, null, 2), 'utf-8');
    return generatedCatalogPath;
  }

  private async resolveRoboflowRuntimeConfig() {
    const stored = await this.appSettingsService.getRoboflowRuntimeConfig();
    const envApiKey = String(this.configService.get('ROBOFLOW_API_KEY') || '').trim();
    const envInferenceServerUrl = String(this.configService.get('ROBOFLOW_INFERENCE_SERVER_URL') || '').trim();
    const envDeviceProfile = String(this.configService.get('ML_DEVICE_PROFILE') || '').trim();

    return {
      ...stored,
      apiKey: envApiKey || stored.apiKey,
      inferenceServerUrl: envInferenceServerUrl || stored.inferenceServerUrl,
      deviceProfile: envDeviceProfile === 'raspberry-pi-5' ? 'raspberry-pi-5' : stored.deviceProfile
    };
  }

  private resolvePerformanceProfile(deviceProfile: 'desktop' | 'raspberry-pi-5') {
    if (deviceProfile === 'raspberry-pi-5') {
      return {
        frameWidth: 640,
        frameHeight: 480,
        inferenceSize: 416,
        snapshotQuality: 42,
        telemetryIntervalMs: 1000,
        snapshotIntervalMs: 2000
      };
    }

    return {
      frameWidth: 960,
      frameHeight: 540,
      inferenceSize: 640,
      snapshotQuality: 58,
      telemetryIntervalMs: 750,
      snapshotIntervalMs: 1500
    };
  }

  private parseCameraCatalogOutput(output: string): MachineRuntimeCameraSource[] {
    const trimmed = output.trim();
    if (!trimmed) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      const arrayStart = trimmed.indexOf('[');
      const arrayEnd = trimmed.lastIndexOf(']');
      const objectStart = trimmed.indexOf('{');
      const objectEnd = trimmed.lastIndexOf('}');
      const candidate =
        arrayStart >= 0 && arrayEnd > arrayStart
          ? trimmed.slice(arrayStart, arrayEnd + 1)
          : objectStart >= 0 && objectEnd > objectStart
            ? trimmed.slice(objectStart, objectEnd + 1)
            : '';
      if (!candidate) {
        return [];
      }

      parsed = JSON.parse(candidate) as unknown;
    }

    const rawSources = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).cameras)
        ? ((parsed as Record<string, unknown>).cameras as unknown[])
        : [];

    return rawSources
      .map((entry) => this.normalizeCameraSource(entry))
      .filter((entry): entry is MachineRuntimeCameraSource => entry !== null);
  }

  private normalizeCameraSource(value: unknown): MachineRuntimeCameraSource | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const raw = value as Record<string, unknown>;
    const index = this.readInteger(raw.index);
    if (index === null || index < 0) {
      return null;
    }

    return {
      index,
      name: this.readString(raw.name) || `Camera ${index}`,
      width: this.readInteger(raw.width),
      height: this.readInteger(raw.height)
    };
  }

  private modelIncludesProvider(
    model: MachineRuntimeModelCatalog['models'][number],
    catalog: MachineRuntimeModelCatalog,
    provider: MachineRuntimeModelCatalog['models'][number]['provider'],
    visited = new Set<string>()
  ): boolean {
    if (visited.has(model.key)) {
      return false;
    }

    visited.add(model.key);
    if (model.provider === provider) {
      return true;
    }

    if (model.provider !== 'ensemble' || !model.components?.length) {
      return false;
    }

    return model.components.some((componentKey): boolean => {
      const component = catalog.models.find((entry) => entry.key === componentKey);
      return component ? this.modelIncludesProvider(component, catalog, provider, visited) : false;
    });
  }

  private assertPathExists(targetPath: string, code: string, message: string) {
    if (!existsSync(targetPath)) {
      throw new InternalServerErrorException({
        code,
        message: `${message}: ${targetPath}`
      });
    }
  }

  private isProcessActive(context: RuntimeProcessContext) {
    return context.child.exitCode === null && !context.child.killed;
  }

  private appendLog(state: MachineRuntimeState, message: string) {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    state.logTail = [...state.logTail.slice(-19), trimmed];
  }

  private handleStderrLine(machineCode: string, sessionId: string, line: string) {
    const context = this.processContexts.get(machineCode);
    const state = this.runtimeStates.get(machineCode);
    if (!context || context.sessionId !== sessionId || !state || state.sessionId !== sessionId) {
      return;
    }

    this.appendLog(state, `[stderr] ${line}`);
    if (!state.latestMessage) {
      state.latestMessage = line.trim();
    }
  }

  private async handleStdoutLine(machineCode: string, sessionId: string, line: string) {
    const context = this.processContexts.get(machineCode);
    const state = this.runtimeStates.get(machineCode);
    if (!context || context.sessionId !== sessionId || !state || state.sessionId !== sessionId) {
      return;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    try {
      const parsed = JSON.parse(trimmed) as BridgeMessage;
      await this.handleBridgeMessage(machineCode, sessionId, parsed);
    } catch (_error) {
      this.appendLog(state, `[stdout] ${trimmed}`);
    }
  }

  private async handleBridgeMessage(machineCode: string, sessionId: string, message: BridgeMessage) {
    const context = this.processContexts.get(machineCode);
    const state = this.runtimeStates.get(machineCode);
    if (!context || context.sessionId !== sessionId || !state || state.sessionId !== sessionId) {
      return;
    }

    const emittedAt = this.normalizeTimestamp(message.emittedAt);
    const payload = message.payload || {};

    if (message.type === 'bridge.ready') {
      state.latestMessage = this.readString(payload.message) || 'Vision bridge initialized.';
      state.modelKey = this.readString(payload.modelKey) || state.modelKey;
      state.modelName = this.readString(payload.modelName) || state.modelName;
      state.modelProvider = this.readString(payload.modelProvider) || state.modelProvider;
      state.modelPath = this.readString(payload.modelPath) || state.modelPath;
      this.publishRuntimeUpdate('machine.runtime.bridge.ready', state);
      return;
    }

    if (message.type === 'camera.opened') {
      state.controlState = 'RUNNING';
      state.cameraState = 'OPEN';
      state.cameraIndex = this.readInteger(payload.cameraIndex) ?? state.cameraIndex;
      state.frameWidth = this.readInteger(payload.frameWidth) ?? state.frameWidth;
      state.frameHeight = this.readInteger(payload.frameHeight) ?? state.frameHeight;
      state.modelKey = this.readString(payload.modelKey) || state.modelKey;
      state.modelName = this.readString(payload.modelName) || state.modelName;
      state.modelProvider = this.readString(payload.modelProvider) || state.modelProvider;
      state.modelPath = this.readString(payload.modelPath) || state.modelPath;
      state.lastHeartbeatAt = emittedAt;
      state.latestMessage = this.readString(payload.message) || 'Camera opened.';
      await this.recordMachineEvent(machineCode, 'machine.session.started', emittedAt, {
        sessionId,
        cameraIndex: state.cameraIndex,
        frameWidth: state.frameWidth,
        frameHeight: state.frameHeight,
        modelPath: state.modelPath
      });
      this.publishRuntimeUpdate('machine.runtime.session.started', state);
      return;
    }

    if (message.type === 'telemetry') {
      this.applyTelemetry(state, payload, emittedAt);
      await this.persistHeartbeatIfDue(machineCode, state, context, emittedAt);
      this.publishRuntimeUpdate('machine.runtime.telemetry', state);
      return;
    }

    if (message.type === 'warning') {
      const warningMessage = this.readString(payload.message) || 'Vision bridge warning.';
      state.latestMessage = warningMessage;
      this.appendLog(state, `[warning] ${warningMessage}`);
      this.publishRuntimeUpdate('machine.runtime.warning', state);
      return;
    }

    if (message.type === 'error') {
      const errorMessage = this.readString(payload.message) || 'Vision bridge reported an error.';
      state.controlState = 'ERROR';
      state.cameraState = 'ERROR';
      state.endedAt = emittedAt;
      state.latestError = errorMessage;
      state.latestMessage = errorMessage;
      this.appendLog(state, `[error] ${errorMessage}`);
      await this.recordMachineEvent(machineCode, 'machine.error', emittedAt, {
        sessionId,
        message: errorMessage,
        details: payload
      });
      this.publishRuntimeUpdate('machine.runtime.error', state);
      return;
    }

    if (message.type === 'session.stopped') {
      state.controlState = 'IDLE';
      state.cameraState = 'CLOSED';
      state.endedAt = emittedAt;
      state.pid = null;
      state.latestMessage = this.readString(payload.message) || 'Vision runtime stopped.';
      await this.recordMachineEvent(machineCode, 'machine.session.stopped', emittedAt, {
        sessionId,
        reason: this.readString(payload.reason) || 'stopped'
      });
      this.publishRuntimeUpdate('machine.runtime.session.stopped', state);
      return;
    }

    this.appendLog(state, `[bridge] ${message.type}`);
  }

  private applyTelemetry(state: MachineRuntimeState, payload: Record<string, unknown>, emittedAt: string) {
    state.controlState = 'RUNNING';
    state.cameraState = 'OPEN';
    state.lastHeartbeatAt = emittedAt;
    state.lastTelemetryAt = emittedAt;
    state.frameNumber = this.readInteger(payload.frameNumber) ?? state.frameNumber;
    state.trackedObjectCount = this.readInteger(payload.trackedObjectCount) ?? state.trackedObjectCount;
    state.fps = this.readFloat(payload.fps) ?? state.fps;
    state.averageConfidence = this.readFloat(payload.averageConfidence) ?? state.averageConfidence;
    state.cameraIndex = this.readInteger(payload.cameraIndex) ?? state.cameraIndex;
    state.frameWidth = this.readInteger(payload.frameWidth) ?? state.frameWidth;
    state.frameHeight = this.readInteger(payload.frameHeight) ?? state.frameHeight;
    state.modelKey = this.readString(payload.modelKey) || state.modelKey;
    state.modelName = this.readString(payload.modelName) || state.modelName;
    state.modelProvider = this.readString(payload.modelProvider) || state.modelProvider;
    state.location = this.readString(payload.location) || state.location;
    state.firmwareVersion = this.readString(payload.firmwareVersion) || state.firmwareVersion;
    state.modelPath = this.readString(payload.modelPath) || state.modelPath;
    state.visibleCounts = this.normalizeCounts(payload.visibleCounts);
    state.cumulativeCounts = this.normalizeCounts(payload.cumulativeCounts);

    const snapshotDataUrl = this.readString(payload.snapshotDataUrl);
    if (snapshotDataUrl) {
      state.snapshotDataUrl = snapshotDataUrl;
      state.snapshotUpdatedAt = emittedAt;
    }

    state.latestMessage = this.readString(payload.message) || `Visible ${state.visibleCounts.total} item(s)`;
  }

  private async persistHeartbeatIfDue(
    machineCode: string,
    state: MachineRuntimeState,
    context: RuntimeProcessContext,
    occurredAt: string
  ) {
    const now = Date.now();
    if (now - context.lastHeartbeatPersistAt < this.heartbeatPersistIntervalMs) {
      return;
    }

    context.lastHeartbeatPersistAt = now;

    await this.machinesService.heartbeat(machineCode, {
      machineCode,
      location: state.location,
      firmwareVersion: state.firmwareVersion,
      occurredAt,
      payload: {
        sessionId: state.sessionId,
        controlState: state.controlState,
        cameraState: state.cameraState,
        modelKey: state.modelKey,
        modelName: state.modelName,
        modelProvider: state.modelProvider,
        modelPath: state.modelPath,
        visibleCounts: state.visibleCounts,
        cumulativeCounts: state.cumulativeCounts,
        fps: state.fps,
        averageConfidence: state.averageConfidence,
        frameNumber: state.frameNumber,
        trackedObjectCount: state.trackedObjectCount
      }
    });
  }

  private async handleProcessFailure(machineCode: string, sessionId: string, error: Error) {
    const context = this.processContexts.get(machineCode);
    if (context && context.sessionId === sessionId) {
      this.disposeContext(machineCode, context);
    }

    const state = this.runtimeStates.get(machineCode);
    if (!state || state.sessionId !== sessionId) {
      return;
    }

    state.controlState = 'ERROR';
    state.cameraState = 'ERROR';
    state.endedAt = new Date().toISOString();
    state.pid = null;
    state.latestError = error.message;
    state.latestMessage = error.message;
    this.appendLog(state, `[spawn-error] ${error.message}`);
    await this.recordMachineEvent(machineCode, 'machine.error', state.endedAt, {
      sessionId,
      message: error.message
    });
    this.publishRuntimeUpdate('machine.runtime.error', state);
  }

  private async handleProcessExit(machineCode: string, sessionId: string, code: number | null, signal: NodeJS.Signals | null) {
    const context = this.processContexts.get(machineCode);
    if (context && context.sessionId === sessionId) {
      this.disposeContext(machineCode, context);
    }

    const state = this.runtimeStates.get(machineCode);
    if (!state || state.sessionId !== sessionId) {
      return;
    }

    const endedAt = new Date().toISOString();
    state.pid = null;
    state.endedAt = state.endedAt || endedAt;

    if (state.controlState === 'STOPPING' || state.controlState === 'IDLE') {
      state.controlState = 'IDLE';
      state.cameraState = 'CLOSED';
      state.latestMessage = `Vision runtime stopped${code !== null ? ` (code ${code})` : ''}${signal ? ` (${signal})` : ''}.`;
      this.publishRuntimeUpdate('machine.runtime.process.exited', state);
      return;
    }

    if (code === 0 && state.controlState !== 'ERROR') {
      state.controlState = 'IDLE';
      state.cameraState = 'CLOSED';
      state.latestMessage = 'Vision runtime completed.';
      await this.recordMachineEvent(machineCode, 'machine.session.stopped', endedAt, {
        sessionId,
        exitCode: code
      });
      this.publishRuntimeUpdate('machine.runtime.process.exited', state);
      return;
    }

    state.controlState = 'ERROR';
    state.cameraState = 'ERROR';
    state.latestError = state.latestError || `Vision runtime exited unexpectedly${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}.`;
    state.latestMessage = state.latestError;
    await this.recordMachineEvent(machineCode, 'machine.error', endedAt, {
      sessionId,
      exitCode: code,
      signal,
      message: state.latestError
    });
    this.publishRuntimeUpdate('machine.runtime.error', state);
  }

  private disposeContext(machineCode: string, context: RuntimeProcessContext) {
    if (context.forceKillTimer) {
      clearTimeout(context.forceKillTimer);
    }

    context.stdout.removeAllListeners();
    context.stderr.removeAllListeners();
    context.stdout.close();
    context.stderr.close();
    this.processContexts.delete(machineCode);
  }

  private publishRuntimeUpdate(type: string, state: MachineRuntimeState) {
    this.liveEvents.publish(type, {
      machineCode: state.machineCode,
      sessionId: state.sessionId,
      controlState: state.controlState,
      cameraState: state.cameraState,
      modelKey: state.modelKey,
      modelName: state.modelName,
      modelProvider: state.modelProvider,
      modelPath: state.modelPath,
      visibleCounts: state.visibleCounts,
      cumulativeCounts: state.cumulativeCounts,
      fps: state.fps,
      averageConfidence: state.averageConfidence,
      trackedObjectCount: state.trackedObjectCount,
      frameNumber: state.frameNumber,
      latestError: state.latestError,
      latestMessage: state.latestMessage,
      lastTelemetryAt: state.lastTelemetryAt,
      snapshotUpdatedAt: state.snapshotUpdatedAt
    });
  }

  private async recordMachineEvent(machineCode: string, eventType: string, occurredAt: string, payload: Record<string, unknown>) {
    await this.eventsService.ingestEvent(
      {
        machineId: machineCode,
        eventType,
        idempotencyKey: `${eventType}:${machineCode}:${occurredAt}:${randomUUID()}`,
        occurredAt,
        payload
      },
      {}
    );
  }

  private normalizeTimestamp(value?: string) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString();
    }

    return date.toISOString();
  }

  private normalizeCounts(value: unknown): MachineRuntimeCounts {
    const empty = this.createEmptyCounts();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return empty;
    }

    const raw = value as Record<string, unknown>;
    const byLabel: Record<string, number> = {};
    const rawByLabel = raw.byLabel;

    if (rawByLabel && typeof rawByLabel === 'object' && !Array.isArray(rawByLabel)) {
      for (const [key, entry] of Object.entries(rawByLabel as Record<string, unknown>)) {
        const numericValue = this.readInteger(entry);
        if (numericValue !== null) {
          byLabel[key] = numericValue;
        }
      }
    }

    const pill = this.readInteger(raw.pill) ?? byLabel.pill ?? 0;
    const tablet = this.readInteger(raw.tablet) ?? byLabel.tablet ?? 0;
    const medicine = this.readInteger(raw.medicine) ?? byLabel.medicine ?? 0;
    const other = this.readInteger(raw.other) ?? byLabel.other ?? 0;
    const total =
      this.readInteger(raw.total) ?? Object.values(byLabel).reduce((sum, entry) => sum + entry, pill + tablet + medicine + other);

    return {
      total,
      pill,
      tablet,
      medicine,
      other,
      byLabel
    };
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  private readInteger(value: unknown) {
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    return Math.round(numericValue);
  }

  private readFloat(value: unknown) {
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    return Number(numericValue);
  }
}
