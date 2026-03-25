import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';

export class CreateMachineRunDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  schema_version?: number;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  status!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  machine_name!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(120)
  run_id!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  source_mode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  source_label?: string;

  @IsDateString()
  started_at_utc!: string;

  @IsDateString()
  completed_at_utc!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  total_count!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  event_count!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  runtime_status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  detector_backend?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  ml_runtime_backend?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  model_format?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  model_key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  model_path?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  runtime_fps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  average_fps?: number;

  @IsOptional()
  @IsObject()
  count_result?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  camera?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  detector?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  roi?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  line?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  events?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  sync?: Record<string, unknown>;
}
