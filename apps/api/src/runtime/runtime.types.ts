export type MachineRuntimeControlState = 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'ERROR';
export type MachineCameraState = 'CLOSED' | 'OPENING' | 'OPEN' | 'ERROR';
export type RoboflowDeploymentTarget = 'hosted' | 'ondevice';
export type RuntimeDeviceProfile = 'desktop' | 'raspberry-pi-5';

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

export interface MachineRuntimeState {
  machineCode: string;
  displayName: string | null;
  location: string;
  firmwareVersion: string;
  sessionId: string | null;
  controlState: MachineRuntimeControlState;
  cameraState: MachineCameraState;
  startedAt: string | null;
  endedAt: string | null;
  lastHeartbeatAt: string | null;
  lastTelemetryAt: string | null;
  snapshotUpdatedAt: string | null;
  cameraIndex: number | null;
  modelKey: string | null;
  modelName: string | null;
  modelProvider: string | null;
  modelPath: string | null;
  pid: number | null;
  frameWidth: number | null;
  frameHeight: number | null;
  frameNumber: number;
  trackedObjectCount: number;
  fps: number | null;
  averageConfidence: number | null;
  visibleCounts: MachineRuntimeCounts;
  cumulativeCounts: MachineRuntimeCounts;
  latestMessage: string | null;
  latestError: string | null;
  snapshotDataUrl: string | null;
  logTail: string[];
}

export type MachineRuntimeStateSummary = Omit<MachineRuntimeState, 'snapshotDataUrl' | 'logTail'>;

export interface BridgeMessage {
  type: string;
  payload?: Record<string, unknown>;
  emittedAt?: string;
}
