import { Module } from '@nestjs/common';
import { LiveEventsService } from './live-events.service';
import { LiveController } from './live.controller';

@Module({
  providers: [LiveEventsService],
  controllers: [LiveController],
  exports: [LiveEventsService]
})
export class LiveModule {}
