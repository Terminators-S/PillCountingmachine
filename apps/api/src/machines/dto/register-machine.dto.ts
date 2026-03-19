import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterMachineDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  machineCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  location!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  firmwareVersion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}
