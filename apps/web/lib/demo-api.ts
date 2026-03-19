'use client';

import { getAccessToken } from './auth';
import type {
  AdminModelField,
  AdminModelMeta,
  AdminRow,
  AdminRowsResponse,
  ApiKeyCreateResponse,
  ApiKeyRecord,
  AuditLogRow,
  CountingJob,
  EventListResponse,
  InventoryBalance,
  InventoryMovement,
  JobStatus,
  Lot,
  Machine,
  MachineEventRow,
  MeProfile,
  PillType,
  ReportsOverview,
  RoleCode,
  RoleRow,
  ThroughputRow,
  UserRow,
  ValuationRow
} from '../types/api';

export const DEMO_STATE_EVENT = 'pillcount-demo-state-changed';

type DemoUser = UserRow & {
  password: string;
};

type DemoLiveEvent = {
  type: string;
  payload: Record<string, unknown>;
  emittedAt: string;
};

type DemoState = {
  users: DemoUser[];
  roles: RoleRow[];
  machines: Machine[];
  machineEvents: MachineEventRow[];
  pillTypes: PillType[];
  lots: Lot[];
  balances: InventoryBalance[];
  movements: InventoryMovement[];
  jobs: CountingJob[];
  apiKeys: ApiKeyRecord[];
  auditLogs: AuditLogRow[];
  liveEvents: DemoLiveEvent[];
};

type DemoAdminCollectionKey =
  | 'users'
  | 'roles'
  | 'machines'
  | 'machineEvents'
  | 'pillTypes'
  | 'lots'
  | 'balances'
  | 'movements'
  | 'jobs'
  | 'apiKeys'
  | 'auditLogs';

type DemoAdminModelConfig = {
  name: string;
  stateKey: DemoAdminCollectionKey;
  primaryKeyFields: string[];
  fields: AdminModelField[];
};

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const DEMO_STATE_KEY = 'pillcount_demo_state_v1';
const DEMO_DEFAULT_PASSWORD = 'Admin1234!';

const ROLE_DEFINITIONS: Array<{ code: RoleCode; name: string; permissions: string[] }> = [
  { code: 'ADMIN', name: 'Admin', permissions: ['*'] },
  { code: 'SUPERVISOR', name: 'Supervisor', permissions: ['machines:read', 'inventory:write', 'jobs:write', 'reports:read'] },
  { code: 'OPERATOR', name: 'Operator', permissions: ['jobs:write', 'inventory:read', 'dashboard:read'] },
  { code: 'AUDITOR', name: 'Auditor', permissions: ['audit:read', 'reports:read', 'inventory:read'] },
  { code: 'VIEWER', name: 'Viewer', permissions: ['dashboard:read', 'reports:read'] },
  { code: 'API_ONLY', name: 'API-only', permissions: ['machine:write', 'events:write'] }
];

function adminField(
  name: string,
  type: string,
  options: Partial<AdminModelField> = {}
): AdminModelField {
  const kind = options.kind || ('scalar' as const);

  return {
    name,
    type,
    kind,
    isId: Boolean(options.isId),
    isList: Boolean(options.isList),
    isRequired: Boolean(options.isRequired),
    isUnique: Boolean(options.isUnique),
    isUpdatedAt: Boolean(options.isUpdatedAt),
    hasDefaultValue: Boolean(options.hasDefaultValue)
  };
}

const DEMO_ADMIN_MODELS: DemoAdminModelConfig[] = [
  {
    name: 'User',
    stateKey: 'users',
    primaryKeyFields: ['id'],
    fields: [
      adminField('id', 'String', { isId: true, isRequired: true, isUnique: true }),
      adminField('email', 'String', { isRequired: true, isUnique: true }),
      adminField('fullName', 'String', { isRequired: true }),
      adminField('isActive', 'Boolean', { isRequired: true, hasDefaultValue: true }),
      adminField('createdAt', 'DateTime', { isRequired: true, hasDefaultValue: true }),
      adminField('roles', 'String', { isList: true, hasDefaultValue: true }),
      adminField('password', 'String', { isRequired: true })
    ]
  },
  {
    name: 'Role',
    stateKey: 'roles',
    primaryKeyFields: ['id'],
    fields: [
      adminField('id', 'String', { isId: true, isRequired: true, isUnique: true }),
      adminField('code', 'RoleCode', { kind: 'enum', isRequired: true, isUnique: true }),
      adminField('name', 'String', { isRequired: true }),
      adminField('permissions', 'String', { isList: true, hasDefaultValue: true })
    ]
  },
  {
    name: 'Machine',
    stateKey: 'machines',
    primaryKeyFields: ['id'],
    fields: [
      adminField('id', 'String', { isId: true, isRequired: true, isUnique: true }),
      adminField('machineCode', 'String', { isRequired: true, isUnique: true }),
      adminField('displayName', 'String'),
      adminField('location', 'String', { isRequired: true }),
      adminField('firmwareVersion', 'String', { isRequired: true }),
      adminField('status', 'MachineStatus', { kind: 'enum', isRequired: true, hasDefaultValue: true }),
      adminField('lastSeen', 'DateTime'),
      adminField('createdAt', 'DateTime', { isRequired: true, hasDefaultValue: true }),
      adminField('updatedAt', 'DateTime', { isRequired: true, hasDefaultValue: true, isUpdatedAt: true })
    ]
  },
  {
    name: 'MachineEvent',
    stateKey: 'machineEvents',
    primaryKeyFields: ['id'],
    fields: [
      adminField('id', 'String', { isId: true, isRequired: true, isUnique: true }),
      adminField('machineId', 'String', { isRequired: true }),
      adminField('eventType', 'String', { isRequired: true }),
      adminField('payload', 'Json'),
      adminField('occurredAt', 'DateTime', { isRequired: true }),
      adminField('receivedAt', 'DateTime', { isRequired: true, hasDefaultValue: true }),
      adminField('idempotencyKey', 'String', { isRequired: true, isUnique: true }),
      adminField('sourceIp', 'String'),
      adminField('sourceUserAgent', 'String')
    ]
  },
  {
    name: 'PillType',
    stateKey: 'pillTypes',
    primaryKeyFields: ['id'],
    fields: [
      adminField('id', 'String', { isId: true, isRequired: true, isUnique: true }),
      adminField('code', 'String', { isRequired: true, isUnique: true }),
      adminField('name', 'String', { isRequired: true }),
      adminField('dosageMg', 'Int'),
      adminField('manufacturer', 'String'),
      adminField('barcode', 'String'),
      adminField('createdAt', 'DateTime', { isRequired: true, hasDefaultValue: true }),
      adminField('updatedAt', 'DateTime', { isRequired: true, hasDefaultValue: true, isUpdatedAt: true })
    ]
  },
  {
    name: 'Lot',
    stateKey: 'lots',
    primaryKeyFields: ['id'],
    fields: [
      adminField('id', 'String', { isId: true, isRequired: true, isUnique: true }),
      adminField('pillTypeId', 'String', { isRequired: true }),
      adminField('lotNumber', 'String', { isRequired: true }),
      adminField('expiryDate', 'DateTime', { isRequired: true }),
      adminField('receivedDate', 'DateTime', { isRequired: true }),
      adminField('unitCost', 'Decimal', { isRequired: true }),
      adminField('location', 'String', { isRequired: true }),
      adminField('isQuarantined', 'Boolean', { isRequired: true, hasDefaultValue: true }),
      adminField('createdAt', 'DateTime', { isRequired: true, hasDefaultValue: true }),
      adminField('updatedAt', 'DateTime', { isRequired: true, hasDefaultValue: true, isUpdatedAt: true })
    ]
  },
  {
    name: 'InventoryBalance',
    stateKey: 'balances',
    primaryKeyFields: ['id'],
    fields: [
      adminField('id', 'String', { isId: true, isRequired: true, isUnique: true }),
      adminField('pillTypeId', 'String', { isRequired: true }),
      adminField('lotId', 'String', { isRequired: true }),
      adminField('location', 'String', { isRequired: true }),
      adminField('onHand', 'Int', { isRequired: true, hasDefaultValue: true }),
      adminField('reserved', 'Int', { isRequired: true, hasDefaultValue: true }),
      adminField('quarantined', 'Int', { isRequired: true, hasDefaultValue: true }),
      adminField('updatedAt', 'DateTime', { isRequired: true, hasDefaultValue: true, isUpdatedAt: true })
    ]
  },
  {
    name: 'InventoryTransaction',
    stateKey: 'movements',
    primaryKeyFields: ['id'],
    fields: [
      adminField('id', 'String', { isId: true, isRequired: true, isUnique: true }),
      adminField('txnType', 'InventoryTxnType', { kind: 'enum', isRequired: true }),
      adminField('quantity', 'Int', { isRequired: true }),
      adminField('location', 'String', { isRequired: true }),
      adminField('fromLocation', 'String'),
      adminField('toLocation', 'String'),
      adminField('createdAt', 'DateTime', { isRequired: true, hasDefaultValue: true }),
      adminField('idempotencyKey', 'String'),
      adminField('pillType', 'Json'),
      adminField('lot', 'Json'),
      adminField('machine', 'Json'),
      adminField('operator', 'Json')
    ]
  },
  {
    name: 'CountingJob',
    stateKey: 'jobs',
    primaryKeyFields: ['id'],
    fields: [
      adminField('id', 'String', { isId: true, isRequired: true, isUnique: true }),
      adminField('jobNumber', 'String', { isRequired: true, isUnique: true }),
      adminField('machineId', 'String', { isRequired: true }),
      adminField('pillTypeId', 'String', { isRequired: true }),
      adminField('targetQty', 'Int', { isRequired: true }),
      adminField('actualQty', 'Int'),
      adminField('lotPreferenceId', 'String'),
      adminField('tolerancePct', 'Decimal', { isRequired: true, hasDefaultValue: true }),
      adminField('status', 'JobStatus', { kind: 'enum', isRequired: true, hasDefaultValue: true }),
      adminField('createdById', 'String', { isRequired: true }),
      adminField('operatorId', 'String'),
      adminField('startedAt', 'DateTime'),
      adminField('completedAt', 'DateTime'),
      adminField('notes', 'String'),
      adminField('createdAt', 'DateTime', { isRequired: true, hasDefaultValue: true }),
      adminField('updatedAt', 'DateTime', { isRequired: true, hasDefaultValue: true, isUpdatedAt: true })
    ]
  },
  {
    name: 'ApiKey',
    stateKey: 'apiKeys',
    primaryKeyFields: ['id'],
    fields: [
      adminField('id', 'String', { isId: true, isRequired: true, isUnique: true }),
      adminField('name', 'String', { isRequired: true }),
      adminField('keyPrefix', 'String', { isRequired: true, isUnique: true }),
      adminField('scopes', 'String', { isList: true, hasDefaultValue: true }),
      adminField('isActive', 'Boolean', { isRequired: true, hasDefaultValue: true }),
      adminField('createdAt', 'DateTime', { isRequired: true, hasDefaultValue: true }),
      adminField('updatedAt', 'DateTime', { isRequired: true, hasDefaultValue: true, isUpdatedAt: true }),
      adminField('lastUsedAt', 'DateTime')
    ]
  },
  {
    name: 'AuditLog',
    stateKey: 'auditLogs',
    primaryKeyFields: ['id'],
    fields: [
      adminField('id', 'String', { isId: true, isRequired: true, isUnique: true }),
      adminField('actorType', 'AuditActorType', { kind: 'enum', isRequired: true }),
      adminField('actorUserId', 'String'),
      adminField('actorApiKeyId', 'String'),
      adminField('action', 'String', { isRequired: true }),
      adminField('resourceType', 'String', { isRequired: true }),
      adminField('resourceId', 'String'),
      adminField('requestId', 'String'),
      adminField('ipAddress', 'String'),
      adminField('userAgent', 'String'),
      adminField('metadata', 'Json'),
      adminField('createdAt', 'DateTime', { isRequired: true, hasDefaultValue: true })
    ]
  }
];

