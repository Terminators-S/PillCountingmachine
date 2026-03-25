import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString } from 'class-validator'

const CONTROL_STATES = ['IDLE', 'STARTING', 'RUNNING', 'STOPPING', 'ERROR'] as const
const CAMERA_STATES = ['CLOSED', 'OPENING', 'OPEN', 'ERROR'] as const

export class IngestMachineRuntimeTelemetryDto {
  @IsOptional()
  @IsString()
  session_id?: string

  @IsOptional()
  @IsString()
  machine_name?: string

  @IsOptional()
  @IsString()
  display_name?: string

  @IsOptional()
  @IsString()
  location?: string

  @IsOptional()
  @IsString()
  firmware_version?: string

  @IsOptional()
  @IsString()
  @IsIn(CONTROL_STATES)
  control_state?: string

  @IsOptional()
  @IsString()
  @IsIn(CAMERA_STATES)
  camera_state?: string

  @IsOptional()
  @IsString()
  started_at_utc?: string

  @IsOptional()
  @IsString()
  ended_at_utc?: string

  @IsOptional()
  @IsString()
  emitted_at_utc?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  camera_index?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  frame_width?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  frame_height?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  frame_number?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tracked_object_count?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fps?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  average_confidence?: number

  @IsOptional()
  @IsString()
  model_key?: string

  @IsOptional()
  @IsString()
  model_name?: string

  @IsOptional()
  @IsString()
  model_provider?: string

  @IsOptional()
  @IsString()
  model_path?: string

  @IsOptional()
  @IsObject()
  visible_counts?: Record<string, unknown>

  @IsOptional()
  @IsObject()
  cumulative_counts?: Record<string, unknown>

  @IsOptional()
  @IsString()
  message?: string

  @IsOptional()
  @IsString()
  latest_error?: string

  @IsOptional()
  @IsString()
  snapshot_data_url?: string
}

