import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const CONTROL_STATES = ['IDLE', 'STARTING', 'RUNNING', 'STOPPING', 'ERROR'] as const;

export class HeartbeatMachineRuntimeControlDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  agent_session_id?: string;

  @IsOptional()
  @IsString()
  @IsIn(CONTROL_STATES)
  runtime_state?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  runtime_running?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  active_pid?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  applied_command_version?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  current_message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  last_error?: string;
}
