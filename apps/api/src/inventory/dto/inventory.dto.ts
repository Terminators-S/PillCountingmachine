import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

class BaseInventoryDto {
  @IsString()
  @MaxLength(200)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ReceiveStockDto extends BaseInventoryDto {
  @IsUUID('4')
  pillTypeId!: string;

  @IsUUID('4')
  lotId!: string;

  @IsString()
  @MaxLength(120)
  location!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class TransferStockDto extends BaseInventoryDto {
  @IsUUID('4')
  pillTypeId!: string;

  @IsUUID('4')
  lotId!: string;

  @IsString()
  @MaxLength(120)
  fromLocation!: string;

  @IsString()
  @MaxLength(120)
  toLocation!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class AdjustStockDto extends BaseInventoryDto {
  @IsUUID('4')
  pillTypeId!: string;

  @IsUUID('4')
  lotId!: string;

  @IsString()
  @MaxLength(120)
  location!: string;

  @IsInt()
  quantityDelta!: number;

  @IsUUID('4')
  approvedByUserId!: string;
}

export class ReserveStockDto extends BaseInventoryDto {
  @IsUUID('4')
  pillTypeId!: string;

  @IsUUID('4')
  lotId!: string;

  @IsString()
  @MaxLength(120)
  location!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class ReleaseStockDto extends BaseInventoryDto {
  @IsUUID('4')
  pillTypeId!: string;

  @IsUUID('4')
  lotId!: string;

  @IsString()
  @MaxLength(120)
  location!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class DispenseStockDto extends BaseInventoryDto {
  @IsUUID('4')
  pillTypeId!: string;

  @IsOptional()
  @IsUUID('4')
  lotId?: string;

  @IsString()
  @MaxLength(120)
  location!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsUUID('4')
  machineId?: string;

  @IsOptional()
  @IsUUID('4')
  jobId?: string;
}

class CycleCountItemDto {
  @IsUUID('4')
  pillTypeId!: string;

  @IsUUID('4')
  lotId!: string;

  @IsInt()
  @Min(0)
  countedQty!: number;
}

export class CycleCountDto extends BaseInventoryDto {
  @IsString()
  @MaxLength(120)
  location!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CycleCountItemDto)
  items!: CycleCountItemDto[];
}

export class InventoryBalanceQueryDto {
  @IsOptional()
  @IsUUID('4')
  pillTypeId?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  lotNumber?: string;
}

export class InventoryMovementQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  txnType?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
