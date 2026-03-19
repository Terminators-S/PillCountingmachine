import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root() {
    return {
      service: 'pillcount-api',
      status: 'ok',
      now: new Date().toISOString(),
      message: 'API is running',
      docs: {
        authLogin: '/api/auth/login',
        authRegister: '/api/auth/register',
        reportsOverview: '/api/reports/overview',
        machines: '/api/machines'
      }
    };
  }

  @Get('health')
  health() {
    return {
      service: 'pillcount-api',
      status: 'ok',
      now: new Date().toISOString()
    };
  }
}

