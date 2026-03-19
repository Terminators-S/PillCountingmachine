import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsArray()
  scopes?: string[];
}
