import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuditService } from '../../audit/audit.service';
import { AuditActorType } from '@prisma/client';

@Injectable()
export class AuditMiddleware implements NestMiddleware {
  constructor(private readonly auditService: AuditService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method || '').toUpperCase());
    if (!isWrite || req.path.startsWith('/api/live/events')) {
      next();
      return;
    }

    res.on('finish', async () => {
      if (res.statusCode >= 500) {
        return;
      }

      const user: any = (req as any).user;
      const actorType = user?.kind === 'API_KEY' ? AuditActorType.API_KEY : user?.sub ? AuditActorType.USER : AuditActorType.SYSTEM;
      const resourceIdRaw = req.params?.id ?? req.params?.jobId ?? req.params?.machineId;
      const resourceId = Array.isArray(resourceIdRaw) ? resourceIdRaw[0] : resourceIdRaw || null;

      try {
        await this.auditService.logWrite({
          actorType,
          actorUserId: actorType === AuditActorType.USER ? user?.sub : null,
          actorApiKeyId: actorType === AuditActorType.API_KEY ? user?.apiKeyId || user?.sub : null,
          action: `${req.method} ${req.path}`,
          resourceType: req.path.split('/')[2] || 'unknown',
          resourceId,
          requestId: String(req.headers['x-request-id'] || ''),
          ipAddress: req.ip,
          userAgent: Array.isArray(req.headers['user-agent'])
            ? req.headers['user-agent'][0]
            : req.headers['user-agent'] || '',
          metadata: {
            query: req.query,
            statusCode: res.statusCode
          }
        });
      } catch (_error) {
        // Do not block request lifecycle on audit failures.
      }
    });

    next();
  }
}
