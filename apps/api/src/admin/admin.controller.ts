import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('models')
  models() {
    return this.adminService.listModels();
  }

  @Get('models/:model/rows')
  rows(@Param('model') model: string, @Query('limit') limit?: string) {
    return this.adminService.listRows(model, Number(limit || 100));
  }

  @Post('models/:model/rows')
  create(@Param('model') model: string, @Body('data') data: Record<string, unknown>) {
    return this.adminService.createRow(model, data || {});
  }

  @Patch('models/:model/rows')
  update(
    @Param('model') model: string,
    @Body('where') where: Record<string, unknown>,
    @Body('data') data: Record<string, unknown>
  ) {
    return this.adminService.updateRow(model, where || {}, data || {});
  }

  @Post('models/:model/delete')
  delete(@Param('model') model: string, @Body('where') where: Record<string, unknown>) {
    return this.adminService.deleteRow(model, where || {});
  }
}
