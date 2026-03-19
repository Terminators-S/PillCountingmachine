import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  private getAccessSecret() {
    return this.configService.get<string>('JWT_ACCESS_SECRET') || 'dev-access-secret-change-me';
  }

  private getRefreshSecret() {
    return this.configService.get<string>('JWT_REFRESH_SECRET') || 'dev-refresh-secret-change-me';
  }

  private getAccessTtl() {
    return this.configService.get<string>('JWT_ACCESS_TTL') || '15m';
  }

  private getRefreshTtl() {
    return this.configService.get<string>('JWT_REFRESH_TTL') || '7d';
  }

  private async getUserRoles(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true }
    });

    return rows.map((row) => row.role.code);
  }

  private async issueTokens(userId: string, email: string) {
    const roles = await this.getUserRoles(userId);

    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email, roles, kind: 'USER' },
      { secret: this.getAccessSecret(), expiresIn: this.getAccessTtl() }
    );

    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, email, roles, kind: 'USER', tokenType: 'refresh' },
      { secret: this.getRefreshSecret(), expiresIn: this.getRefreshTtl() }
    );

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt
      }
    });

    return { accessToken, refreshToken, roles };
  }

  async register(input: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (existing) {
      throw new ConflictException({ code: 'EMAIL_IN_USE', message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        passwordHash
      }
    });

    const viewerRole = await this.prisma.role.findUnique({ where: { code: 'VIEWER' } });
    if (viewerRole) {
      await this.prisma.userRole.create({ data: { userId: user.id, roleId: viewerRole.id } });
    }

    const tokens = await this.issueTokens(user.id, user.email);
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles: tokens.roles
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    };
  }

  async login(input: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }

    const tokens = await this.issueTokens(user.id, user.email);
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles: tokens.roles
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    };
  }

  async refreshTokens(input: RefreshDto) {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(input.refreshToken, { secret: this.getRefreshSecret() });
    } catch (_error) {
      throw new UnauthorizedException({ code: 'REFRESH_INVALID', message: 'Invalid refresh token' });
    }

    const tokenHash = createHash('sha256').update(input.refreshToken).digest('hex');
    const tokenRecord = await this.prisma.refreshToken.findFirst({
      where: {
        userId: payload.sub,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      }
    });

    if (!tokenRecord) {
      throw new UnauthorizedException({ code: 'REFRESH_REVOKED', message: 'Refresh token revoked or expired' });
    }

    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() }
    });

    return this.issueTokens(payload.sub, payload.email);
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    const roles = await this.getUserRoles(user.id);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles
    };
  }
}
