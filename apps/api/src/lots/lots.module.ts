import { Module } from '@nestjs/common';
import { LotsService } from './lots.service';
import { LotsController } from './lots.controller';
import { LiveModule } from '../live/live.module';

@Module({
  imports: [LiveModule],
  providers: [LotsService],
  controllers: [LotsController],
  exports: [LotsService]
})
export class LotsModule {}
