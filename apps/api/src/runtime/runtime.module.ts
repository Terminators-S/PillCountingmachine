import { Module } from '@nestjs/common';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { EventsModule } from '../events/events.module';
import { LiveModule } from '../live/live.module';
import { MachinesModule } from '../machines/machines.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RuntimeController } from './runtime.controller';
import { RuntimeService } from './runtime.service';

@Module({
  imports: [PrismaModule, MachinesModule, EventsModule, LiveModule, AppSettingsModule],
  controllers: [RuntimeController],
  providers: [RuntimeService],
  exports: [RuntimeService]
})
export class RuntimeModule {}
