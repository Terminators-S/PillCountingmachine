import { Module } from '@nestjs/common';
import { PillTypesService } from './pill-types.service';
import { PillTypesController } from './pill-types.controller';

@Module({
  providers: [PillTypesService],
  controllers: [PillTypesController],
  exports: [PillTypesService]
})
export class PillTypesModule {}