const DEMO_ADMIN_MODEL_MAP = new Map(DEMO_ADMIN_MODELS.map((model) => [model.name, model]));

export class DemoApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status = 400, code?: string, details?: unknown) {
    super(message);
    this.name = 'DemoApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function createId(prefix: string) {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function offsetIso(daysOffset: number) {
  return new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000).toISOString();
}

function roleId(code: RoleCode) {
  return `role_${code.toLowerCase()}`;
}

function userSummary(user: DemoUser | null | undefined) {
  return user ? { id: user.id, email: user.email, fullName: user.fullName } : null;
}

function buildSeedState(): DemoState {
  const createdAt = nowIso();

  const roles: RoleRow[] = ROLE_DEFINITIONS.map((role) => ({
    id: roleId(role.code),
    code: role.code,
    name: role.name,
    permissions: role.permissions
  }));

  const adminUser: DemoUser = {
    id: 'user_admin',
    email: 'admin@pillcount.local',
    fullName: 'Platform Admin',
    isActive: true,
    createdAt,
    roles: ['ADMIN'],
    password: DEMO_DEFAULT_PASSWORD
  };

  const supervisorUser: DemoUser = {
    id: 'user_supervisor',
    email: 'supervisor@pillcount.local',
    fullName: 'Floor Supervisor',
    isActive: true,
    createdAt,
    roles: ['SUPERVISOR'],
    password: 'Supervisor123!'
  };

  const machines: Machine[] = [
    {
      id: 'machine_001',
      machineCode: 'MCH-001',
      displayName: 'Main Line Counter',
      location: 'Main Pharmacy',
      firmwareVersion: '1.2.0',
      status: 'ONLINE',
      displayStatus: 'ONLINE',
      lastSeen: nowIso(),
      createdAt,
      updatedAt: nowIso()
    },
    {
      id: 'machine_002',
      machineCode: 'MCH-002',
      displayName: 'Satellite Counter',
      location: 'Clinic Dispensary',
      firmwareVersion: '1.1.6',
      status: 'MAINTENANCE',
      displayStatus: 'MAINTENANCE',
      lastSeen: offsetIso(-1),
      createdAt,
      updatedAt: offsetIso(-1)
    }
  ];

  const pillTypes: PillType[] = [
    {
      id: 'pill_amox500',
      code: 'AMOX500',
      name: 'Amoxicillin',
      dosageMg: 500,
      manufacturer: 'MedCo',
      barcode: '1111111111111',
      createdAt,
      updatedAt: createdAt
    },
    {
      id: 'pill_para500',
      code: 'PARA500',
      name: 'Paracetamol',
      dosageMg: 500,
      manufacturer: 'Health Labs',
      barcode: '2222222222222',
      createdAt,
      updatedAt: createdAt
    },
    {
      id: 'pill_ceti10',
      code: 'CETI10',
      name: 'Cetirizine',
      dosageMg: 10,
      manufacturer: 'Allergy Pharma',
      barcode: '3333333333333',
      createdAt,
      updatedAt: createdAt
    }
  ];

  const lots: Lot[] = [
    {
      id: 'lot_amox_2401',
      pillTypeId: 'pill_amox500',
      lotNumber: 'AMX-LOT-2401',
      expiryDate: offsetIso(180),
      receivedDate: offsetIso(-45),
      unitCost: '0.12',
      location: 'Main Pharmacy',
      isQuarantined: false,
      createdAt,
      updatedAt: createdAt,
      pillType: { id: 'pill_amox500', code: 'AMOX500', name: 'Amoxicillin' }
    },
    {
      id: 'lot_para_2409',
      pillTypeId: 'pill_para500',
      lotNumber: 'PARA-LOT-2409',
      expiryDate: offsetIso(120),
      receivedDate: offsetIso(-30),
      unitCost: '0.05',
      location: 'Main Pharmacy',
      isQuarantined: false,
      createdAt,
      updatedAt: createdAt,
      pillType: { id: 'pill_para500', code: 'PARA500', name: 'Paracetamol' }
    },
    {
      id: 'lot_ceti_2501',
      pillTypeId: 'pill_ceti10',
      lotNumber: 'CETI-LOT-2501',
      expiryDate: offsetIso(20),
      receivedDate: offsetIso(-10),
      unitCost: '0.08',
      location: 'Clinic Dispensary',
      isQuarantined: false,
      createdAt,
      updatedAt: createdAt,
      pillType: { id: 'pill_ceti10', code: 'CETI10', name: 'Cetirizine' }
    }
  ];

  const balances: InventoryBalance[] = [
    {
      id: 'bal_amox_main',
      pillTypeId: 'pill_amox500',
      lotId: 'lot_amox_2401',
      location: 'Main Pharmacy',
      onHand: 1200,
      reserved: 120,
      quarantined: 0,
      updatedAt: nowIso(),
      pillType: { id: 'pill_amox500', code: 'AMOX500', name: 'Amoxicillin' },
      lot: lots[0]
    },
    {
      id: 'bal_para_main',
      pillTypeId: 'pill_para500',
      lotId: 'lot_para_2409',
      location: 'Main Pharmacy',
      onHand: 2000,
      reserved: 50,
      quarantined: 0,
      updatedAt: nowIso(),
      pillType: { id: 'pill_para500', code: 'PARA500', name: 'Paracetamol' },
      lot: lots[1]
    },
    {
      id: 'bal_ceti_clinic',
      pillTypeId: 'pill_ceti10',
      lotId: 'lot_ceti_2501',
      location: 'Clinic Dispensary',
      onHand: 800,
      reserved: 0,
      quarantined: 0,
      updatedAt: nowIso(),
      pillType: { id: 'pill_ceti10', code: 'CETI10', name: 'Cetirizine' },
      lot: lots[2]
    }
  ];

  const jobs: CountingJob[] = [
    {
      id: 'job_1001',
      jobNumber: 'JOB-1001',
      machineId: 'machine_001',
      pillTypeId: 'pill_amox500',
      targetQty: 250,
      actualQty: 249,
      lotPreferenceId: 'lot_amox_2401',
      tolerancePct: '2.00',
      status: 'COMPLETED',
      createdById: adminUser.id,
      operatorId: supervisorUser.id,
      startedAt: offsetIso(-2),
      completedAt: offsetIso(-2),
      notes: 'Routine morning batch',
      createdAt: offsetIso(-2),
      updatedAt: offsetIso(-2),
      machine: machines[0],
      pillType: pillTypes[0],
      lotPreference: lots[0],
      operator: userSummary(supervisorUser),
      createdBy: userSummary(adminUser)!
    },
    {
      id: 'job_1002',
      jobNumber: 'JOB-1002',
      machineId: 'machine_001',
      pillTypeId: 'pill_para500',
      targetQty: 500,
      actualQty: null,
      lotPreferenceId: 'lot_para_2409',
      tolerancePct: '2.00',
      status: 'IN_PROGRESS',
      createdById: adminUser.id,
      operatorId: supervisorUser.id,
      startedAt: offsetIso(-1),
      completedAt: null,
      notes: 'Afternoon fulfillment',
      createdAt: offsetIso(-1),
      updatedAt: offsetIso(-1),
      machine: machines[0],
      pillType: pillTypes[1],
      lotPreference: lots[1],
      operator: userSummary(supervisorUser),
      createdBy: userSummary(adminUser)!
    }
  ];

  const machineEvents: MachineEventRow[] = [
    {
      id: 'evt_register_001',
      machineId: 'machine_001',
      eventType: 'machine.register',
      payload: {
        machineCode: 'MCH-001',
        firmwareVersion: '1.2.0',
        location: 'Main Pharmacy'
      },
      occurredAt: offsetIso(-2),
      receivedAt: offsetIso(-2),
      idempotencyKey: 'seed-register-001',
      sourceIp: '10.0.0.15',
      sourceUserAgent: 'pillcount-firmware',
      machine: {
        id: 'machine_001',
        machineCode: 'MCH-001',
        location: 'Main Pharmacy',
        firmwareVersion: '1.2.0'
      }
    },
    {
      id: 'evt_heartbeat_001',
      machineId: 'machine_001',
      eventType: 'machine.heartbeat',
      payload: {
        status: 'ONLINE',
        queueDepth: 0
      },
      occurredAt: nowIso(),
      receivedAt: nowIso(),
      idempotencyKey: 'seed-heartbeat-001',
      sourceIp: '10.0.0.15',
      sourceUserAgent: 'pillcount-firmware',
      machine: {
        id: 'machine_001',
        machineCode: 'MCH-001',
        location: 'Main Pharmacy',
        firmwareVersion: '1.2.0'
      }
    },
    {
      id: 'evt_complete_1001',
      machineId: 'machine_001',
      eventType: 'count.completed',
      payload: {
        jobNumber: 'JOB-1001',
        actualQty: 249
      },
      occurredAt: offsetIso(-2),
      receivedAt: offsetIso(-2),
      idempotencyKey: 'seed-complete-1001',
      sourceIp: '10.0.0.15',
      sourceUserAgent: 'pillcount-firmware',
      machine: {
        id: 'machine_001',
        machineCode: 'MCH-001',
        location: 'Main Pharmacy',
        firmwareVersion: '1.2.0'
      }
    }
  ];

  const movements: InventoryMovement[] = [
    {
      id: 'txn_receive_amox',
      txnType: 'RECEIVE',
      quantity: 1200,
      location: 'Main Pharmacy',
      createdAt: offsetIso(-45),
      idempotencyKey: 'seed-receive-amox',
      pillType: { id: 'pill_amox500', code: 'AMOX500', name: 'Amoxicillin' },
      lot: { id: 'lot_amox_2401', lotNumber: 'AMX-LOT-2401', expiryDate: lots[0].expiryDate },
      machine: null,
      operator: userSummary(adminUser)
    },
    {
      id: 'txn_receive_para',
      txnType: 'RECEIVE',
      quantity: 2000,
      location: 'Main Pharmacy',
      createdAt: offsetIso(-30),
      idempotencyKey: 'seed-receive-para',
      pillType: { id: 'pill_para500', code: 'PARA500', name: 'Paracetamol' },
      lot: { id: 'lot_para_2409', lotNumber: 'PARA-LOT-2409', expiryDate: lots[1].expiryDate },
      machine: null,
      operator: userSummary(adminUser)
    },
    {
      id: 'txn_receive_ceti',
      txnType: 'RECEIVE',
      quantity: 800,
      location: 'Clinic Dispensary',
      createdAt: offsetIso(-10),
      idempotencyKey: 'seed-receive-ceti',
      pillType: { id: 'pill_ceti10', code: 'CETI10', name: 'Cetirizine' },
      lot: { id: 'lot_ceti_2501', lotNumber: 'CETI-LOT-2501', expiryDate: lots[2].expiryDate },
      machine: null,
      operator: userSummary(adminUser)
    }
  ];

  const apiKeys: ApiKeyRecord[] = [
    {
      id: 'api_key_seed',
      name: 'Seed machine key',
      keyPrefix: 'mch_live',
      scopes: ['machine:write', 'events:write'],
      isActive: true,
      createdAt,
      updatedAt: createdAt,
      lastUsedAt: offsetIso(-1)
    }
  ];

  const auditLogs: AuditLogRow[] = [
    {
      id: '1',
      actorType: 'SYSTEM',
      action: 'SEED /bootstrap',
      resourceType: 'system',
      resourceId: 'seed',
      requestId: 'seed-req-1',
      ipAddress: null,
      userAgent: null,
      metadata: { note: 'Demo dataset initialized' },
      createdAt,
      actorUser: null,
      actorApiKey: null
    }
  ];

  const liveEvents: DemoLiveEvent[] = [
    {
      type: 'machine.heartbeat',
      payload: {
        machineCode: 'MCH-001',
        status: 'ONLINE'
      },
      emittedAt: nowIso()
    }
  ];

  return {
    users: [adminUser, supervisorUser],
    roles,
    machines,
    machineEvents,
    pillTypes,
    lots,
    balances,
    movements,
    jobs,
    apiKeys,
    auditLogs,
    liveEvents
  };
}

