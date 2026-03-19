import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AppSettingsController } from './app-settings.controller';
import { AppSettingsService } from './app-settings.service';

@Module({
  imports: [PrismaModule],
  controllers: [AppSettingsController],
  providers: [AppSettingsService],
  exports: [AppSettingsService]
})
export class AppSettingsModule {}
