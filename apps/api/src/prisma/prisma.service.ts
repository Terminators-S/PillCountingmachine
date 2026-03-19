import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const LOCAL_DATABASE_URL = 'postgresql://pillcount:pillcount@localhost:5432/pillcount?schema=public';

function resolveDatabaseUrl() {
  const configuredDatabaseUrl = process.env.DATABASE_URL?.trim();
  if (configuredDatabaseUrl) {
    return configuredDatabaseUrl;
  }

  const requiresExplicitDatabaseUrl = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (requiresExplicitDatabaseUrl) {
    throw new Error('DATABASE_URL is required for hosted API deployments.');
  }

  return LOCAL_DATABASE_URL;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    process.env.DATABASE_URL = resolveDatabaseUrl();
    super();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