function ensureBrowser() {
  if (typeof window === 'undefined') {
    throw new DemoApiError('Demo mode is only available in the browser.', 500);
  }
}

function readState(): DemoState {
  ensureBrowser();
  const raw = window.localStorage.getItem(DEMO_STATE_KEY);
  if (!raw) {
    const seed = buildSeedState();
    writeState(seed);
    return seed;
  }

  try {
    return JSON.parse(raw) as DemoState;
  } catch (_error) {
    const seed = buildSeedState();
    writeState(seed);
    return seed;
  }
}

function writeState(state: DemoState) {
  ensureBrowser();
  rehydrateState(state);
  window.localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(DEMO_STATE_EVENT));
}

function machineSummary(machine: Machine | null | undefined) {
  return machine
    ? {
        id: machine.id,
        machineCode: machine.machineCode,
        location: machine.location,
        firmwareVersion: machine.firmwareVersion
      }
    : null;
}

function pillTypeSummary(pillType: PillType | null | undefined) {
  return pillType
    ? {
        id: pillType.id,
        code: pillType.code,
        name: pillType.name
      }
    : null;
}

function lotSummary(lot: Lot | null | undefined) {
  return lot
    ? {
        id: lot.id,
        lotNumber: lot.lotNumber,
        expiryDate: lot.expiryDate
      }
    : null;
}

