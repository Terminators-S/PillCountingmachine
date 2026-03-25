import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { MachineRunsService } from './machine-runs.service';
import { CreateMachineRunDto } from './dto/create-machine-run.dto';
import { MachineRunsQueryDto } from './dto/machine-runs-query.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('machine-runs')
export class MachineRunsController {
  constructor(private readonly machineRunsService: MachineRunsService) {}

  @UseGuards(ApiKeyGuard)
  @Post()
  create(@Body() input: CreateMachineRunDto, @Req() req: any) {
    return this.machineRunsService.create(input, {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  list(@Query() query: MachineRunsQueryDto) {
    return this.machineRunsService.list(query);
  }
}
