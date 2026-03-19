import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AssignRolesDto } from './dto/assign-roles.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('ADMIN', 'SUPERVISOR', 'AUDITOR')
  listUsers() {
    return this.usersService.listUsers();
  }

  @Get('roles/catalog')
  @Roles('ADMIN', 'SUPERVISOR')
  listRoles() {
    return this.usersService.listRoles();
  }

  @Patch(':id/roles')
  @Roles('ADMIN')
  assignRoles(@Param('id') userId: string, @Body() dto: AssignRolesDto) {
    return this.usersService.assignRoles(userId, dto.roleIds);
  }
}
