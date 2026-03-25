import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { GoogleLoginDto } from './dto/google-login.dto';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client | null = null;

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

  private getGoogleClientId() {
    return String(this.configService.get<string>('GOOGLE_CLIENT_ID') || '').trim();
  }

  private getFirebaseWebApiKey() {
    return String(this.configService.get<string>('FIREBASE_WEB_API_KEY') || '').trim();
  }

  private getGoogleClient() {
    const clientId = this.getGoogleClientId();
    if (!clientId) {
      throw new BadRequestException({ code: 'GOOGLE_NOT_CONFIGURED', message: 'Google sign-in is not configured on the API.' });
    }

    if (!this.googleClient) {
      this.googleClient = new OAuth2Client(clientId);
    }

    return this.googleClient;
  }

  private async verifyFirebaseIdToken(idToken: string) {
    const apiKey = this.getFirebaseWebApiKey();
    if (!apiKey) {
      return null;
    }

    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ idToken })
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          users?: Array<{
            email?: string;
            emailVerified?: boolean;
            displayName?: string;
          }>;
          error?: { message?: string };
        }
      | null;

    if (!response.ok) {
      const code = String(payload?.error?.message || '').trim();
      if (code === 'INVALID_ID_TOKEN' || code === 'USER_NOT_FOUND' || code === 'TOKEN_EXPIRED') {
        return null;
      }
      throw new UnauthorizedException({
        code: 'FIREBASE_TOKEN_INVALID',
        message: 'Firebase sign-in could not be verified.'
      });
    }

    const user = payload?.users?.[0];
    if (!user?.email) {
      throw new UnauthorizedException({
        code: 'FIREBASE_TOKEN_INVALID',
        message: 'Firebase did not return a usable email address.'
      });
    }

    if (user.emailVerified !== true) {
      throw new UnauthorizedException({
        code: 'FIREBASE_EMAIL_NOT_VERIFIED',
        message: 'Firebase account email is not verified.'
      });
    }

    return {
      email: user.email.toLowerCase(),
      fullName: String(user.displayName || '').trim() || user.email.split('@')[0]
    };
  }

  private async verifyGoogleIdToken(idToken: string) {
    const firebaseProfile = await this.verifyFirebaseIdToken(idToken);
    if (firebaseProfile) {
      return firebaseProfile;
    }

    try {
      const client = this.getGoogleClient();
      const ticket = await client.verifyIdToken({
        idToken,
        audience: this.getGoogleClientId(),
      });

      const payload = ticket.getPayload();
      if (!payload?.email) {
        throw new UnauthorizedException({ code: 'GOOGLE_TOKEN_INVALID', message: 'Google did not return a usable email address.' });
      }

      if (payload.email_verified !== true) {
        throw new UnauthorizedException({ code: 'GOOGLE_EMAIL_NOT_VERIFIED', message: 'Google account email is not verified.' });
      }

      return {
        email: payload.email.toLowerCase(),
        fullName: String(payload.name || '').trim() || payload.email.split('@')[0],
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException({ code: 'GOOGLE_TOKEN_INVALID', message: 'Google sign-in could not be verified.' });
    }
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

  private async ensureDefaultViewerRole(userId: string) {
    const viewerRole = await this.prisma.role.findUnique({ where: { code: 'VIEWER' } });
    if (!viewerRole) {
      return;
    }

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId,
          roleId: viewerRole.id
        }
      },
      update: {},
      create: {
        userId,
        roleId: viewerRole.id
      }
    });
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

  async loginWithGoogle(input: GoogleLoginDto) {
    const profile = await this.verifyGoogleIdToken(input.idToken);
    const existing = await this.prisma.user.findUnique({ where: { email: profile.email } });

    if (existing && !existing.isActive) {
      throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'This account is disabled.' });
    }

    let user = existing;
    if (!user) {
      const passwordHash = await bcrypt.hash(randomUUID(), 10);
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          fullName: profile.fullName,
          passwordHash
        }
      });
    } else if (profile.fullName && profile.fullName !== user.fullName) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { fullName: profile.fullName }
      });
    }

    await this.ensureDefaultViewerRole(user.id);

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
