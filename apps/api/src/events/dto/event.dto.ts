import { IsDateString, IsInt, IsObject, IsOptional, IsString, MaxLength, MinLength, Min } from 'class-validator';

export class IngestEventDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  machineId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  eventType!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(200)
  idempotencyKey!: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class EventListQueryDto {
  @IsOptional()
  @IsString()
  machineId?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}
