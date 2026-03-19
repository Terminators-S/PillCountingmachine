import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() input: RegisterDto) {
    return this.authService.register(input);
  }

  @Public()
  @Post('login')
  login(@Body() input: LoginDto) {
    return this.authService.login(input);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() input: RefreshDto) {
    return this.authService.refreshTokens(input);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser('sub') userId: string) {
    return this.authService.profile(userId);
  }
}
