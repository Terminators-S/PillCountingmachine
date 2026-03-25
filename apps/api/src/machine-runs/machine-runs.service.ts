import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMachineRunDto } from './dto/create-machine-run.dto';
import { MachineRunsQueryDto } from './dto/machine-runs-query.dto';

const toJson = (value: unknown) => (value === undefined ? undefined : (value as any));

const toNullableString = (value: unknown) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const toNullableNumber = (value: unknown) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

@Injectable()
export class MachineRunsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateMachineRunDto, context: { ip?: string; userAgent?: string }) {
    const existing = await this.prisma.machineRun.findUnique({
      where: { runId: input.run_id },
      select: { id: true }
    });

    const detectorBackend =
      toNullableString(input.detector_backend) ||
      toNullableString((input.detector || {})['backend']) ||
      'unknown';

    const record = await this.prisma.machineRun.upsert({
      where: { runId: input.run_id },
      create: {
        runId: input.run_id,
        machineName: input.machine_name,
        sourceMode: input.source_mode,
        sourceLabel: toNullableString(input.source_label),
        startedAt: new Date(input.started_at_utc),
        completedAt: new Date(input.completed_at_utc),
        totalCount: input.total_count,
        eventCount: input.event_count,
        runtimeStatus: toNullableString(input.runtime_status) || 'COMPLETED',
        detectorBackend,
        mlRuntimeBackend: toNullableString(input.ml_runtime_backend),
        modelFormat: toNullableString(input.model_format),
        modelKey: toNullableString(input.model_key),
        modelPath: toNullableString(input.model_path),
        averageFps: toNullableNumber(input.average_fps),
        runtimeFps: toNullableNumber(input.runtime_fps),
        countResult: toJson(input.count_result),
        camera: toJson(input.camera),
        detector: toJson(input.detector),
        roi: toJson(input.roi),
        line: toJson(input.line),
        events: toJson(input.events || []),
        evidence: toJson({
          ...(input.evidence || {}),
          received_from_ip: context.ip || null,
          received_user_agent: context.userAgent || null
        }),
        syncState: toJson(input.sync)
      },
      update: {
        machineName: input.machine_name,
        sourceMode: input.source_mode,
        sourceLabel: toNullableString(input.source_label),
        startedAt: new Date(input.started_at_utc),
        completedAt: new Date(input.completed_at_utc),
        totalCount: input.total_count,
        eventCount: input.event_count,
        runtimeStatus: toNullableString(input.runtime_status) || 'COMPLETED',
        detectorBackend,
        mlRuntimeBackend: toNullableString(input.ml_runtime_backend),
        modelFormat: toNullableString(input.model_format),
        modelKey: toNullableString(input.model_key),
        modelPath: toNullableString(input.model_path),
        averageFps: toNullableNumber(input.average_fps),
        runtimeFps: toNullableNumber(input.runtime_fps),
        countResult: toJson(input.count_result),
        camera: toJson(input.camera),
        detector: toJson(input.detector),
        roi: toJson(input.roi),
        line: toJson(input.line),
        events: toJson(input.events || []),
        evidence: toJson({
          ...(input.evidence || {}),
          received_from_ip: context.ip || null,
          received_user_agent: context.userAgent || null
        }),
        syncState: toJson(input.sync),
        receivedAt: new Date()
      }
    });

    return {
      accepted: true,
      deduped: Boolean(existing),
      machineRunId: record.id,
      runId: record.runId,
      receivedAt: record.receivedAt.toISOString()
    };
  }

  async list(query: MachineRunsQueryDto) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize || 25)));
    const textQuery = String(query.query || '').trim();

    const where: any = {
      machineName: query.machineName
        ? {
            contains: query.machineName,
            mode: 'insensitive'
          }
        : undefined,
      runtimeStatus: query.runtimeStatus || undefined,
      AND: textQuery
        ? [
            {
              OR: [
                { machineName: { contains: textQuery, mode: 'insensitive' } },
                { runId: { contains: textQuery, mode: 'insensitive' } },
                { modelKey: { contains: textQuery, mode: 'insensitive' } }
              ]
            }
          ]
        : undefined
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.machineRun.findMany({
        where,
        orderBy: { completedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.machineRun.count({ where })
    ]);

    return {
      page,
      pageSize,
      total,
      rows
    };
  }
}
