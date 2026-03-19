import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreatePillTypeDto {
  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  dosageMg?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  barcode?: string;
}
