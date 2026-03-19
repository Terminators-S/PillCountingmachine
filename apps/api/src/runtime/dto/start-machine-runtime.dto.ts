import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class StartMachineRuntimeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  firmwareVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  modelKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cameraIndex?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(0.99)
  confidenceThreshold?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(0.99)
  iouThreshold?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-80)
  @Max(80)
  brightness?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(2.5)
  contrast?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.3)
  @Max(2.5)
  gamma?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(2)
  sharpness?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-13)
  @Max(1)
  exposure?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(64)
  gain?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(250)
  @Max(10000)
  telemetryIntervalMs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(250)
  @Max(10000)
  snapshotIntervalMs?: number;
}
