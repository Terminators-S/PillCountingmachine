import { IsOptional, IsString, MaxLength, MinLength, IsObject, IsDateString } from 'class-validator';

export class HeartbeatDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  machineCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  firmwareVersion?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
