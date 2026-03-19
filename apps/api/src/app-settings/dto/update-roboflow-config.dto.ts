import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRoboflowConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultModelKey?: string;

  @IsOptional()
  @IsIn(['hosted', 'ondevice'])
  deploymentTarget?: 'hosted' | 'ondevice';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  inferenceServerUrl?: string;

  @IsOptional()
  @IsIn(['desktop', 'raspberry-pi-5'])
  deviceProfile?: 'desktop' | 'raspberry-pi-5';
}
