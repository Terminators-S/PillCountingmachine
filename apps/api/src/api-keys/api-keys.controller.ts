import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  @Roles('ADMIN', 'SUPERVISOR')
  list() {
    return this.apiKeysService.list();
  }

  @Post()
  @Roles('ADMIN', 'SUPERVISOR')
  create(@Body() input: CreateApiKeyDto, @CurrentUser('sub') userId: string) {
    return this.apiKeysService.create(input, userId);
  }

  @Delete(':id')
  @Roles('ADMIN')
  revoke(@Param('id') id: string) {
    return this.apiKeysService.revoke(id);
  }
}
