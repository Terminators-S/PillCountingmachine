import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { LiveModule } from '../live/live.module';

@Module({
  imports: [LiveModule],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService]
})
export class InventoryModule {}
