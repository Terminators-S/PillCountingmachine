import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RbacModule } from './rbac/rbac.module';
import { MachinesModule } from './machines/machines.module';
import { EventsModule } from './events/events.module';
import { PillTypesModule } from './pill-types/pill-types.module';
import { LotsModule } from './lots/lots.module';
import { InventoryModule } from './inventory/inventory.module';
import { JobsModule } from './jobs/jobs.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { LiveModule } from './live/live.module';
import { AdminModule } from './admin/admin.module';
import { RuntimeModule } from './runtime/runtime.module';
import { AppSettingsModule } from './app-settings/app-settings.module';
import { MachineRunsModule } from './machine-runs/machine-runs.module';
import { AuditMiddleware } from './common/middleware/audit.middleware';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    RbacModule,
    MachinesModule,
    EventsModule,
    PillTypesModule,
    LotsModule,
    InventoryModule,
    JobsModule,
    ReportsModule,
    AuditModule,
    ApiKeysModule,
    LiveModule,
    AdminModule,
    AppSettingsModule,
    RuntimeModule,
    MachineRunsModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware, AuditMiddleware).forRoutes('*');
  }
}
