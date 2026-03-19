import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventListQueryDto, IngestEventDto } from './dto/event.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@Controller('machine-events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  list(@Query() query: EventListQueryDto) {
    return this.eventsService.listEvents(query);
  }

  @UseGuards(ApiKeyGuard)
  @Post('ingest')
  ingest(@Body() input: IngestEventDto, @Req() req: any) {
    return this.eventsService.ingestEvent(input, {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
  }
}
