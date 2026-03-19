import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertRoboflowModelDto {
  @IsString()
  @MaxLength(500)
  reference!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  classes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  recommendedForCounting?: boolean;

  @IsOptional()
  @IsBoolean()
  makeDefault?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsIn(['hosted', 'ondevice'])
  deploymentTarget?: 'hosted' | 'ondevice';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  inferenceServerUrl?: string;
}
