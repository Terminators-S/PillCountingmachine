import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StartMachineRuntimeDto } from './dto/start-machine-runtime.dto';
import { StopMachineRuntimeDto } from './dto/stop-machine-runtime.dto';
import { RuntimeService } from './runtime.service';

@Controller('machine-runtime')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RuntimeController {
  constructor(private readonly runtimeService: RuntimeService) {}

  @Get()
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  list() {
    return this.runtimeService.listStates();
  }

  @Get('catalog/models')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  catalog() {
    return this.runtimeService.getCatalog();
  }

  @Get('catalog/cameras')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  cameras() {
    return this.runtimeService.listCameras();
  }

  @Post(':machineCode/start')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  start(@Param('machineCode') machineCode: string, @Body() input: StartMachineRuntimeDto, @Req() req: any) {
    return this.runtimeService.start(machineCode, input, { requestedByUserId: req.user?.sub });
  }

  @Post(':machineCode/stop')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  stop(@Param('machineCode') machineCode: string, @Body() input: StopMachineRuntimeDto, @Req() req: any) {
    return this.runtimeService.stop(machineCode, input, { requestedByUserId: req.user?.sub });
  }

  @Get(':machineCode/export/summary.xlsx')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  async exportSummaryExcel(@Param('machineCode') machineCode: string, @Res() res: Response) {
    const filename = `${this.toSafeFilename(machineCode)}-summary.xlsx`;
    const buffer = await this.runtimeService.exportSummaryExcel(machineCode);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(':machineCode/export/summary.docx')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  async exportSummaryDocx(@Param('machineCode') machineCode: string, @Res() res: Response) {
    const filename = `${this.toSafeFilename(machineCode)}-summary.docx`;
    const buffer = await this.runtimeService.exportSummaryDocx(machineCode);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(':machineCode/snapshot.jpg')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  async snapshot(@Param('machineCode') machineCode: string, @Res() res: Response) {
    const buffer = await this.runtimeService.snapshot(machineCode);
    if (!buffer) {
      res.status(204).send();
      return;
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.send(buffer);
  }

  @Get(':machineCode')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  details(@Param('machineCode') machineCode: string) {
    return this.runtimeService.details(machineCode);
  }

  private toSafeFilename(machineCode: string) {
    return machineCode.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'machine-runtime';
  }
}
