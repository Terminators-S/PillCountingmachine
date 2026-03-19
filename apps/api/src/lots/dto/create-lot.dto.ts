import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateLotDto {
  @IsUUID('4')
  pillTypeId!: string;

  @IsString()
  @MaxLength(64)
  lotNumber!: string;

  @IsDateString()
  expiryDate!: string;

  @IsDateString()
  receivedDate!: string;

  @IsNumber()
  @Min(0.0001)
  unitCost!: number;

  @IsString()
  @MaxLength(120)
  location!: string;

  @IsOptional()
  isQuarantined?: boolean;
}
