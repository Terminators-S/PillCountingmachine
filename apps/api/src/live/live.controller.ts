import { Controller, Sse, MessageEvent, UseGuards } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { LiveEventsService } from './live-events.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('live')
export class LiveController {
  constructor(private readonly liveEventsService: LiveEventsService) {}

  @UseGuards(JwtAuthGuard)
  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.liveEventsService.asObservable().pipe(
      map((event) => ({
        data: event
      }))
    );
  }
}
