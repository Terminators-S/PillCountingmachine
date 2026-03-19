import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PillTypesService } from './pill-types.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreatePillTypeDto } from './dto/create-pill-type.dto';
import { UpdatePillTypeDto } from './dto/update-pill-type.dto';

@Controller('pill-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PillTypesController {
  constructor(private readonly pillTypesService: PillTypesService) {}

  @Post()
  @Roles('ADMIN', 'SUPERVISOR')
  create(@Body() input: CreatePillTypeDto) {
    return this.pillTypesService.create(input);
  }

  @Get()
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  list(@Query('search') search?: string) {
    return this.pillTypesService.list({ search });
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  details(@Param('id') id: string) {
    return this.pillTypesService.details(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPERVISOR')
  update(@Param('id') id: string, @Body() input: UpdatePillTypeDto) {
    return this.pillTypesService.update(id, input);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.pillTypesService.remove(id);
  }
}
