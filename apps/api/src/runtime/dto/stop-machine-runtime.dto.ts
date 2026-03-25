import { IsIn, IsOptional, IsString } from 'class-validator';

const EXECUTION_MODES = ['local', 'remote'] as const;

export class StopMachineRuntimeDto {
  @IsOptional()
  @IsString()
  @IsIn(EXECUTION_MODES)
  executionMode?: 'local' | 'remote';
}
