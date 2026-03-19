import { PartialType } from '@nestjs/mapped-types';
import { CreatePillTypeDto } from './create-pill-type.dto';

export class UpdatePillTypeDto extends PartialType(CreatePillTypeDto) {}
