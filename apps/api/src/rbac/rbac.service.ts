import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async getRoleMatrix() {
    const roles = await this.prisma.role.findMany({ orderBy: { name: 'asc' } });
    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      permissions: this.defaultPermissionsForRole(String(role.code))
    }));
  }

  private defaultPermissionsForRole(role: string) {
    const matrix: Record<string, string[]> = {
      ADMIN: ['*'],
      SUPERVISOR: ['machines:read', 'inventory:write', 'jobs:write', 'reports:read'],
      OPERATOR: ['machines:read', 'jobs:write', 'inventory:write-limited'],
      AUDITOR: ['audit:read', 'reports:read', 'inventory:read'],
      VIEWER: ['dashboard:read', 'reports:read'],
      API_ONLY: ['machines:write', 'events:write']
    };
    return matrix[role] || [];
  }
}
