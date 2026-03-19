import { IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateJobDto {
  @IsUUID('4')
  machineId!: string;

  @IsUUID('4')
  pillTypeId!: string;

  @IsInt()
  @Min(1)
  targetQty!: number;

  @IsOptional()
  @IsUUID('4')
  lotPreferenceId?: string;

  @IsOptional()
  @IsUUID('4')
  operatorId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tolerancePct?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class StartJobDto {
  @IsOptional()
  @IsUUID('4')
  operatorId?: string;
}

export class JobProgressDto {
  @IsInt()
  @Min(0)
  progressQty!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  message?: string;
}

export class CompleteJobDto {
  @IsInt()
  @Min(0)
  actualQty!: number;

  @IsOptional()
  @IsUUID('4')
  operatorId?: string;

  @IsOptional()
  evidenceLinks?: string[];
}

export class RecountJobDto {
  @IsString()
  @MaxLength(300)
  reason!: string;
}

export class AddEvidenceDto {
  @IsString()
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  evidenceType?: string;
}
