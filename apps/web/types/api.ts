export type RoleCode = 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'AUDITOR' | 'VIEWER' | 'API_ONLY';

export type MachineStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE' | 'UNKNOWN';

export type JobStatus = 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'NEEDS_RECOUNT' | 'CANCELLED';

export type MachineRuntimeControlState = 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'ERROR';

export type MachineCameraState = 'CLOSED' | 'OPENING' | 'OPEN' | 'ERROR';
export type RoboflowDeploymentTarget = 'hosted' | 'ondevice';
export type RuntimeDeviceProfile = 'desktop' | 'raspberry-pi-5';

export type InventoryTxnType =
  | 'RECEIVE'
  | 'DISPENSE'
  | 'ADJUST'
  | 'TRANSFER'
  | 'RESERVE'
  | 'RELEASE'
  | 'QUARANTINE'
  | 'WASTE'
  | 'CYCLE_COUNT';

export interface Machine {
  id: string;
  machineCode: string;
  displayName?: string | null;
  location: string;
  firmwareVersion: string;
  status: MachineStatus;
  displayStatus?: MachineStatus;
  lastSeen?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MachineRuntimeCounts {
  total: number;
  pill: number;
  tablet: number;
  medicine: number;
  other: number;
  byLabel: Record<string, number>;
}

export interface MachineRuntimeModelCatalogEntry {
  key: string;
  name: string;
  provider: 'local' | 'roboflow' | 'ensemble';
  deploymentTarget?: RoboflowDeploymentTarget;
  inferenceServerUrl?: string;
  recommendedForCounting?: boolean;
  isCustom?: boolean;
  path?: string;
  modelId?: string;
  components?: string[];
  classes?: string[];
  notes?: string;
  metrics?: Record<string, number>;
  sourceUrl?: string;
}

export interface AppBrandingSettings {
  productName: string;
  organizationName: string;
  logoUrl: string;
  supportLabel: string;
  welcomeMessage: string;
  accentNote: string;
  headerEyebrow: string;
  headerSummary: string;
  liveTagline: string;
  authHeadline: string;
  authSubheadline: string;
}

export interface AppRoboflowSettings {
  hasApiKey: boolean;
  apiKeyPreview: string | null;
  defaultModelKey: string | null;
  deploymentTarget: RoboflowDeploymentTarget;
  inferenceServerUrl: string;
  deviceProfile: RuntimeDeviceProfile;
  customModels: MachineRuntimeModelCatalogEntry[];
}

export interface MachineRuntimeModelCatalog {
  version: number;
  generatedAt: string;
  defaultModelKey: string;
  models: MachineRuntimeModelCatalogEntry[];
}

export interface MachineRuntimeCameraSource {
  index: number;
  name: string;
  width: number | null;
  height: number | null;
}

export interface MachineRuntimeStateSummary {
  machineCode: string;
  displayName?: string | null;
  location: string;
  firmwareVersion: string;
  sessionId?: string | null;
  controlState: MachineRuntimeControlState;
  cameraState: MachineCameraState;
  startedAt?: string | null;
  endedAt?: string | null;
  lastHeartbeatAt?: string | null;
  lastTelemetryAt?: string | null;
  snapshotUpdatedAt?: string | null;
  cameraIndex?: number | null;
  modelKey?: string | null;
  modelName?: string | null;
  modelProvider?: string | null;
  modelPath?: string | null;
  pid?: number | null;
  frameWidth?: number | null;
  frameHeight?: number | null;
  frameNumber: number;
  trackedObjectCount: number;
  fps?: number | null;
  averageConfidence?: number | null;
  visibleCounts: MachineRuntimeCounts;
  cumulativeCounts: MachineRuntimeCounts;
  latestMessage?: string | null;
  latestError?: string | null;
}

export interface MachineRuntimeState extends MachineRuntimeStateSummary {
  snapshotDataUrl?: string | null;
  logTail: string[];
}

export interface MachineEventRow {
  id: string;
  machineId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  occurredAt: string;
  receivedAt: string;
  idempotencyKey: string;
  sourceIp?: string | null;
  sourceUserAgent?: string | null;
  machine: Pick<Machine, 'id' | 'machineCode' | 'location' | 'firmwareVersion'>;
}

export interface EventListResponse {
  page: number;
  pageSize: number;
  total: number;
  rows: MachineEventRow[];
}

export interface MachineRunRow {
  id: string;
  runId: string;
  machineName: string;
  sourceMode: string;
  sourceLabel?: string | null;
  startedAt: string;
  completedAt: string;
  totalCount: number;
  eventCount: number;
  runtimeStatus: string;
  detectorBackend: string;
  mlRuntimeBackend?: string | null;
  modelFormat?: string | null;
  modelKey?: string | null;
  modelPath?: string | null;
  averageFps?: number | null;
  runtimeFps?: number | null;
  countResult?: Record<string, unknown> | null;
  camera?: Record<string, unknown> | null;
  detector?: Record<string, unknown> | null;
  roi?: Record<string, unknown> | null;
  line?: Record<string, unknown> | null;
  events?: Record<string, unknown>[] | null;
  evidence?: Record<string, unknown> | null;
  syncState?: Record<string, unknown> | null;
  receivedAt: string;
  updatedAt: string;
}

export interface MachineRunListResponse {
  page: number;
  pageSize: number;
  total: number;
  rows: MachineRunRow[];
}

export interface PillType {
  id: string;
  code: string;
  name: string;
  dosageMg?: number | null;
  manufacturer?: string | null;
  barcode?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lot {
  id: string;
  pillTypeId: string;
  lotNumber: string;
  expiryDate: string;
  receivedDate: string;
  unitCost: string;
  location: string;
  isQuarantined: boolean;
  createdAt: string;
  updatedAt: string;
  pillType?: Pick<PillType, 'id' | 'code' | 'name'>;
}

export interface InventoryBalance {
  id: string;
  pillTypeId: string;
  lotId: string;
  location: string;
  onHand: number;
  reserved: number;
  quarantined: number;
  updatedAt: string;
  pillType: Pick<PillType, 'id' | 'code' | 'name'>;
  lot: Lot;
}

export interface InventoryMovement {
  id: string;
  txnType: InventoryTxnType;
  quantity: number;
  location: string;
  fromLocation?: string | null;
  toLocation?: string | null;
  createdAt: string;
  idempotencyKey?: string | null;
  pillType: Pick<PillType, 'id' | 'code' | 'name'>;
  lot?: Pick<Lot, 'id' | 'lotNumber' | 'expiryDate'> | null;
  machine?: Pick<Machine, 'id' | 'machineCode'> | null;
  operator?: { id: string; email: string; fullName: string } | null;
}

export interface CountingJob {
  id: string;
  jobNumber: string;
  machineId: string;
  pillTypeId: string;
  targetQty: number;
  actualQty?: number | null;
  lotPreferenceId?: string | null;
  tolerancePct: string;
  status: JobStatus;
  createdById: string;
  operatorId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  machine: Machine;
  pillType: PillType;
  lotPreference?: Lot | null;
  operator?: { id: string; email: string; fullName: string } | null;
  createdBy?: { id: string; email: string; fullName: string };
}

export interface ReportsOverview {
  machinesTotal: number;
  machinesOnline: number;
  jobsTotal: number;
  jobsCompleted: number;
  pillsTotal: number;
  inventoryMovements: number;
}

export interface ThroughputRow {
  jobId: string;
  jobNumber: string;
  machineCode: string;
  pillTypeCode: string;
  pillName: string;
  targetQty: number;
  actualQty: number;
  completedAt: string;
}

export interface ValuationRow {
  location: string;
  totalValue: number;
  lines: number;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
}

export interface ApiKeyCreateResponse {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  plainKey: string;
  createdAt: string;
}

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  createdAt: string;
  roles: RoleCode[];
}

export interface RoleRow {
  id: string;
  code: RoleCode;
  name: string;
  permissions?: string[];
}

export interface AuditLogRow {
  id: string;
  actorType: 'USER' | 'API_KEY' | 'SYSTEM';
  actorUserId?: string | null;
  actorApiKeyId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actorUser?: { id: string; email: string; fullName: string } | null;
  actorApiKey?: { id: string; name: string; keyPrefix: string } | null;
}

export interface MeProfile {
  id: string;
  email: string;
  fullName: string;
  roles: RoleCode[];
}

export interface AdminModelField {
  name: string;
  type: string;
  kind: 'scalar' | 'enum';
  isId: boolean;
  isList: boolean;
  isRequired: boolean;
  isUnique: boolean;
  isUpdatedAt: boolean;
  hasDefaultValue: boolean;
}

export interface AdminModelMeta {
  name: string;
  primaryKeyFields: string[];
  fields: AdminModelField[];
}

export type AdminRow = Record<string, unknown>;

export interface AdminRowsResponse {
  model: string;
  primaryKeyFields: string[];
  rows: AdminRow[];
}
