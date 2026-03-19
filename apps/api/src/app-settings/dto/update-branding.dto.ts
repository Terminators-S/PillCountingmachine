import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  productName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  organizationName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  supportLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  welcomeMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  accentNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  headerEyebrow?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  headerSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  liveTagline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  authHeadline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  authSubheadline?: string;
}
