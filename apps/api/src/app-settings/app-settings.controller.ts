import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { UpdateRoboflowConfigDto } from './dto/update-roboflow-config.dto';
import { UpsertRoboflowModelDto } from './dto/upsert-roboflow-model.dto';
import { AppSettingsService } from './app-settings.service';

@Controller('app-settings')
export class AppSettingsController {
  constructor(private readonly appSettingsService: AppSettingsService) {}

  @Get('public')
  publicBranding() {
    return this.appSettingsService.getPublicBranding();
  }

  @Get('branding')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  branding() {
    return this.appSettingsService.getBranding();
  }

  @Put('branding')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  updateBranding(@Body() input: UpdateBrandingDto) {
    return this.appSettingsService.updateBranding(input);
  }

  @Get('roboflow')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  roboflow() {
    return this.appSettingsService.getRoboflowSettings();
  }

  @Put('roboflow')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  updateRoboflow(@Body() input: UpdateRoboflowConfigDto) {
    return this.appSettingsService.updateRoboflowConfig(input);
  }

  @Post('roboflow/models')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  upsertRoboflowModel(@Body() input: UpsertRoboflowModelDto) {
    return this.appSettingsService.upsertRoboflowModel(input);
  }

  @Delete('roboflow/models/:modelKey')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  removeRoboflowModel(@Param('modelKey') modelKey: string) {
    return this.appSettingsService.removeRoboflowModel(modelKey);
  }
}