function apiKeySummary(apiKey: ApiKeyRecord | null | undefined) {
  return apiKey
    ? {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix
      }
    : null;
}

function rehydrateState(state: DemoState) {
  const pillTypeById = new Map(state.pillTypes.map((entry) => [entry.id, entry]));
  const userById = new Map(state.users.map((entry) => [entry.id, entry]));
  const apiKeyById = new Map(state.apiKeys.map((entry) => [entry.id, entry]));

  state.machines = state.machines.map((machine) => ({
    ...machine,
    displayStatus: machine.status
  }));
  const machineById = new Map(state.machines.map((entry) => [entry.id, entry]));

  state.lots = state.lots.map((lot) => ({
    ...lot,
    pillType: pillTypeSummary(pillTypeById.get(lot.pillTypeId)) || lot.pillType
  }));
  const lotById = new Map(state.lots.map((entry) => [entry.id, entry]));

  state.balances = state.balances.map((balance) => ({
    ...balance,
    pillType: pillTypeSummary(pillTypeById.get(balance.pillTypeId)) || balance.pillType,
    lot: lotById.get(balance.lotId) || balance.lot
  }));

  state.machineEvents = state.machineEvents.map((event) => ({
    ...event,
    machine: machineSummary(machineById.get(event.machineId)) || event.machine
  }));

  state.movements = state.movements.map((movement) => {
    const movementPillType =
      typeof movement.pillType?.id === 'string' ? pillTypeById.get(movement.pillType.id) : null;
    const movementLot = typeof movement.lot?.id === 'string' ? lotById.get(movement.lot.id) : null;
    const movementMachine = typeof movement.machine?.id === 'string' ? machineById.get(movement.machine.id) : null;
    const movementOperator =
      typeof movement.operator?.id === 'string' ? userById.get(movement.operator.id) : null;

    return {
      ...movement,
      pillType: pillTypeSummary(movementPillType) || movement.pillType,
      lot: lotSummary(movementLot) || movement.lot,
      machine: movementMachine ? { id: movementMachine.id, machineCode: movementMachine.machineCode } : movement.machine,
      operator: userSummary(movementOperator) || movement.operator
    };
  });

  state.jobs = state.jobs.map((job) => ({
    ...job,
    machine: machineById.get(job.machineId) || job.machine,
    pillType: pillTypeById.get(job.pillTypeId) || job.pillType,
    lotPreference: job.lotPreferenceId ? lotById.get(job.lotPreferenceId) || null : null,
    operator: job.operatorId ? userSummary(userById.get(job.operatorId)) : null,
    createdBy: userSummary(userById.get(job.createdById)) || job.createdBy
  }));

  state.auditLogs = state.auditLogs.map((log) => ({
    ...log,
    actorUser: log.actorUserId ? userSummary(userById.get(log.actorUserId)) : null,
    actorApiKey: log.actorApiKeyId ? apiKeySummary(apiKeyById.get(log.actorApiKeyId)) : null
  }));
}

function getCurrentUser(state: DemoState): DemoUser | null {
  const accessToken = getAccessToken();
  if (!accessToken.startsWith('demo-access:')) {
    return null;
  }

  const userId = accessToken.split(':')[1];
  return state.users.find((user) => user.id === userId) || null;
}

function issueTokens(userId: string) {
  return {
    accessToken: `demo-access:${userId}:${Date.now()}`,
    refreshToken: `demo-refresh:${userId}:${Date.now()}`
  };
}

function parseBody(body: BodyInit | null | undefined): Record<string, any> {
  if (!body) {
    return {};
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (_error) {
      return {};
    }
  }

  return {};
}

