import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditActorType, Prisma } from '@prisma/client';

interface AuditWriteInput {
  actorType: AuditActorType;
  actorUserId?: string | null;
  actorApiKeyId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

const toJson = (value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined =>
  value ? (value as unknown as Prisma.InputJsonValue) : undefined;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async logWrite(input: AuditWriteInput) {
    await this.prisma.auditLog.create({
      data: {
        actorType: input.actorType,
        actorUserId: input.actorUserId || null,
        actorApiKeyId: input.actorApiKeyId || null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId || null,
        requestId: input.requestId || null,
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent || null,
        metadata: toJson(input.metadata)
      }
    });
  }

  async listLogs(query: {
    actorUserId?: string;
    resourceType?: string;
    action?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    return this.prisma.auditLog.findMany({
      where: {
        actorUserId: query.actorUserId || undefined,
        resourceType: query.resourceType || undefined,
        action: query.action || undefined,
        createdAt: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined
        }
      },
      include: {
        actorUser: {
          select: { id: true, email: true, fullName: true }
        },
        actorApiKey: {
          select: { id: true, name: true, keyPrefix: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }
}
