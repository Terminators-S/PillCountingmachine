import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  AddEvidenceDto,
  CompleteJobDto,
  CreateJobDto,
  JobProgressDto,
  RecountJobDto,
  StartJobDto
} from './dto/jobs.dto';
import { JobStatus } from '@prisma/client';

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  create(@Body() input: CreateJobDto, @CurrentUser('sub') userId: string) {
    return this.jobsService.create(input, userId);
  }

  @Get()
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  list(@Query('status') status?: JobStatus, @Query('machineId') machineId?: string, @Query('pillTypeId') pillTypeId?: string) {
    return this.jobsService.list({ status, machineId, pillTypeId });
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  details(@Param('id') id: string) {
    return this.jobsService.details(id);
  }

  @Post(':id/start')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  start(@Param('id') id: string, @Body() input: StartJobDto) {
    return this.jobsService.start(id, input);
  }

  @Post(':id/progress')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  progress(@Param('id') id: string, @Body() input: JobProgressDto, @CurrentUser('sub') userId: string) {
    return this.jobsService.progress(id, input, userId);
  }

  @Post(':id/complete')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  complete(@Param('id') id: string, @Body() input: CompleteJobDto, @CurrentUser('sub') userId: string) {
    return this.jobsService.complete(id, input, userId);
  }

  @Post(':id/recount')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  recount(@Param('id') id: string, @Body() input: RecountJobDto, @CurrentUser('sub') userId: string) {
    return this.jobsService.recount(id, input, userId);
  }

  @Post(':id/evidence')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  evidence(@Param('id') id: string, @Body() input: AddEvidenceDto, @CurrentUser('sub') userId: string) {
    return this.jobsService.addEvidence(id, input, userId);
  }
}
