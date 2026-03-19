import { Controller, Get, UseGuards } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('rbac')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('matrix')
  @Roles('ADMIN', 'SUPERVISOR', 'AUDITOR')
  roleMatrix() {
    return this.rbacService.getRoleMatrix();
  }
}
