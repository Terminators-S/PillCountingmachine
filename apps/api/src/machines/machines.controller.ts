import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { MachinesService } from './machines.service';
import { RegisterMachineDto } from './dto/register-machine.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('machines')
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @UseGuards(ApiKeyGuard)
  @Post('register')
  register(@Body() input: RegisterMachineDto) {
    return this.machinesService.register(input);
  }

  @UseGuards(ApiKeyGuard)
  @Post(':machineCode/heartbeat')
  heartbeat(@Param('machineCode') machineCode: string, @Body() input: HeartbeatDto) {
    return this.machinesService.heartbeat(machineCode, { ...input, machineCode });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  list() {
    return this.machinesService.list();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':machineCode')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  details(@Param('machineCode') machineCode: string) {
    return this.machinesService.details(machineCode);
  }
}
