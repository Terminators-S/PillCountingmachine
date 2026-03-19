import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true
      }
    });
  }

  async create(input: CreateApiKeyDto, createdById: string) {
    const raw = `pc_${randomBytes(24).toString('hex')}`;
    const keyPrefix = raw.slice(0, 8);
    const keyHash = createHash('sha256').update(raw).digest('hex');

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: input.name,
        keyPrefix,
        keyHash,
        scopes: input.scopes || ['machine:write', 'events:write'],
        createdById
      }
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      plainKey: raw,
      createdAt: apiKey.createdAt
    };
  }

  async revoke(id: string) {
    const existing = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: 'API_KEY_NOT_FOUND', message: 'API key not found' });
    }

    return this.prisma.apiKey.update({
      where: { id },
      data: { isActive: false }
    });
  }
}