function pushAuditLog(
  state: DemoState,
  input: {
    actorType?: 'USER' | 'API_KEY' | 'SYSTEM';
    actorUser?: DemoUser | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  const entry: AuditLogRow = {
    id: String(state.auditLogs.length + 1),
    actorType: input.actorType || 'USER',
    actorUserId: input.actorUser?.id || null,
    actorApiKeyId: null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId || null,
    requestId: createId('req'),
    ipAddress: '127.0.0.1',
    userAgent: 'demo-preview',
    metadata: input.metadata || null,
    createdAt: nowIso(),
    actorUser: userSummary(input.actorUser),
    actorApiKey: null
  };

  state.auditLogs.unshift(entry);
}

function pushLiveEvent(state: DemoState, type: string, payload: Record<string, unknown>) {
  state.liveEvents.unshift({
    type,
    payload,
    emittedAt: nowIso()
  });
  state.liveEvents = state.liveEvents.slice(0, 30);
}

function computeOverview(state: DemoState): ReportsOverview {
  return {
    machinesTotal: state.machines.length,
    machinesOnline: state.machines.filter((machine) => (machine.displayStatus || machine.status) === 'ONLINE').length,
    jobsTotal: state.jobs.length,
    jobsCompleted: state.jobs.filter((job) => job.status === 'COMPLETED').length,
    pillsTotal: state.pillTypes.length,
    inventoryMovements: state.movements.length
  };
}

function computeThroughput(state: DemoState): ThroughputRow[] {
  return state.jobs
    .filter((job) => job.status === 'COMPLETED' && job.completedAt)
    .map((job) => ({
      jobId: job.id,
      jobNumber: job.jobNumber,
      machineCode: job.machine.machineCode,
      pillTypeCode: job.pillType.code,
      pillName: job.pillType.name,
      targetQty: job.targetQty,
      actualQty: job.actualQty || 0,
      completedAt: job.completedAt || job.updatedAt
    }))
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
}

function computeValuation(state: DemoState): ValuationRow[] {
  const byLocation = new Map<string, { totalValue: number; lines: number }>();

  for (const balance of state.balances) {
    const unitCost = Number(balance.lot.unitCost || 0);
    const bucket = byLocation.get(balance.location) || { totalValue: 0, lines: 0 };
    bucket.totalValue += balance.onHand * unitCost;
    bucket.lines += 1;
    byLocation.set(balance.location, bucket);
  }

  return Array.from(byLocation.entries()).map(([location, value]) => ({
    location,
    totalValue: Number(value.totalValue.toFixed(2)),
    lines: value.lines
  }));
}

function findBalance(state: DemoState, pillTypeId: string, lotId: string, location: string) {
  return state.balances.find((balance) => balance.pillTypeId === pillTypeId && balance.lotId === lotId && balance.location === location);
}

function ensureBalance(state: DemoState, pillTypeId: string, lotId: string, location: string) {
  let balance = findBalance(state, pillTypeId, lotId, location);
  if (balance) {
    return balance;
  }

  const pillType = state.pillTypes.find((item) => item.id === pillTypeId);
  const lot = state.lots.find((item) => item.id === lotId);
  if (!pillType || !lot) {
    throw new DemoApiError('Balance target not found.', 404);
  }

  balance = {
    id: createId('bal'),
    pillTypeId,
    lotId,
    location,
    onHand: 0,
    reserved: 0,
    quarantined: 0,
    updatedAt: nowIso(),
    pillType: {
      id: pillType.id,
      code: pillType.code,
      name: pillType.name
    },
    lot
  };

  state.balances.push(balance);
  return balance;
}

function addMovement(
  state: DemoState,
  input: {
    txnType: InventoryMovement['txnType'];
    quantity: number;
    pillTypeId: string;
    lotId?: string | null;
    location: string;
    fromLocation?: string | null;
    toLocation?: string | null;
    operator?: DemoUser | null;
    machine?: Machine | null;
    idempotencyKey?: string | null;
  }
) {
  const pillType = state.pillTypes.find((item) => item.id === input.pillTypeId);
  if (!pillType) {
    throw new DemoApiError('Pill type not found.', 404);
  }

  const lot = input.lotId ? state.lots.find((item) => item.id === input.lotId) : null;
  const movement: InventoryMovement = {
    id: createId('txn'),
    txnType: input.txnType,
    quantity: input.quantity,
    location: input.location,
    fromLocation: input.fromLocation || null,
    toLocation: input.toLocation || null,
    createdAt: nowIso(),
    idempotencyKey: input.idempotencyKey || null,
    pillType: {
      id: pillType.id,
      code: pillType.code,
      name: pillType.name
    },
    lot: lot
      ? {
          id: lot.id,
          lotNumber: lot.lotNumber,
          expiryDate: lot.expiryDate
        }
      : null,
    machine: input.machine ? { id: input.machine.id, machineCode: input.machine.machineCode } : null,
    operator: userSummary(input.operator)
  };

  state.movements.unshift(movement);
  return movement;
}

function formatCsvRow(values: Array<string | number | null | undefined>) {
  return values
    .map((value) => {
      const normalized = String(value ?? '');
      if (normalized.includes(',') || normalized.includes('"') || normalized.includes('\n')) {
        return `"${normalized.replace(/"/g, '""')}"`;
      }
      return normalized;
    })
    .join(',');
}

function exportRecordsCsv(state: DemoState) {
  const rows = [
    ['jobNumber', 'machineCode', 'pillTypeCode', 'status', 'targetQty', 'actualQty', 'completedAt'],
    ...state.jobs.map((job) => [
      job.jobNumber,
      job.machine.machineCode,
      job.pillType.code,
      job.status,
      job.targetQty,
      job.actualQty || '',
      job.completedAt || ''
    ])
  ];

  return rows.map((row) => formatCsvRow(row)).join('\n');
}

function exportInventoryCsv(state: DemoState) {
  const rows = [
    ['createdAt', 'txnType', 'pillTypeCode', 'lotNumber', 'location', 'quantity'],
    ...state.movements.map((movement) => [
      movement.createdAt,
      movement.txnType,
      movement.pillType.code,
      movement.lot?.lotNumber || '',
      movement.location,
      movement.quantity
    ])
  ];

  return rows.map((row) => formatCsvRow(row)).join('\n');
}

function requireUser(state: DemoState) {
  const user = getCurrentUser(state);
  if (!user) {
    throw new DemoApiError('Authentication required.', 401);
  }
  return user;
}

function requireAdminUser(state: DemoState) {
  const user = requireUser(state);
  if (!user.roles.includes('ADMIN')) {
    throw new DemoApiError('Admin role required.', 403);
  }
  return user;
}

function getAdminModel(modelName: string) {
  const model = DEMO_ADMIN_MODEL_MAP.get(modelName);
  if (!model) {
    throw new DemoApiError(`Unknown model: ${modelName}`, 404, 'ADMIN_MODEL_NOT_FOUND');
  }
  return model;
}

function getAdminCollection(state: DemoState, model: DemoAdminModelConfig) {
  return state[model.stateKey] as unknown as AdminRow[];
}

function matchesAdminWhere(row: AdminRow, where: Record<string, unknown>, model: DemoAdminModelConfig) {
  return model.primaryKeyFields.every((fieldName) => JSON.stringify(row[fieldName]) === JSON.stringify(where[fieldName]));
}

function findAdminRowIndex(state: DemoState, model: DemoAdminModelConfig, where: Record<string, unknown>) {
  const collection = getAdminCollection(state, model);
  return collection.findIndex((row) => matchesAdminWhere(row, where, model));
}

function applyAdminDefaults(state: DemoState, model: DemoAdminModelConfig, input: Record<string, unknown>) {
  const row: Record<string, unknown> = { ...input };
  const now = nowIso();

  if (model.primaryKeyFields.includes('id') && !row.id) {
    row.id = model.name === 'AuditLog' ? String(state.auditLogs.length + 1) : createId(model.name.toLowerCase());
  }

  if (model.name === 'User') {
    if (!Array.isArray(row.roles)) row.roles = ['VIEWER'];
    if (!row.password) row.password = DEMO_DEFAULT_PASSWORD;
    if (row.isActive === undefined) row.isActive = true;
  }

  if (model.name === 'Role' && !Array.isArray(row.permissions)) {
    row.permissions = [];
  }

  if (model.name === 'Machine' && !row.status) {
    row.status = 'UNKNOWN';
  }

  if (model.name === 'Lot' && row.isQuarantined === undefined) {
    row.isQuarantined = false;
  }

  if (model.name === 'InventoryBalance') {
    if (row.onHand === undefined) row.onHand = 0;
    if (row.reserved === undefined) row.reserved = 0;
    if (row.quarantined === undefined) row.quarantined = 0;
  }

  if (model.name === 'CountingJob') {
    if (!row.jobNumber) row.jobNumber = buildJobNumber(state);
    if (!row.status) row.status = 'CREATED';
    if (!row.tolerancePct) row.tolerancePct = '2.00';
  }

  if (model.name === 'ApiKey') {
    if (!Array.isArray(row.scopes)) row.scopes = [];
    if (row.isActive === undefined) row.isActive = true;
    if (!row.keyPrefix) row.keyPrefix = `demo_${Math.random().toString(36).slice(2, 10)}`;
  }

  if (model.fields.some((field) => field.name === 'createdAt') && !row.createdAt) {
    row.createdAt = now;
  }

  if (model.fields.some((field) => field.name === 'updatedAt') && !row.updatedAt) {
    row.updatedAt = now;
  }

  return row;
}

function listAdminModels() {
  return DEMO_ADMIN_MODELS.map<AdminModelMeta>((model) => ({
    name: model.name,
    primaryKeyFields: clone(model.primaryKeyFields),
    fields: clone(model.fields)
  }));
}

function listAdminRows(state: DemoState, modelName: string, limit: number) {
  const model = getAdminModel(modelName);
  const collection = getAdminCollection(state, model);
  const take = Math.min(Math.max(Number(limit || 100), 1), 250);
  const rows = clone(collection.slice(0, take));

  const payload: AdminRowsResponse = {
    model: model.name,
    primaryKeyFields: clone(model.primaryKeyFields),
    rows
  };

  return payload;
}

function createAdminRow(state: DemoState, modelName: string, data: Record<string, unknown>) {
  const model = getAdminModel(modelName);
  const collection = getAdminCollection(state, model);
  const row = applyAdminDefaults(state, model, data || {});
  collection.unshift(row);
  return row;
}

function updateAdminRow(state: DemoState, modelName: string, where: Record<string, unknown>, data: Record<string, unknown>) {
  const model = getAdminModel(modelName);
  const collection = getAdminCollection(state, model);
  const index = findAdminRowIndex(state, model, where || {});

  if (index === -1) {
    throw new DemoApiError('Row not found.', 404, 'ADMIN_ROW_NOT_FOUND');
  }

  const existing = collection[index] as Record<string, unknown>;
  const nextRow = { ...existing, ...data };

  if (model.fields.some((field) => field.name === 'updatedAt')) {
    nextRow.updatedAt = nowIso();
  }

  collection[index] = nextRow;
  return nextRow;
}

function deleteAdminRow(state: DemoState, modelName: string, where: Record<string, unknown>) {
  const model = getAdminModel(modelName);
  const collection = getAdminCollection(state, model);
  const index = findAdminRowIndex(state, model, where || {});

  if (index === -1) {
    throw new DemoApiError('Row not found.', 404, 'ADMIN_ROW_NOT_FOUND');
  }

  const [deleted] = collection.splice(index, 1);
  return deleted;
}

function handleAuthLogin(state: DemoState, body: Record<string, any>) {
  const user = state.users.find((entry) => entry.email.toLowerCase() === String(body.email || '').trim().toLowerCase());
  if (!user || user.password !== body.password) {
    throw new DemoApiError('Invalid email or password.', 401);
  }
  pushAuditLog(state, {
    actorUser: user,
    action: 'POST /auth/login',
    resourceType: 'auth',
    resourceId: user.id
  });
  writeState(state);
  return issueTokens(user.id);
}

function handleAuthRegister(state: DemoState, body: Record<string, any>) {
  const email = String(body.email || '').trim().toLowerCase();
  const fullName = String(body.fullName || '').trim();
  const password = String(body.password || '');

  if (!email || !fullName || !password) {
    throw new DemoApiError('Full name, email, and password are required.', 400);
  }

  if (state.users.some((entry) => entry.email.toLowerCase() === email)) {
    throw new DemoApiError('A user with this email already exists.', 409);
  }

  const user: DemoUser = {
    id: createId('user'),
    email,
    fullName,
    isActive: true,
    createdAt: nowIso(),
    roles: ['VIEWER'],
    password
  };

  state.users.unshift(user);
  pushAuditLog(state, {
    actorUser: user,
    action: 'POST /auth/register',
    resourceType: 'user',
    resourceId: user.id
  });
  pushLiveEvent(state, 'user.registered', { email: user.email, fullName: user.fullName });
  writeState(state);
  return issueTokens(user.id);
}

function buildJobNumber(state: DemoState) {
  return `JOB-${1000 + state.jobs.length + 1}`;
}

function computeJobStatus(targetQty: number, actualQty: number, tolerancePct: number): JobStatus {
  const variance = Math.abs(actualQty - targetQty);
  const threshold = Math.ceil((targetQty * tolerancePct) / 100);
  return variance <= threshold ? 'COMPLETED' : 'NEEDS_RECOUNT';
}

function pickFefoLot(state: DemoState, pillTypeId: string, location: string, quantity: number) {
  return state.balances
    .filter((balance) => balance.pillTypeId === pillTypeId && balance.location === location && !balance.lot.isQuarantined)
    .sort((a, b) => new Date(a.lot.expiryDate).getTime() - new Date(b.lot.expiryDate).getTime())
    .find((balance) => balance.onHand - balance.reserved - balance.quarantined >= quantity);
}

function applyInventoryAction(state: DemoState, pathname: string, body: Record<string, any>) {
  const user = requireUser(state);
  const quantity = Number(body.quantity || 0);
  const quantityDelta = Number(body.quantityDelta || 0);
  const pillTypeId = String(body.pillTypeId || '');
  const lotId = String(body.lotId || '');
  const location = String(body.location || '');
  const idempotencyKey = String(body.idempotencyKey || createId('idem'));

  if (!pillTypeId) {
    throw new DemoApiError('Pill type is required.', 400);
  }

  if (pathname === '/inventory/receive') {
    const balance = ensureBalance(state, pillTypeId, lotId, location);
    balance.onHand += quantity;
    balance.updatedAt = nowIso();
    addMovement(state, { txnType: 'RECEIVE', quantity, pillTypeId, lotId, location, operator: user, idempotencyKey });
  } else if (pathname === '/inventory/transfer') {
    const fromLocation = String(body.fromLocation || '');
    const toLocation = String(body.toLocation || '');
    const fromBalance = ensureBalance(state, pillTypeId, lotId, fromLocation);
    if (fromBalance.onHand < quantity) {
      throw new DemoApiError('Insufficient stock for transfer.', 400);
    }
    fromBalance.onHand -= quantity;
    fromBalance.updatedAt = nowIso();
    const toBalance = ensureBalance(state, pillTypeId, lotId, toLocation);
    toBalance.onHand += quantity;
    toBalance.updatedAt = nowIso();
    addMovement(state, {
      txnType: 'TRANSFER',
      quantity,
      pillTypeId,
      lotId,
      location: toLocation,
      fromLocation,
      toLocation,
      operator: user,
      idempotencyKey
    });
  } else if (pathname === '/inventory/adjust') {
    const balance = ensureBalance(state, pillTypeId, lotId, location);
    balance.onHand += quantityDelta;
    balance.updatedAt = nowIso();
    addMovement(state, {
      txnType: 'ADJUST',
      quantity: quantityDelta,
      pillTypeId,
      lotId,
      location,
      operator: user,
      idempotencyKey
    });
  } else if (pathname === '/inventory/reserve') {
    const balance = ensureBalance(state, pillTypeId, lotId, location);
    if (balance.onHand - balance.reserved - balance.quarantined < quantity) {
      throw new DemoApiError('Insufficient available stock to reserve.', 400);
    }
    balance.reserved += quantity;
    balance.updatedAt = nowIso();
    addMovement(state, { txnType: 'RESERVE', quantity, pillTypeId, lotId, location, operator: user, idempotencyKey });
  } else if (pathname === '/inventory/release') {
    const balance = ensureBalance(state, pillTypeId, lotId, location);
    balance.reserved = Math.max(0, balance.reserved - quantity);
    balance.updatedAt = nowIso();
    addMovement(state, { txnType: 'RELEASE', quantity, pillTypeId, lotId, location, operator: user, idempotencyKey });
  } else if (pathname === '/inventory/dispense') {
    const targetBalance = lotId ? ensureBalance(state, pillTypeId, lotId, location) : pickFefoLot(state, pillTypeId, location, quantity);
    if (!targetBalance) {
      throw new DemoApiError('No FEFO lot available for dispense.', 400);
    }
    if (targetBalance.onHand - targetBalance.reserved - targetBalance.quarantined < quantity) {
      throw new DemoApiError('Insufficient available stock to dispense.', 400);
    }
    targetBalance.onHand -= quantity;
    targetBalance.updatedAt = nowIso();
    addMovement(state, {
      txnType: 'DISPENSE',
      quantity,
      pillTypeId,
      lotId: targetBalance.lotId,
      location,
      operator: user,
      idempotencyKey
    });
  } else {
    throw new DemoApiError('Unsupported inventory action.', 404);
  }

  pushAuditLog(state, {
    actorUser: user,
    action: `POST ${pathname}`,
    resourceType: 'inventory',
    resourceId: pillTypeId
  });
  pushLiveEvent(state, 'inventory.updated', { action: pathname, pillTypeId, quantity: quantity || quantityDelta });
  writeState(state);
  return { ok: true };
}

export function isDemoMode() {
  return DEMO_MODE;
}

export function getDemoLiveEvents() {
  if (!DEMO_MODE || typeof window === 'undefined') {
    return [];
  }
  return clone(readState().liveEvents);
}

export async function demoApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const url = new URL(path, 'https://demo.local');
  const pathname = url.pathname;
  const body = parseBody(init.body);
  const state = readState();

  if (method === 'POST' && pathname === '/auth/login') {
    return clone(handleAuthLogin(state, body)) as T;
  }

  if (method === 'POST' && pathname === '/auth/register') {
    return clone(handleAuthRegister(state, body)) as T;
  }

  if (method === 'POST' && pathname === '/auth/refresh') {
    const refreshToken = String(body.refreshToken || '');
    if (!refreshToken.startsWith('demo-refresh:')) {
      throw new DemoApiError('Invalid refresh token.', 401);
    }
    const userId = refreshToken.split(':')[1];
    const user = state.users.find((entry) => entry.id === userId);
    if (!user) {
      throw new DemoApiError('User not found.', 401);
    }
    return clone(issueTokens(user.id)) as T;
  }

  if (method === 'GET' && pathname === '/auth/me') {
    const user = requireUser(state);
    const profile: MeProfile = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: clone(user.roles)
    };
    return profile as T;
  }

  if (method === 'GET' && pathname === '/admin/models') {
    requireAdminUser(state);
    return clone(listAdminModels()) as T;
  }

  const adminRowsMatch = pathname.match(/^\/admin\/models\/([^/]+)\/rows$/);
  if (method === 'GET' && adminRowsMatch) {
    requireAdminUser(state);
    const limit = Number(url.searchParams.get('limit') || '100');
    return clone(listAdminRows(state, decodeURIComponent(adminRowsMatch[1]), limit)) as T;
  }

  if (method === 'POST' && adminRowsMatch) {
    const actor = requireAdminUser(state);
    const modelName = decodeURIComponent(adminRowsMatch[1]);
    const createdRow = createAdminRow(state, modelName, body.data || {});
    pushAuditLog(state, {
      actorUser: actor,
      action: 'ADMIN CREATE',
      resourceType: modelName,
      resourceId: String((createdRow as Record<string, unknown>).id || '')
    });
    pushLiveEvent(state, 'admin.row.created', { model: modelName });
    writeState(state);
    return clone(createdRow) as T;
  }

  if (method === 'PATCH' && adminRowsMatch) {
    const actor = requireAdminUser(state);
    const modelName = decodeURIComponent(adminRowsMatch[1]);
    const updatedRow = updateAdminRow(state, modelName, body.where || {}, body.data || {});
    pushAuditLog(state, {
      actorUser: actor,
      action: 'ADMIN UPDATE',
      resourceType: modelName,
      resourceId: String((updatedRow as Record<string, unknown>).id || '')
    });
    pushLiveEvent(state, 'admin.row.updated', { model: modelName });
    writeState(state);
    return clone(updatedRow) as T;
  }

  const adminDeleteMatch = pathname.match(/^\/admin\/models\/([^/]+)\/delete$/);
  if (method === 'POST' && adminDeleteMatch) {
    const actor = requireAdminUser(state);
    const modelName = decodeURIComponent(adminDeleteMatch[1]);
    const deletedRow = deleteAdminRow(state, modelName, body.where || {});
    pushAuditLog(state, {
      actorUser: actor,
      action: 'ADMIN DELETE',
      resourceType: modelName,
      resourceId: String((deletedRow as Record<string, unknown>).id || '')
    });
    pushLiveEvent(state, 'admin.row.deleted', { model: modelName });
    writeState(state);
    return clone(deletedRow) as T;
  }

  if (method === 'GET' && pathname === '/machines') {
    return clone(state.machines) as T;
  }

  if (method === 'GET' && pathname === '/machine-events') {
    const page = Number(url.searchParams.get('page') || '1');
    const pageSize = Number(url.searchParams.get('pageSize') || '50');
    const machineFilter = (url.searchParams.get('machineId') || '').trim().toLowerCase();
    const eventTypeFilter = (url.searchParams.get('eventType') || '').trim().toLowerCase();
    const filtered = state.machineEvents.filter((event) => {
      const machineMatch = !machineFilter || event.machine.machineCode.toLowerCase().includes(machineFilter) || event.machineId === machineFilter;
      const eventMatch = !eventTypeFilter || event.eventType.toLowerCase().includes(eventTypeFilter);
      return machineMatch && eventMatch;
    });
    const start = Math.max(0, (page - 1) * pageSize);
    const payload: EventListResponse = {
      page,
      pageSize,
      total: filtered.length,
      rows: clone(filtered.slice(start, start + pageSize))
    };
    return payload as T;
  }

  if (method === 'GET' && pathname === '/pill-types') {
    return clone(state.pillTypes) as T;
  }

  if (method === 'GET' && pathname === '/lots') {
    return clone(state.lots) as T;
  }

  if (method === 'POST' && pathname === '/lots') {
    const user = requireUser(state);
    const pillType = state.pillTypes.find((entry) => entry.id === body.pillTypeId);
    if (!pillType) {
      throw new DemoApiError('Pill type not found.', 404);
    }
    const lot: Lot = {
      id: createId('lot'),
      pillTypeId: pillType.id,
      lotNumber: String(body.lotNumber || ''),
      expiryDate: String(body.expiryDate || nowIso()),
      receivedDate: String(body.receivedDate || nowIso()),
      unitCost: Number(body.unitCost || 0).toFixed(2),
      location: String(body.location || 'Main Pharmacy'),
      isQuarantined: Boolean(body.isQuarantined),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      pillType: {
        id: pillType.id,
        code: pillType.code,
        name: pillType.name
      }
    };
    state.lots.unshift(lot);
    pushAuditLog(state, { actorUser: user, action: 'POST /lots', resourceType: 'lot', resourceId: lot.id });
    pushLiveEvent(state, 'lot.created', { lotNumber: lot.lotNumber, pillTypeCode: pillType.code });
    writeState(state);
    return clone(lot) as T;
  }

  const lotMatch = pathname.match(/^\/lots\/([^/]+)$/);
  if (method === 'PATCH' && lotMatch) {
    const user = requireUser(state);
    const lot = state.lots.find((entry) => entry.id === lotMatch[1]);
    if (!lot) {
      throw new DemoApiError('Lot not found.', 404);
    }
    if (typeof body.isQuarantined === 'boolean') {
      lot.isQuarantined = body.isQuarantined;
      lot.updatedAt = nowIso();
    }
    pushAuditLog(state, { actorUser: user, action: 'PATCH /lots', resourceType: 'lot', resourceId: lot.id });
    pushLiveEvent(state, lot.isQuarantined ? 'lot.quarantined' : 'lot.released', { lotNumber: lot.lotNumber });
    writeState(state);
    return clone(lot) as T;
  }

  if (method === 'GET' && pathname === '/inventory/balances') {
    return clone(state.balances) as T;
  }

  if (method === 'GET' && pathname === '/inventory/movements') {
    const limit = Number(url.searchParams.get('limit') || state.movements.length);
    return clone(state.movements.slice(0, limit)) as T;
  }

  if (method === 'POST' && pathname.startsWith('/inventory/')) {
    return clone(applyInventoryAction(state, pathname, body)) as T;
  }

  if (method === 'GET' && pathname === '/jobs') {
    return clone(state.jobs) as T;
  }

  if (method === 'POST' && pathname === '/jobs') {
    const user = requireUser(state);
    const machine = state.machines.find((entry) => entry.id === body.machineId);
    const pillType = state.pillTypes.find((entry) => entry.id === body.pillTypeId);
    if (!machine || !pillType) {
      throw new DemoApiError('Machine and pill type are required.', 400);
    }
    const lotPreference = body.lotPreferenceId ? state.lots.find((entry) => entry.id === body.lotPreferenceId) : null;
    const operator = body.operatorId ? state.users.find((entry) => entry.id === body.operatorId) : null;
    const job: CountingJob = {
      id: createId('job'),
      jobNumber: buildJobNumber(state),
      machineId: machine.id,
      pillTypeId: pillType.id,
      targetQty: Number(body.targetQty || 0),
      actualQty: null,
      lotPreferenceId: lotPreference?.id || null,
      tolerancePct: Number(body.tolerancePct || 2).toFixed(2),
      status: 'CREATED',
      createdById: user.id,
      operatorId: operator?.id || null,
      startedAt: null,
      completedAt: null,
      notes: String(body.notes || '') || null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      machine,
      pillType,
      lotPreference,
      operator: userSummary(operator),
      createdBy: userSummary(user)!
    };
    state.jobs.unshift(job);
    pushAuditLog(state, { actorUser: user, action: 'POST /jobs', resourceType: 'job', resourceId: job.id });
    pushLiveEvent(state, 'job.created', { jobNumber: job.jobNumber, machineCode: machine.machineCode });
    writeState(state);
    return clone(job) as T;
  }

  const startJobMatch = pathname.match(/^\/jobs\/([^/]+)\/start$/);
  if (method === 'POST' && startJobMatch) {
    const user = requireUser(state);
    const job = state.jobs.find((entry) => entry.id === startJobMatch[1]);
    if (!job) {
      throw new DemoApiError('Job not found.', 404);
    }
    job.status = 'IN_PROGRESS';
    job.startedAt = nowIso();
    job.updatedAt = nowIso();
    pushAuditLog(state, { actorUser: user, action: 'POST /jobs/start', resourceType: 'job', resourceId: job.id });
    pushLiveEvent(state, 'job.started', { jobNumber: job.jobNumber });
    writeState(state);
    return clone(job) as T;
  }

  const completeJobMatch = pathname.match(/^\/jobs\/([^/]+)\/complete$/);
  if (method === 'POST' && completeJobMatch) {
    const user = requireUser(state);
    const job = state.jobs.find((entry) => entry.id === completeJobMatch[1]);
    if (!job) {
      throw new DemoApiError('Job not found.', 404);
    }
    const actualQty = Number(body.actualQty || 0);
    const tolerancePct = Number(job.tolerancePct || 2);
    job.actualQty = actualQty;
    job.status = computeJobStatus(job.targetQty, actualQty, tolerancePct);
    job.completedAt = nowIso();
    job.updatedAt = nowIso();
    pushAuditLog(state, { actorUser: user, action: 'POST /jobs/complete', resourceType: 'job', resourceId: job.id });
    pushLiveEvent(state, 'count.completed', { jobNumber: job.jobNumber, actualQty });
    state.machineEvents.unshift({
      id: createId('evt'),
      machineId: job.machine.id,
      eventType: 'count.completed',
      payload: { jobNumber: job.jobNumber, actualQty },
      occurredAt: nowIso(),
      receivedAt: nowIso(),
      idempotencyKey: createId('idem'),
      sourceIp: '127.0.0.1',
      sourceUserAgent: 'demo-preview',
      machine: {
        id: job.machine.id,
        machineCode: job.machine.machineCode,
        location: job.machine.location,
        firmwareVersion: job.machine.firmwareVersion
      }
    });
    writeState(state);
    return clone(job) as T;
  }

  const recountJobMatch = pathname.match(/^\/jobs\/([^/]+)\/recount$/);
  if (method === 'POST' && recountJobMatch) {
    const user = requireUser(state);
    const original = state.jobs.find((entry) => entry.id === recountJobMatch[1]);
    if (!original) {
      throw new DemoApiError('Job not found.', 404);
    }
    const recountJob: CountingJob = {
      ...clone(original),
      id: createId('job'),
      jobNumber: buildJobNumber(state),
      status: 'CREATED',
      actualQty: null,
      startedAt: null,
      completedAt: null,
      notes: String(body.reason || 'Recount requested'),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.jobs.unshift(recountJob);
    pushAuditLog(state, { actorUser: user, action: 'POST /jobs/recount', resourceType: 'job', resourceId: recountJob.id });
    pushLiveEvent(state, 'job.recount_requested', { sourceJobNumber: original.jobNumber, recountJobNumber: recountJob.jobNumber });
    writeState(state);
    return clone(recountJob) as T;
  }

  if (method === 'GET' && pathname === '/reports/overview') {
    return computeOverview(state) as T;
  }

  if (method === 'GET' && pathname === '/reports/throughput') {
    return computeThroughput(state) as T;
  }

  if (method === 'GET' && pathname === '/reports/valuation') {
    return computeValuation(state) as T;
  }

  if (method === 'GET' && pathname === '/users') {
    return clone(
      state.users.map((user) => ({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isActive: user.isActive,
        createdAt: user.createdAt,
        roles: clone(user.roles)
      }))
    ) as T;
  }

  if (method === 'GET' && pathname === '/users/roles/catalog') {
    return clone(state.roles) as T;
  }

  if (method === 'GET' && pathname === '/rbac/matrix') {
    return clone(state.roles) as T;
  }

  const assignRolesMatch = pathname.match(/^\/users\/([^/]+)\/roles$/);
  if (method === 'PATCH' && assignRolesMatch) {
    const actor = requireUser(state);
    const user = state.users.find((entry) => entry.id === assignRolesMatch[1]);
    if (!user) {
      throw new DemoApiError('User not found.', 404);
    }
    const roles = Array.isArray(body.roleIds) ? body.roleIds : [];
    const codes = state.roles.filter((role) => roles.includes(role.id)).map((role) => role.code);
    user.roles = codes.length ? codes : ['VIEWER'];
    pushAuditLog(state, { actorUser: actor, action: 'PATCH /users/roles', resourceType: 'user', resourceId: user.id });
    pushLiveEvent(state, 'user.roles_updated', { email: user.email, roles: user.roles });
    writeState(state);
    return clone(user) as T;
  }

  if (method === 'GET' && pathname === '/api-keys') {
    return clone(state.apiKeys) as T;
  }

  if (method === 'POST' && pathname === '/api-keys') {
    const actor = requireUser(state);
    const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : [];
    const plainKey = `pc_demo_${Math.random().toString(36).slice(2, 18)}`;
    const record: ApiKeyRecord = {
      id: createId('api'),
      name: String(body.name || 'Demo API Key'),
      keyPrefix: plainKey.slice(0, 8),
      scopes,
      isActive: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastUsedAt: null
    };
    state.apiKeys.unshift(record);
    pushAuditLog(state, { actorUser: actor, action: 'POST /api-keys', resourceType: 'api-key', resourceId: record.id });
    pushLiveEvent(state, 'api_key.created', { name: record.name, keyPrefix: record.keyPrefix });
    writeState(state);
    const payload: ApiKeyCreateResponse = { ...record, plainKey };
    return payload as T;
  }

  const revokeApiKeyMatch = pathname.match(/^\/api-keys\/([^/]+)$/);
  if (method === 'DELETE' && revokeApiKeyMatch) {
    const actor = requireUser(state);
    const record = state.apiKeys.find((entry) => entry.id === revokeApiKeyMatch[1]);
    if (!record) {
      throw new DemoApiError('API key not found.', 404);
    }
    record.isActive = false;
    record.updatedAt = nowIso();
    pushAuditLog(state, { actorUser: actor, action: 'DELETE /api-keys', resourceType: 'api-key', resourceId: record.id });
    pushLiveEvent(state, 'api_key.revoked', { name: record.name, keyPrefix: record.keyPrefix });
    writeState(state);
    return clone(record) as T;
  }

  if (method === 'GET' && pathname === '/audit/logs') {
    const resourceType = (url.searchParams.get('resourceType') || '').trim().toLowerCase();
    const action = (url.searchParams.get('action') || '').trim().toLowerCase();
    const limit = Number(url.searchParams.get('limit') || state.auditLogs.length);
    const filtered = state.auditLogs.filter((entry) => {
      const resourceMatch = !resourceType || entry.resourceType.toLowerCase().includes(resourceType);
      const actionMatch = !action || entry.action.toLowerCase().includes(action);
      return resourceMatch && actionMatch;
    });
    return clone(filtered.slice(0, limit)) as T;
  }

  if (method === 'GET' && pathname === '/reports/export/records.csv') {
    return exportRecordsCsv(state) as T;
  }

  if (method === 'GET' && pathname === '/reports/export/inventory-movements.csv') {
    return exportInventoryCsv(state) as T;
  }

  throw new DemoApiError(`Demo endpoint not implemented: ${method} ${pathname}`, 404);
}

export async function demoDownloadFromApi(path: string, filename: string) {
  const content = await demoApiRequest<string>(path, { method: 'GET' });
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
