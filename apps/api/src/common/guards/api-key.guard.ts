import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const incomingKey = String(request.headers['x-api-key'] || '').trim();

    if (!incomingKey) {
      throw new UnauthorizedException({ code: 'API_KEY_REQUIRED', message: 'x-api-key header is required' });
    }

    const keyPrefix = incomingKey.slice(0, 8);
    const apiKey = await this.prisma.apiKey.findUnique({ where: { keyPrefix } });

    if (!apiKey || !apiKey.isActive) {
      throw new UnauthorizedException({ code: 'API_KEY_INVALID', message: 'Invalid API key' });
    }

    const incomingHash = createHash('sha256').update(incomingKey).digest('hex');
    const isMatch = timingSafeEqual(Buffer.from(incomingHash), Buffer.from(apiKey.keyHash));

    if (!isMatch) {
      throw new UnauthorizedException({ code: 'API_KEY_INVALID', message: 'Invalid API key' });
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() }
    });

    request.user = {
      sub: apiKey.id,
      roles: ['API_ONLY'],
      kind: 'API_KEY',
      apiKeyId: apiKey.id
    };

    return true;
  }
}
