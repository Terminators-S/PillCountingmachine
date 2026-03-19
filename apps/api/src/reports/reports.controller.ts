import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  overview() {
    return this.reportsService.overview();
  }

  @Get('throughput')
  @Roles('ADMIN', 'SUPERVISOR', 'AUDITOR', 'VIEWER')
  throughput(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.throughput(from, to);
  }

  @Get('valuation')
  @Roles('ADMIN', 'SUPERVISOR', 'AUDITOR', 'VIEWER')
  valuation() {
    return this.reportsService.valuationByLocation();
  }

  @Get('export/records.csv')
  @Roles('ADMIN', 'SUPERVISOR', 'AUDITOR')
  async exportRecords(@Res() res: Response) {
    const csv = await this.reportsService.exportRecordsCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="records.csv"');
    res.send(csv);
  }

  @Get('export/inventory-movements.csv')
  @Roles('ADMIN', 'SUPERVISOR', 'AUDITOR')
  async exportInventory(@Res() res: Response) {
    const csv = await this.reportsService.exportInventoryMovementsCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-movements.csv"');
    res.send(csv);
  }
}
