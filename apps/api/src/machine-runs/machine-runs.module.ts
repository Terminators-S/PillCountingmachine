import { Module } from '@nestjs/common';
import { MachineRunsController } from './machine-runs.controller';
import { MachineRunsService } from './machine-runs.service';

@Module({
  controllers: [MachineRunsController],
  providers: [MachineRunsService],
  exports: [MachineRunsService]
})
export class MachineRunsModule {}
