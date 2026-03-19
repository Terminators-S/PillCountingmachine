import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MachineStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LiveEventsService } from '../live/live-events.service';
import { EventsService } from '../events/events.service';
import { RegisterMachineDto } from './dto/register-machine.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';

@Injectable()
export class MachinesService {
  private readonly offlineThresholdMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly liveEvents: LiveEventsService,
    private readonly eventsService: EventsService,
    private readonly configService: ConfigService
  ) {
    this.offlineThresholdMs = Number(this.configService.get('MACHINE_OFFLINE_THRESHOLD_MS') || 45000);
  }

  private computeDisplayStatus(lastSeen: Date | null, status: MachineStatus): MachineStatus {
    if (!lastSeen) {
      return MachineStatus.OFFLINE;
    }

    if (status === MachineStatus.MAINTENANCE) {
      return MachineStatus.MAINTENANCE;
    }

    const isOnline = Date.now() - new Date(lastSeen).getTime() <= this.offlineThresholdMs;
    return isOnline ? MachineStatus.ONLINE : MachineStatus.OFFLINE;
  }

  async register(input: RegisterMachineDto) {
    const now = new Date();
    const machine = await this.prisma.machine.upsert({
      where: { machineCode: input.machineCode },
      update: {
        displayName: input.displayName || null,
        location: input.location,
        firmwareVersion: input.firmwareVersion,
        status: MachineStatus.ONLINE,
        lastSeen: now
      },
      create: {
        machineCode: input.machineCode,
        displayName: input.displayName || null,
        location: input.location,
        firmwareVersion: input.firmwareVersion,
        status: MachineStatus.ONLINE,
        lastSeen: now
      }
    });

    await this.eventsService.ingestEvent(
      {
        machineId: input.machineCode,
        eventType: 'machine.register',
        idempotencyKey: `register:${input.machineCode}:${now.getTime()}`,
        occurredAt: now.toISOString(),
        payload: {
          location: input.location,
          firmwareVersion: input.firmwareVersion,
          displayName: input.displayName || null
        }
      },
      {}
    );

    this.liveEvents.publish('machine.status.changed', {
      machineCode: machine.machineCode,
      status: 'ONLINE',
      lastSeen: now.toISOString()
    });

    return machine;
  }

  async heartbeat(machineCode: string, input: HeartbeatDto) {
    const machine = await this.prisma.machine.findUnique({ where: { machineCode } });
    if (!machine) {
      throw new NotFoundException({ code: 'MACHINE_NOT_FOUND', message: 'Machine not found' });
    }

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    const updated = await this.prisma.machine.update({
      where: { machineCode },
      data: {
        status: MachineStatus.ONLINE,
        lastSeen: occurredAt,
        location: input.location || machine.location,
        firmwareVersion: input.firmwareVersion || machine.firmwareVersion
      }
    });

    await this.eventsService.ingestEvent(
      {
        machineId: machineCode,
        eventType: 'machine.heartbeat',
        idempotencyKey: `heartbeat:${machineCode}:${occurredAt.getTime()}`,
        occurredAt: occurredAt.toISOString(),
        payload: input.payload || {}
      },
      {}
    );

    this.liveEvents.publish('machine.status.changed', {
      machineCode,
      status: 'ONLINE',
      lastSeen: occurredAt.toISOString()
    });

    return updated;
  }

  async list() {
    const rows = await this.prisma.machine.findMany({
      orderBy: { machineCode: 'asc' }
    });

    return rows.map((row) => ({
      ...row,
      displayStatus: this.computeDisplayStatus(row.lastSeen, row.status)
    }));
  }

  async details(machineCode: string) {
    const row = await this.prisma.machine.findUnique({
      where: { machineCode },
      include: {
        events: {
          take: 50,
          orderBy: { occurredAt: 'desc' }
        }
      }
    });

    if (!row) {
      throw new NotFoundException({ code: 'MACHINE_NOT_FOUND', message: 'Machine not found' });
    }

    return {
      ...row,
      displayStatus: this.computeDisplayStatus(row.lastSeen, row.status)
    };
  }
}
