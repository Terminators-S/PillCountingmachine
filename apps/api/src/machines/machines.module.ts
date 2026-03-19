import { Module } from '@nestjs/common';
import { MachinesService } from './machines.service';
import { MachinesController } from './machines.controller';
import { LiveModule } from '../live/live.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [LiveModule, EventsModule],
  providers: [MachinesService],
  controllers: [MachinesController],
  exports: [MachinesService]
})
export class MachinesModule {}
