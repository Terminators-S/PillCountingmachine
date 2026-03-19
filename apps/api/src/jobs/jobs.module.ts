import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { LiveModule } from '../live/live.module';

@Module({
  imports: [InventoryModule, LiveModule],
  providers: [JobsService],
  controllers: [JobsController],
  exports: [JobsService]
})
export class JobsModule {}
