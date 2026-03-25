import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { HeartbeatMachineRuntimeControlDto } from './dto/heartbeat-machine-runtime-control.dto';
import { IngestMachineRuntimeTelemetryDto } from './dto/ingest-machine-runtime-telemetry.dto';
import { RuntimeService } from './runtime.service';

@Controller('machine-runtime')
export class RuntimeIngestController {
  constructor(private readonly runtimeService: RuntimeService) {}

  @UseGuards(ApiKeyGuard)
  @Post(':machineCode/telemetry')
  ingestTelemetry(@Param('machineCode') machineCode: string, @Body() input: IngestMachineRuntimeTelemetryDto, @Req() req: any) {
    return this.runtimeService.ingestRemoteTelemetry(machineCode, input, {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
  }

  @UseGuards(ApiKeyGuard)
  @Post(':machineCode/control/heartbeat')
  heartbeatControl(@Param('machineCode') machineCode: string, @Body() input: HeartbeatMachineRuntimeControlDto, @Req() req: any) {
    return this.runtimeService.heartbeatRemoteControl(machineCode, input, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      apiKeyId: req.user?.apiKeyId
    });
  }
}
