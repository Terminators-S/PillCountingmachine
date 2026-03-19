import { z } from 'zod';

export const machineRegisterSchema = z.object({
  machineCode: z.string().min(2).max(64),
  firmwareVersion: z.string().min(1).max(64),
  location: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120).optional()
});

export const machineHeartbeatSchema = z.object({
  machineCode: z.string().min(2).max(64),
  firmwareVersion: z.string().max(64).optional(),
  location: z.string().max(120).optional(),
  payload: z.record(z.unknown()).optional(),
  occurredAt: z.string().datetime().optional()
});

export const machineEventIngestSchema = z.object({
  machineId: z.string().min(2).max(64),
  eventType: z.string().min(2).max(120),
  occurredAt: z.string().datetime().optional(),
  idempotencyKey: z.string().min(6).max(200),
  payload: z.record(z.unknown()).optional()
});

export const countCompletedSchema = z.object({
  jobId: z.string().min(2),
  machineId: z.string().min(2),
  operatorId: z.string().optional(),
  pillTypeId: z.string().uuid(),
  lotId: z.string().uuid().optional(),
  targetQty: z.number().int().nonnegative(),
  actualQty: z.number().int().nonnegative(),
  tolerancePct: z.number().nonnegative(),
  evidenceLinks: z.array(z.string().url()).optional()
});

export type MachineRegisterInput = z.infer<typeof machineRegisterSchema>;
export type MachineHeartbeatInput = z.infer<typeof machineHeartbeatSchema>;
export type MachineEventIngestInput = z.infer<typeof machineEventIngestSchema>;
