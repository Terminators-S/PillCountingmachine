export type MachineStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE' | 'UNKNOWN';

export type InventoryTransactionType =
  | 'RECEIVE'
  | 'DISPENSE'
  | 'ADJUST'
  | 'TRANSFER'
  | 'RESERVE'
  | 'RELEASE'
  | 'QUARANTINE'
  | 'WASTE'
  | 'CYCLE_COUNT';

export type JobStatus = 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'NEEDS_RECOUNT' | 'CANCELLED';

export interface MachineEventEnvelope {
  machineId: string;
  eventType: string;
  occurredAt?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
}

export interface CountCompletedPayload {
  jobId: string;
  machineId: string;
  operatorId?: string;
  pillTypeId: string;
  lotId?: string;
  targetQty: number;
  actualQty: number;
  tolerancePct: number;
  evidenceLinks?: string[];
}
