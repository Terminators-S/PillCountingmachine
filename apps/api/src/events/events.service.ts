import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IngestEventDto } from './dto/event.dto';
import { LiveEventsService } from '../live/live-events.service';
import { MachineStatus, Prisma } from '@prisma/client';

const toJson = (value: Record<string, unknown> | undefined): Prisma.InputJsonValue =>
  (value || {}) as unknown as Prisma.InputJsonValue;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveEvents: LiveEventsService
  ) {}

  async ingestEvent(input: IngestEventDto, context: { ip?: string; userAgent?: string }) {
    const machine = await this.prisma.machine.findUnique({ where: { machineCode: input.machineId } });
    if (!machine) {
      throw new Error('Machine not found. Register machine first.');
    }

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    try {
      const event = await this.prisma.machineEvent.create({
        data: {
          machineId: machine.id,
          eventType: input.eventType,
          idempotencyKey: input.idempotencyKey,
          occurredAt,
          payload: toJson(input.payload),
          sourceIp: context.ip || null,
          sourceUserAgent: context.userAgent || null
        }
      });

      await this.prisma.machine.update({
        where: { id: machine.id },
        data: {
          status: MachineStatus.ONLINE,
          lastSeen: occurredAt
        }
      });

      this.liveEvents.publish('machine.event', {
        machineCode: machine.machineCode,
        eventType: input.eventType,
        occurredAt: occurredAt.toISOString()
      });

      if (String(input.eventType).toLowerCase() === 'machine.error') {
        this.liveEvents.publish('machine.error', {
          machineCode: machine.machineCode,
          payload: input.payload || {}
        });
      }

      return {
        accepted: true,
        deduped: false,
        eventId: event.id
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.machineEvent.findUnique({
          where: { idempotencyKey: input.idempotencyKey }
        });

        return {
          accepted: true,
          deduped: true,
          eventId: existing?.id || null
        };
      }

      throw error;
    }
  }

  async listEvents(query: {
    machineId?: string;
    eventType?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize || 25)));

    const where: Prisma.MachineEventWhereInput = {
      machine: query.machineId ? { machineCode: query.machineId } : undefined,
      eventType: query.eventType || undefined,
      occurredAt: {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined
      }
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.machineEvent.findMany({
        where,
        include: {
          machine: {
            select: {
              id: true,
              machineCode: true,
              location: true,
              firmwareVersion: true
            }
          }
        },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.machineEvent.count({ where })
    ]);

    return {
      page,
      pageSize,
      total,
      rows
    };
  }
}
