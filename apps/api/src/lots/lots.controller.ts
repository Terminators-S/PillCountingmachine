import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { LotsService } from './lots.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';

@Controller('lots')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LotsController {
  constructor(private readonly lotsService: LotsService) {}

  @Post()
  @Roles('ADMIN', 'SUPERVISOR')
  create(@Body() input: CreateLotDto) {
    return this.lotsService.create(input);
  }

  @Get()
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  list(
    @Query('pillTypeId') pillTypeId?: string,
    @Query('location') location?: string,
    @Query('expiringDays') expiringDays?: string
  ) {
    return this.lotsService.list({
      pillTypeId,
      location,
      expiringDays: expiringDays ? Number(expiringDays) : undefined
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  details(@Param('id') id: string) {
    return this.lotsService.details(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPERVISOR')
  update(@Param('id') id: string, @Body() input: UpdateLotDto) {
    return this.lotsService.update(id, input);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.lotsService.remove(id);
  }
}
