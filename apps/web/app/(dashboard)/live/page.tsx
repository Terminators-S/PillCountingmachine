'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Cpu,
  Eye,
  FileSpreadsheet,
  FileText,
  Gauge,
  Layers3,
  Play,
  RefreshCcw,
  Square
} from 'lucide-react';
import { CompactEmptyState, SectionHeader } from '../../../components/dashboard-section';
import { PageHeader } from '../../../components/page-header';
import { WorkspaceTabs } from '../../../components/workspace-tabs';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { StatCard } from '../../../components/stat-card';
import { apiBlob, apiRequest, downloadFromApi } from '../../../lib/api';
import { formatDateTime, formatNumber } from '../../../lib/format';
import {
  AppBrandingSettings,
  EventListResponse,
  MachineRuntimeCameraSource,
  MachineRuntimeModelCatalog,
  MachineRuntimeState,
  MachineRuntimeStateSummary
} from '../../../types/api';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger';
type CatalogEntry = MachineRuntimeModelCatalog['models'][number];
type BrowserPreviewState = 'idle' | 'requesting' | 'granted' | 'unsupported' | 'error';

const CAMERA_ALIAS_STORAGE_KEY = 'pillcount.cameraAliases';
const DEFAULT_VISION_TUNING = {
  confidenceThreshold: '0.20',
  iouThreshold: '0.45',
  brightness: '10',
  contrast: '1.10',
  gamma: '1.10',
  sharpness: '0.25',
  exposure: '',
  gain: ''
};

const VISION_PRESETS = [
  {
    key: 'balanced',
    name: 'Balanced',
    description: 'Default for normal room light and stable counting.',
    values: DEFAULT_VISION_TUNING
  },
  {
    key: 'blister',
    name: 'Blister Pack',
    description: 'Lifts darker blister packs and lowers the detection threshold slightly.',
    values: {
      confidenceThreshold: '0.16',
      iouThreshold: '0.45',
      brightness: '14',
      contrast: '1.16',
      gamma: '1.18',
      sharpness: '0.32',
      exposure: '',
      gain: ''
    }
  },
  {
    key: 'low-light',
    name: 'Low Light',
    description: 'Useful when the tray or desk is too dark.',
    values: {
      confidenceThreshold: '0.18',
      iouThreshold: '0.45',
      brightness: '18',
      contrast: '1.12',
      gamma: '1.22',
      sharpness: '0.22',
      exposure: '-6',
      gain: '8'
    }
  }
] as const;

function getStateVariant(state?: string | null): BadgeVariant {
  if (state === 'RUNNING' || state === 'OPEN') return 'success';
  if (state === 'ERROR') return 'danger';
  if (state === 'STARTING' || state === 'STOPPING' || state === 'OPENING') return 'warning';
  return 'default';
}

function toOptionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function toOptionalFloat(value: string) {
  if (!value.trim()) return undefined;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function getModelMode(entry?: CatalogEntry | null): { label: string; detail: string; variant: BadgeVariant; rank: number } {
  if (!entry) {
    return { label: 'No model selected', detail: 'Pick a model stack before starting the machine.', variant: 'default', rank: 9 };
  }

  if (entry.provider === 'local') {
    return { label: 'Free local', detail: 'Runs only on this PC. No API key needed.', variant: 'success', rank: 1 };
  }

  if (entry.provider === 'roboflow') {
    if (entry.deploymentTarget === 'ondevice') {
      return {
        label: 'Roboflow edge',
        detail: 'Runs through a local Roboflow Inference Server. Best fit for Raspberry Pi 5.',
        variant: 'success',
        rank: 2
      };
    }

    return { label: 'Roboflow cloud', detail: 'Needs internet and a Roboflow API key.', variant: 'warning', rank: 4 };
  }

  const components = entry.components || [];
  const hasLocal = components.some((component) => component.startsWith('local-'));
  const hasHosted = components.some((component) => component.startsWith('rf-'));

  if (hasLocal && hasHosted) {
    return {
      label: 'Hybrid ensemble',
      detail: 'Runs locally now and adds hosted detectors when a Roboflow key exists.',
      variant: 'warning',
      rank: 2
    };
  }

  if (hasLocal) {
    return { label: 'Free local ensemble', detail: 'Combines multiple local models with no API cost.', variant: 'success', rank: 0 };
  }

  return { label: 'Hosted ensemble', detail: 'Needs internet and a Roboflow API key.', variant: 'warning', rank: 5 };
}

function formatMetric(entry: CatalogEntry, metricKey: string) {
  const value = entry.metrics?.[metricKey];
  return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'n/a';
}

function suggestedCameraAlias(index: number) {
  if (index === 0) return 'Front Camera';
  if (index === 1) return 'USB Camera';
  if (index === 2) return 'Tray Camera';
  if (index === 3) return 'Backup Camera';
  return `Camera ${index}`;
}

function formatCameraSource(camera: MachineRuntimeCameraSource, alias?: string) {
  const trimmedAlias = alias?.trim();
  const label = trimmedAlias || camera.name;
  const detailParts = [];
  if (trimmedAlias && trimmedAlias !== camera.name) {
    detailParts.push(camera.name);
  }
  if (camera.width && camera.height) {
    detailParts.push(`${camera.width} x ${camera.height}`);
  }

  return detailParts.length ? `${label} (${detailParts.join(' • ')})` : label;
}

function detectionGuidance(state?: MachineRuntimeStateSummary | null, previewMode?: 'machine' | 'browser') {
  if (!state) {
    return {
      title: 'Machine not started yet',
      description: 'Choose a model, set the machine camera, and enable the runtime.',
      tone: 'default' as const
    };
  }

  if (state.latestError) {
    return {
      title: 'Runtime needs attention',
      description: state.latestError,
      tone: 'danger' as const
    };
  }

  if (state.controlState !== 'RUNNING' || state.cameraState !== 'OPEN') {
    return {
      title: 'Machine runtime is not active',
      description: 'Start the machine to open the camera and run live detection.',
      tone: 'warning' as const
    };
  }

  if ((state.visibleCounts.total || 0) > 0 || (state.cumulativeCounts.total || 0) > 0) {
    return {
      title: 'ML detection is active',
      description: `The current session has tracked ${formatNumber(state.cumulativeCounts.total || 0)} item(s).`,
      tone: 'success' as const
    };
  }

  if (previewMode === 'browser') {
    return {
      title: 'Browser preview is not the ML input',
      description: 'Switch back to Machine Snapshot to verify what the model actually reads.',
      tone: 'warning' as const
    };
  }

  return {
    title: 'Model is running, but nothing is detected yet',
    description: 'Try the Blister Pack preset, move pills closer, and restart after tuning changes.',
    tone: 'warning' as const
  };
}

function ModelStackCard({
  entry,
  selected,
  onSelect
}: {
  entry: CatalogEntry;
  selected: boolean;
  onSelect: (key: string) => void;
}) {
  const mode = getModelMode(entry);

  return (
    <button
      type='button'
      onClick={() => onSelect(entry.key)}
      className={`rounded-xl border p-3 text-left transition-all ${
        selected
          ? 'border-emerald-300 bg-[linear-gradient(180deg,rgba(236,253,245,0.94),rgba(239,246,255,0.9))] shadow-[0_14px_30px_rgba(15,23,42,0.08)] ring-2 ring-emerald-100 dark:border-emerald-500/30 dark:bg-[linear-gradient(180deg,rgba(6,78,59,0.18),rgba(15,23,42,0.6))]'
          : 'border-border/80 bg-white/86 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)] dark:bg-slate-950/40'
      }`}
    >
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant={selected ? 'success' : 'default'}>{selected ? 'Selected' : 'Available'}</Badge>
        <Badge variant={mode.variant}>{mode.label}</Badge>
        {entry.isCustom ? <Badge variant='warning'>Custom import</Badge> : null}
        {entry.recommendedForCounting ? <Badge variant='success'>Recommended</Badge> : null}
      </div>

      <div className='mt-3 flex flex-wrap items-start justify-between gap-3'>
        <div className='space-y-1'>
          <h3 className='text-sm font-semibold text-slate-900 dark:text-slate-50'>{entry.name}</h3>
          <p className='text-xs leading-5 text-slate-600 dark:text-slate-300'>{mode.detail}</p>
        </div>
        <span className='rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100'>
          {entry.provider === 'roboflow' && entry.deploymentTarget === 'ondevice' ? 'roboflow edge' : entry.provider}
        </span>
      </div>

      {entry.notes ? <p className='mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300'>{entry.notes}</p> : null}

      <div className='mt-3 grid gap-2 sm:grid-cols-3'>
        <div className='rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-slate-900/60'>
          <p className='text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'>Precision</p>
          <p className='mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50'>{formatMetric(entry, 'precision')}</p>
        </div>
        <div className='rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-slate-900/60'>
          <p className='text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'>Recall</p>
          <p className='mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50'>{formatMetric(entry, 'recall')}</p>
        </div>
        <div className='rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-slate-900/60'>
          <p className='text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'>mAP50</p>
          <p className='mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50'>{formatMetric(entry, 'map50')}</p>
        </div>
      </div>

      {entry.components?.length ? (
        <div className='mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2.5 dark:border-white/10 dark:bg-slate-900/45'>
          <p className='text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'>Stack</p>
          <p className='mt-1 text-xs leading-5 text-slate-700 dark:text-slate-200'>{entry.components.join(', ')}</p>
        </div>
      ) : null}
    </button>
  );
}

function RuntimeFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className='surface-subtle rounded-2xl p-3'>
      <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>{label}</p>
      <div className='mt-1.5 text-sm font-medium text-foreground'>{value}</div>
    </div>
  );
}

function ControlField({
  label,
  children,
  className
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className='field-label'>{label}</label>
      {children}
    </div>
  );
}

export default function LiveDashboardPage() {
  const queryClient = useQueryClient();
  const browserVideoRef = useRef<HTMLVideoElement | null>(null);
  const browserStreamRef = useRef<MediaStream | null>(null);
  const snapshotUrlRef = useRef('');

  const [selectedMachineCode, setSelectedMachineCode] = useState('');
  const [cameraAliases, setCameraAliases] = useState<Record<string, string>>({});
  const [cameraAliasesReady, setCameraAliasesReady] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'monitor' | 'setup' | 'counts' | 'diagnostics'>('monitor');
  const [previewMode, setPreviewMode] = useState<'machine' | 'browser'>('machine');
  const [browserPreviewState, setBrowserPreviewState] = useState<BrowserPreviewState>('idle');
  const [browserPreviewError, setBrowserPreviewError] = useState('');
  const [browserCameras, setBrowserCameras] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [browserCameraId, setBrowserCameraId] = useState('');
  const [snapshotUrl, setSnapshotUrl] = useState('');
  const [form, setForm] = useState({
    machineCode: 'MCH-ML-01',
    displayName: 'Vision Counter',
    location: 'Production Line A',
    firmwareVersion: 'ml-vision-1.0.0',
    cameraIndex: '',
    modelKey: '',
    ...DEFAULT_VISION_TUNING
  });

  const modelCatalog = useQuery({
    queryKey: ['machine-runtime', 'catalog'],
    queryFn: () => apiRequest<MachineRuntimeModelCatalog>('/machine-runtime/catalog/models'),
    staleTime: 60_000
  });
  const branding = useQuery({
    queryKey: ['app-settings', 'public', 'live-dashboard'],
    queryFn: () => apiRequest<AppBrandingSettings>('/app-settings/public'),
    staleTime: 60_000
  });
  const cameraCatalog = useQuery({
    queryKey: ['machine-runtime', 'cameras'],
    queryFn: () => apiRequest<MachineRuntimeCameraSource[]>('/machine-runtime/catalog/cameras'),
    staleTime: 60_000
  });
  const runtimeList = useQuery({
    queryKey: ['machine-runtime', 'list'],
    queryFn: () => apiRequest<MachineRuntimeStateSummary[]>('/machine-runtime'),
    refetchInterval: (query) => {
      const rows = query.state.data || [];
      return rows.some((entry) => entry.controlState === 'RUNNING') ? 1000 : 2000;
    }
  });

  const selectedSummary = useMemo(
    () => runtimeList.data?.find((entry) => entry.machineCode === selectedMachineCode) || null,
    [runtimeList.data, selectedMachineCode]
  );

  useEffect(() => {
    if (selectedMachineCode || !runtimeList.data?.length) return;
    const preferred = runtimeList.data.find((entry) => entry.controlState === 'RUNNING') || runtimeList.data[0];
    setSelectedMachineCode(preferred.machineCode);
    setForm((prev) => ({
      ...prev,
      machineCode: preferred.machineCode,
      displayName: preferred.displayName || prev.displayName,
      location: preferred.location || prev.location,
      firmwareVersion: preferred.firmwareVersion || prev.firmwareVersion,
      cameraIndex: preferred.cameraIndex !== undefined && preferred.cameraIndex !== null ? String(preferred.cameraIndex) : prev.cameraIndex,
      modelKey: preferred.modelKey || prev.modelKey || modelCatalog.data?.defaultModelKey || ''
    }));
  }, [modelCatalog.data?.defaultModelKey, runtimeList.data, selectedMachineCode]);

  useEffect(() => {
    if (!form.modelKey && modelCatalog.data?.defaultModelKey) {
      setForm((prev) => ({ ...prev, modelKey: prev.modelKey || modelCatalog.data.defaultModelKey }));
    }
  }, [form.modelKey, modelCatalog.data?.defaultModelKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(CAMERA_ALIAS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const nextAliases: Record<string, string> = {};
          for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof value === 'string' && value.trim()) {
              nextAliases[key] = value.trim().slice(0, 40);
            }
          }
          setCameraAliases(nextAliases);
        }
      }
    } catch {
      window.localStorage.removeItem(CAMERA_ALIAS_STORAGE_KEY);
    } finally {
      setCameraAliasesReady(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !cameraAliasesReady) return;

    try {
      window.localStorage.setItem(CAMERA_ALIAS_STORAGE_KEY, JSON.stringify(cameraAliases));
    } catch {
      // Keep the page usable when localStorage is unavailable.
    }
  }, [cameraAliases, cameraAliasesReady]);

  const diagnostics = useQuery({
    queryKey: ['machine-runtime', 'detail', selectedMachineCode],
    queryFn: () => apiRequest<MachineRuntimeState>(`/machine-runtime/${encodeURIComponent(selectedMachineCode)}`),
    enabled: Boolean(selectedMachineCode) && showDiagnostics,
    refetchInterval: 5000
  });
  const events = useQuery({
    queryKey: ['machine-runtime', 'events', selectedMachineCode],
    queryFn: () => apiRequest<EventListResponse>(`/machine-events?machineId=${encodeURIComponent(selectedMachineCode)}&page=1&pageSize=8`),
    enabled: Boolean(selectedMachineCode) && showDiagnostics,
    refetchInterval: 6000
  });

  const selectedState = selectedSummary;
  const selectedCatalogModel = modelCatalog.data?.models.find((entry) => entry.key === (selectedState?.modelKey || form.modelKey));
  const selectedModelMode = getModelMode(selectedCatalogModel);
  const runtimeGuidance = detectionGuidance(selectedState, previewMode);
  const visibleByLabel = Object.entries(selectedState?.visibleCounts.byLabel || {});
  const cumulativeByLabel = Object.entries(selectedState?.cumulativeCounts.byLabel || {});
  const canStop = Boolean(selectedState && ['STARTING', 'RUNNING', 'STOPPING', 'ERROR'].includes(selectedState.controlState));
  const availableCameras = useMemo(
    () => [...(cameraCatalog.data || [])].sort((left, right) => left.index - right.index),
    [cameraCatalog.data]
  );
  const selectedCamera = useMemo(
    () => availableCameras.find((camera) => camera.index === selectedState?.cameraIndex) || null,
    [availableCameras, selectedState?.cameraIndex]
  );
  const selectedSnapshotRevision = selectedState?.snapshotUpdatedAt || '';

  useEffect(() => {
    void loadBrowserCameras();

    return () => {
      if (browserStreamRef.current) {
        browserStreamRef.current.getTracks().forEach((track) => track.stop());
        browserStreamRef.current = null;
      }
      if (snapshotUrlRef.current) {
        URL.revokeObjectURL(snapshotUrlRef.current);
        snapshotUrlRef.current = '';
      }
    };
  }, []);

  useEffect(() => {
    snapshotUrlRef.current = snapshotUrl;
  }, [snapshotUrl]);

  useEffect(() => {
    if (!selectedMachineCode || !selectedSnapshotRevision || previewMode !== 'machine') return;

    let revoked = false;
    let nextUrl = '';

    void apiBlob(`/machine-runtime/${encodeURIComponent(selectedMachineCode)}/snapshot.jpg?ts=${encodeURIComponent(selectedSnapshotRevision)}`)
      .then((blob) => {
        if (!blob.size) {
          setSnapshotUrl((previous) => {
            if (previous) URL.revokeObjectURL(previous);
            snapshotUrlRef.current = '';
            return '';
          });
          return;
        }

        nextUrl = URL.createObjectURL(blob);
        if (revoked) {
          URL.revokeObjectURL(nextUrl);
          return;
        }

        setSnapshotUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          snapshotUrlRef.current = nextUrl;
          return nextUrl;
        });
      })
      .catch(() => {
        if (revoked) return;
        setSnapshotUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          snapshotUrlRef.current = '';
          return '';
        });
      });

    return () => {
      revoked = true;
      if (nextUrl && snapshotUrlRef.current !== nextUrl) {
        URL.revokeObjectURL(nextUrl);
      }
    };
  }, [previewMode, selectedMachineCode, selectedSnapshotRevision]);

  async function loadBrowserCameras() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      setBrowserPreviewState('unsupported');
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const nextCameras = devices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Browser Camera ${index + 1}`
      }));

    setBrowserCameras(nextCameras);
    if (nextCameras.length && !nextCameras.some((device) => device.deviceId === browserCameraId)) {
      setBrowserCameraId(nextCameras[0].deviceId);
    }
  }

  async function startBrowserPreview(nextCameraId?: string) {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setBrowserPreviewState('unsupported');
      setBrowserPreviewError('This browser does not support direct camera access.');
      return;
    }

    setBrowserPreviewState('requesting');
    setBrowserPreviewError('');

    if (browserStreamRef.current) {
      browserStreamRef.current.getTracks().forEach((track) => track.stop());
      browserStreamRef.current = null;
    }

    try {
      const selectedDeviceId = nextCameraId || browserCameraId;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
        audio: false
      });

      browserStreamRef.current = stream;
      if (browserVideoRef.current) {
        browserVideoRef.current.srcObject = stream;
        void browserVideoRef.current.play().catch(() => undefined);
      }

      setPreviewMode('browser');
      setBrowserPreviewState('granted');
      await loadBrowserCameras();
    } catch (error) {
      setBrowserPreviewState('error');
      setBrowserPreviewError(error instanceof Error ? error.message : 'Camera permission failed.');
      setPreviewMode('machine');
    }
  }

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) {
      return;
    }

    const onDeviceChange = () => {
      void loadBrowserCameras();
    };

    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
  }, [browserCameraId]);

  useEffect(() => {
    if (previewMode !== 'browser' && browserStreamRef.current) {
      browserStreamRef.current.getTracks().forEach((track) => track.stop());
      browserStreamRef.current = null;
    }
  }, [previewMode]);

  useEffect(() => {
    if (previewMode !== 'browser' || browserPreviewState !== 'granted') {
      return;
    }

    void startBrowserPreview(browserCameraId);
  }, [browserCameraId, browserPreviewState, previewMode]);

  const orderedModels = useMemo(() => {
    const defaultKey = modelCatalog.data?.defaultModelKey;
    return [...(modelCatalog.data?.models || [])].sort((left, right) => {
      const leftScore =
        (left.key === defaultKey ? -100 : 0) + (left.isCustom ? -25 : 0) + (left.recommendedForCounting ? -20 : 0) + getModelMode(left).rank * 10;
      const rightScore =
        (right.key === defaultKey ? -100 : 0) + (right.isCustom ? -25 : 0) + (right.recommendedForCounting ? -20 : 0) + getModelMode(right).rank * 10;
      if (leftScore !== rightScore) return leftScore - rightScore;
      return left.name.localeCompare(right.name);
    });
  }, [modelCatalog.data?.defaultModelKey, modelCatalog.data?.models]);

  const runtimeEntries = runtimeList.data || [];
  const selectedMachineName = selectedState?.displayName || form.displayName || 'Vision Counter';
  const selectedCameraLabel = selectedCamera
    ? formatCameraSource(selectedCamera, cameraAliases[String(selectedCamera.index)])
    : selectedState?.cameraIndex !== undefined && selectedState?.cameraIndex !== null
      ? `Camera ${selectedState.cameraIndex}`
      : form.cameraIndex
        ? `Camera ${form.cameraIndex}`
        : 'Auto';
  const canStart = Boolean(form.machineCode.trim() && form.modelKey);

  const refreshRuntime = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['machine-runtime', 'list'] }),
      queryClient.invalidateQueries({ queryKey: ['machine-runtime', 'detail', selectedMachineCode] }),
      queryClient.invalidateQueries({ queryKey: ['machine-runtime', 'events', selectedMachineCode] })
    ]);
  };

  const applyRuntimeSelection = (entry: MachineRuntimeStateSummary) => {
    setSelectedMachineCode(entry.machineCode);
    setForm((prev) => ({
      ...prev,
      machineCode: entry.machineCode,
      displayName: entry.displayName || prev.displayName,
      location: entry.location || prev.location,
      firmwareVersion: entry.firmwareVersion || prev.firmwareVersion,
      cameraIndex: entry.cameraIndex !== undefined && entry.cameraIndex !== null ? String(entry.cameraIndex) : prev.cameraIndex,
      modelKey: entry.modelKey || prev.modelKey
    }));
  };

  const applyVisionPreset = (presetValues: typeof DEFAULT_VISION_TUNING) => {
    setForm((prev) => ({
      ...prev,
      ...presetValues
    }));
  };

  const startSession = useMutation({
    mutationFn: async () => {
      const machineCode = form.machineCode.trim();
      return apiRequest<MachineRuntimeState>(`/machine-runtime/${encodeURIComponent(machineCode)}/start`, {
        method: 'POST',
        body: JSON.stringify({
          executionMode: 'remote',
          displayName: form.displayName || undefined,
          location: form.location || undefined,
          firmwareVersion: form.firmwareVersion || undefined,
          cameraIndex: toOptionalNumber(form.cameraIndex),
          modelKey: form.modelKey || undefined,
          confidenceThreshold: toOptionalFloat(form.confidenceThreshold),
          iouThreshold: toOptionalFloat(form.iouThreshold),
          brightness: toOptionalFloat(form.brightness),
          contrast: toOptionalFloat(form.contrast),
          gamma: toOptionalFloat(form.gamma),
          sharpness: toOptionalFloat(form.sharpness),
          exposure: toOptionalFloat(form.exposure),
          gain: toOptionalFloat(form.gain),
          telemetryIntervalMs: 750,
          snapshotIntervalMs: 1500
        })
      });
    },
    onSuccess: async (payload) => {
      setPreviewMode('machine');
      setSelectedMachineCode(payload.machineCode);
      await refreshRuntime();
    }
  });

  const stopSession = useMutation({
    mutationFn: async (machineCode: string) =>
      apiRequest<MachineRuntimeState>(`/machine-runtime/${encodeURIComponent(machineCode)}/stop`, {
        method: 'POST',
        body: JSON.stringify({ executionMode: 'remote' })
      }),
    onSuccess: async () => {
      await refreshRuntime();
    }
  });

  const exportExcel = useMutation({
    mutationFn: async (machineCode: string) =>
      downloadFromApi(`/machine-runtime/${encodeURIComponent(machineCode)}/export/summary.xlsx`, `${machineCode}-summary.xlsx`)
  });
  const exportWord = useMutation({
    mutationFn: async (machineCode: string) =>
      downloadFromApi(`/machine-runtime/${encodeURIComponent(machineCode)}/export/summary.docx`, `${machineCode}-summary.docx`)
  });

  const headlineMessage =
    selectedState?.latestError ||
    selectedState?.latestMessage ||
    'Choose a model stack, place pills in view, and start the machine.';
  const exportErrorMessage =
    exportExcel.error instanceof Error
      ? exportExcel.error.message
      : exportWord.error instanceof Error
        ? exportWord.error.message
        : '';
  const controlErrorMessage =
    startSession.error instanceof Error
      ? startSession.error.message
      : stopSession.error instanceof Error
        ? stopSession.error.message
        : '';

  return (
    <div className='space-y-4'>
      <PageHeader
        title='Live Dashboard'
        description={branding.data?.liveTagline || 'Keep the machine, preview, and count status in view with minimal scrolling.'}
        eyebrow={branding.data?.headerEyebrow || 'Primary operator workspace'}
      />

      <section className='control-strip p-3.5'>
        <div className='grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]'>
          <div className={`grid gap-3 ${runtimeEntries.length ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'}`}>
            <ControlField label='Machine code'>
              <Input
                value={form.machineCode}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setSelectedMachineCode(nextValue);
                  setForm((prev) => ({ ...prev, machineCode: nextValue }));
                }}
                placeholder='MCH-ML-01'
              />
            </ControlField>

            {runtimeEntries.length ? (
              <ControlField label='Switch active session'>
                <select
                  className='select-field'
                  value={selectedMachineCode}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    const match = runtimeEntries.find((entry) => entry.machineCode === nextValue);
                    if (match) {
                      applyRuntimeSelection(match);
                    } else {
                      setSelectedMachineCode('');
                    }
                  }}
                >
                  <option value=''>No live session selected</option>
                  {runtimeEntries.map((entry) => (
                    <option key={entry.machineCode} value={entry.machineCode}>
                      {entry.machineCode} - {entry.displayName || entry.location}
                    </option>
                  ))}
                </select>
              </ControlField>
            ) : null}

            <ControlField label='Model stack'>
              <select
                className='select-field'
                value={form.modelKey}
                onChange={(event) => setForm((prev) => ({ ...prev, modelKey: event.target.value }))}
              >
                <option value=''>Select model stack</option>
                {orderedModels.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </ControlField>

            <ControlField label='Preview source'>
              <div className='grid grid-cols-2 gap-2'>
                <Button size='sm' variant={previewMode === 'machine' ? 'default' : 'secondary'} onClick={() => setPreviewMode('machine')}>
                  Machine
                </Button>
                <Button
                  size='sm'
                  variant={previewMode === 'browser' ? 'default' : 'secondary'}
                  onClick={() => void startBrowserPreview()}
                  disabled={browserPreviewState === 'requesting'}
                >
                  {browserPreviewState === 'requesting' ? 'Opening...' : 'Browser'}
                </Button>
              </div>
            </ControlField>
          </div>

          <div className='flex flex-wrap items-end gap-2 xl:justify-end'>
            <Button variant='secondary' size='sm' onClick={() => refreshRuntime()}>
              <RefreshCcw className='mr-2 h-4 w-4' />
              Refresh
            </Button>
            <Button
              variant='secondary'
              size='sm'
              disabled={!selectedState?.machineCode || exportExcel.isPending}
              onClick={() => selectedState?.machineCode && exportExcel.mutate(selectedState.machineCode)}
            >
              <FileSpreadsheet className='mr-2 h-4 w-4' />
              {exportExcel.isPending ? 'Excel...' : 'Excel'}
            </Button>
            <Button
              variant='secondary'
              size='sm'
              disabled={!selectedState?.machineCode || exportWord.isPending}
              onClick={() => selectedState?.machineCode && exportWord.mutate(selectedState.machineCode)}
            >
              <FileText className='mr-2 h-4 w-4' />
              {exportWord.isPending ? 'Word...' : 'Word'}
            </Button>
            <Button
              variant='destructive'
              size='sm'
              disabled={!selectedState?.machineCode || !canStop || stopSession.isPending}
              onClick={() => selectedState?.machineCode && stopSession.mutate(selectedState.machineCode)}
            >
              <Square className='mr-2 h-4 w-4' />
              {stopSession.isPending ? 'Stopping...' : 'Stop'}
            </Button>
            <Button size='sm' disabled={!canStart || startSession.isPending} onClick={() => startSession.mutate()}>
              <Play className='mr-2 h-4 w-4' />
              {startSession.isPending ? 'Starting...' : 'Start'}
            </Button>
          </div>
        </div>

        <div className='mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant={getStateVariant(selectedState?.controlState)}>{selectedState?.controlState || 'IDLE'}</Badge>
            <Badge variant={getStateVariant(selectedState?.cameraState)}>{selectedState?.cameraState || 'CLOSED'}</Badge>
            <Badge variant={selectedModelMode.variant}>{selectedModelMode.label}</Badge>
            <Badge variant={previewMode === 'browser' ? 'warning' : 'default'}>
              {previewMode === 'browser' ? 'Browser preview' : 'Machine snapshot'}
            </Badge>
            <span className='rounded-full border border-border/70 bg-white/78 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-950/45 dark:text-slate-200'>
              {selectedMachineName}
            </span>
            <span className='rounded-full border border-border/70 bg-white/78 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-950/45 dark:text-slate-200'>
              {selectedCameraLabel}
            </span>
          </div>

          {runtimeEntries.length ? (
            <div className='flex flex-wrap gap-2'>
              {runtimeEntries.map((entry) => (
                <button
                  key={entry.machineCode}
                  type='button'
                  onClick={() => applyRuntimeSelection(entry)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    selectedMachineCode === entry.machineCode
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-border/70 bg-white/82 text-slate-700 hover:border-slate-300 dark:bg-slate-950/45 dark:text-slate-200'
                  }`}
                >
                  {entry.machineCode}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {controlErrorMessage ? (
          <div className='mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700'>
            {controlErrorMessage}
          </div>
        ) : null}
      </section>

      <WorkspaceTabs
        value={activeWorkspaceTab}
        onValueChange={(key) => setActiveWorkspaceTab(key as 'monitor' | 'setup' | 'counts' | 'diagnostics')}
        items={[
          { key: 'monitor', label: 'Monitor', icon: Eye, hint: 'Preview and status' },
          { key: 'setup', label: 'Setup', icon: Camera, hint: 'Machine and model' },
          { key: 'counts', label: 'Counts', icon: Gauge, hint: 'Live totals' },
          { key: 'diagnostics', label: 'Diagnostics', icon: AlertTriangle, hint: 'Logs and events' }
        ]}
      />

      {activeWorkspaceTab === 'monitor' ? (
        <section className='grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_340px]'>
          <Card className='overflow-hidden bg-[linear-gradient(155deg,rgba(248,250,252,0.94),rgba(236,253,245,0.82)_42%,rgba(224,242,254,0.82))] dark:bg-[linear-gradient(160deg,rgba(15,23,42,0.82),rgba(17,24,39,0.94))]'>
            <CardContent className='p-0'>
              <div className='relative aspect-[16/9] overflow-hidden'>
                {previewMode === 'browser' ? (
                  <video ref={browserVideoRef} className='absolute inset-0 h-full w-full object-cover' autoPlay muted playsInline />
                ) : snapshotUrl ? (
                  <img src={snapshotUrl} alt='Live machine preview' className='absolute inset-0 h-full w-full object-cover' />
                ) : (
                  <>
                    <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),rgba(241,245,249,0.95)_48%,rgba(226,232,240,0.88))]' />
                    <div className='absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(148,163,184,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:40px_40px]' />
                    <div className='absolute inset-0 flex items-center justify-center p-6'>
                      <CompactEmptyState
                        icon={Camera}
                        title='Preview ready when the machine starts'
                        message='Confirm machine, model, and camera in the control strip, then start the runtime.'
                        action={
                          <Button size='sm' disabled={!canStart || startSession.isPending} onClick={() => startSession.mutate()}>
                            <Play className='mr-2 h-4 w-4' />
                            {startSession.isPending ? 'Starting...' : 'Start machine'}
                          </Button>
                        }
                        className='w-full max-w-sm border-white/20 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-slate-950/55'
                      />
                    </div>
                  </>
                )}

                <div className='absolute inset-0 bg-gradient-to-t from-slate-950/88 via-slate-950/24 to-slate-950/10' />

                {previewMode === 'browser' ? (
                  <div className='absolute inset-x-0 top-16 z-[1] px-4'>
                    <div className='max-w-lg rounded-2xl border border-amber-200/80 bg-amber-50/92 px-4 py-3 text-sm text-amber-900 shadow-[0_14px_40px_rgba(15,23,42,0.14)] backdrop-blur'>
                      Browser preview is low-latency only. Counting still follows the machine camera feed.
                    </div>
                  </div>
                ) : null}

                <div className='absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-4'>
                  <div className='space-y-2'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Badge variant={getStateVariant(selectedState?.controlState)}>{selectedState?.controlState || 'IDLE'}</Badge>
                      <Badge variant={getStateVariant(selectedState?.cameraState)}>{selectedState?.cameraState || 'CLOSED'}</Badge>
                      <Badge variant={selectedModelMode.variant}>{selectedModelMode.label}</Badge>
                    </div>
                    <div>
                      <p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300'>{selectedState?.machineCode || form.machineCode}</p>
                      <h2 className='mt-1 text-xl font-semibold tracking-tight text-white'>{selectedMachineName}</h2>
                      <p className='text-sm text-slate-300'>{selectedState?.modelName || selectedCatalogModel?.name || 'Select a model stack'}</p>
                    </div>
                  </div>

                  <div className='min-w-[168px] rounded-2xl border border-white/20 bg-slate-950/45 px-4 py-3 text-white backdrop-blur-xl'>
                    <p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300'>Visible now</p>
                    <p className='mt-1 text-3xl font-semibold'>{formatNumber(selectedState?.visibleCounts.total || 0)}</p>
                    <p className='text-xs text-slate-300'>items in frame</p>
                  </div>
                </div>

                <div className='absolute inset-x-0 bottom-0 grid gap-px bg-white/10 md:grid-cols-4'>
                  {[
                    { label: 'Visible pills', value: formatNumber(selectedState?.visibleCounts.pill || 0) },
                    { label: 'Visible tablets', value: formatNumber(selectedState?.visibleCounts.tablet || 0) },
                    { label: 'Session total', value: formatNumber(selectedState?.cumulativeCounts.total || 0) },
                    { label: 'FPS', value: selectedState?.fps?.toFixed(1) || '0.0' }
                  ].map((metric) => (
                    <div key={metric.label} className='bg-slate-950/78 px-4 py-3 text-white backdrop-blur'>
                      <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400'>{metric.label}</p>
                      <p className='mt-1 text-xl font-semibold'>{metric.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className='grid gap-4'>
            <Card className='h-fit'>
              <CardHeader>
                <SectionHeader title='Runtime status' description='Critical machine and ML facts only.' />
              </CardHeader>
              <CardContent className='space-y-3'>
                <div
                  className={`rounded-2xl border px-4 py-3 ${
                    runtimeGuidance.tone === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                      : runtimeGuidance.tone === 'danger'
                        ? 'border-red-200 bg-red-50 text-red-900'
                        : runtimeGuidance.tone === 'warning'
                          ? 'border-amber-200 bg-amber-50 text-amber-950'
                          : 'border-border/70 bg-muted/20 text-foreground'
                  }`}
                >
                  <p className='text-sm font-semibold'>{runtimeGuidance.title}</p>
                  <p className='mt-1 text-sm opacity-90'>{runtimeGuidance.description}</p>
                </div>

                <div className='grid gap-2'>
                  <RuntimeFact label='Machine state' value={selectedState?.controlState || 'IDLE'} />
                  <RuntimeFact label='Active model' value={selectedState?.modelName || selectedCatalogModel?.name || 'Not started'} />
                  <RuntimeFact label='Camera source' value={selectedCameraLabel} />
                  <RuntimeFact label='Tracked objects' value={formatNumber(selectedState?.trackedObjectCount || 0)} />
                  <RuntimeFact
                    label='Average confidence'
                    value={selectedState?.averageConfidence ? `${(selectedState.averageConfidence * 100).toFixed(1)}%` : '0.0%'}
                  />
                  <RuntimeFact label='Heartbeat' value={formatDateTime(selectedState?.lastHeartbeatAt)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <SectionHeader title='Operator guide' description='Keep help available without giving it premium space.' />
              </CardHeader>
              <CardContent className='space-y-3'>
                <details className='surface-subtle rounded-2xl p-3'>
                  <summary className='flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50'>
                    <CircleHelp className='h-4 w-4 text-muted-foreground' />
                    Open quick guide
                  </summary>
                  <div className='mt-3 space-y-2 text-sm text-muted-foreground'>
                    <div className='flex items-start gap-2'>
                      <CheckCircle2 className='mt-0.5 h-4 w-4 text-emerald-600' />
                      <span>Select the machine and model stack first.</span>
                    </div>
                    <div className='flex items-start gap-2'>
                      <CheckCircle2 className='mt-0.5 h-4 w-4 text-emerald-600' />
                      <span>Use machine snapshot when you need to confirm the ML feed.</span>
                    </div>
                    <div className='flex items-start gap-2'>
                      <CheckCircle2 className='mt-0.5 h-4 w-4 text-emerald-600' />
                      <span>If counts stay at zero, try a different preset and restart the runtime.</span>
                    </div>
                  </div>
                </details>

                <div
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    selectedState?.latestError ? 'border-red-300 bg-red-50 text-red-700' : 'border-border/70 bg-muted/15 text-muted-foreground'
                  }`}
                >
                  {selectedState?.latestError ? <AlertTriangle className='mr-2 inline h-4 w-4' /> : null}
                  {headlineMessage}
                </div>

                <div className='grid gap-2 sm:grid-cols-2'>
                  <RuntimeFact label='Last telemetry' value={formatDateTime(selectedState?.lastTelemetryAt)} />
                  <RuntimeFact label='Snapshot updated' value={formatDateTime(selectedState?.snapshotUpdatedAt)} />
                </div>

                {browserCameras.length && previewMode === 'browser' ? (
                  <ControlField label='Browser camera'>
                    <select className='select-field' value={browserCameraId} onChange={(event) => setBrowserCameraId(event.target.value)}>
                      {browserCameras.map((camera) => (
                        <option key={camera.deviceId} value={camera.deviceId}>
                          {camera.label}
                        </option>
                      ))}
                    </select>
                  </ControlField>
                ) : null}

                {browserPreviewError ? (
                  <div className='rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700'>{browserPreviewError}</div>
                ) : null}
                {exportErrorMessage ? (
                  <div className='rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700'>{exportErrorMessage}</div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </section>
      ) : null}

      {activeWorkspaceTab === 'setup' ? (
        <section className='grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_380px]'>
          <Card>
            <CardHeader>
              <SectionHeader title='Model stack' description='Recommended and local-ready options stay near the top.' />
            </CardHeader>
            <CardContent className='grid gap-3 lg:grid-cols-2'>
              {orderedModels.map((entry) => (
                <ModelStackCard key={entry.key} entry={entry} selected={form.modelKey === entry.key} onSelect={(key) => setForm((prev) => ({ ...prev, modelKey: key }))} />
              ))}
            </CardContent>
          </Card>

          <div className='grid gap-4'>
            <Card className='h-fit'>
              <CardHeader>
                <SectionHeader title='Machine setup' description='Only the fields operators typically touch stay expanded.' />
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <ControlField label='Display name'>
                    <Input value={form.displayName} onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))} placeholder='Vision Counter' />
                  </ControlField>
                  <ControlField label='Location'>
                    <Input value={form.location} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} placeholder='Production Line A' />
                  </ControlField>
                  <ControlField label='Firmware'>
                    <Input value={form.firmwareVersion} onChange={(event) => setForm((prev) => ({ ...prev, firmwareVersion: event.target.value }))} placeholder='ml-vision-1.0.0' />
                  </ControlField>
                  <ControlField label='Machine camera'>
                    <select className='select-field' value={form.cameraIndex} onChange={(event) => setForm((prev) => ({ ...prev, cameraIndex: event.target.value }))}>
                      <option value=''>Auto / first available camera</option>
                      {availableCameras.map((camera) => (
                        <option key={camera.index} value={String(camera.index)}>
                          {formatCameraSource(camera, cameraAliases[String(camera.index)])}
                        </option>
                      ))}
                    </select>
                  </ControlField>
                </div>

                <details className='surface-subtle rounded-2xl p-3'>
                  <summary className='cursor-pointer list-none text-sm font-semibold text-slate-900 dark:text-slate-50'>
                    Advanced tuning
                  </summary>
                  <div className='mt-3 space-y-3'>
                    <div className='flex flex-wrap gap-2'>
                      {VISION_PRESETS.map((preset) => (
                        <Button key={preset.key} variant='secondary' size='sm' onClick={() => applyVisionPreset(preset.values)}>
                          {preset.name}
                        </Button>
                      ))}
                      <Button variant='ghost' size='sm' onClick={() => applyVisionPreset(DEFAULT_VISION_TUNING)}>
                        Reset
                      </Button>
                    </div>

                    <div className='rounded-xl border border-border/70 bg-background/75 px-3 py-2 text-xs text-muted-foreground'>
                      Changes apply to the ML feed after restarting the runtime. Start with the Blister Pack preset if pills are visible but counts stay at zero.
                    </div>

                    <div className='grid gap-3 sm:grid-cols-2'>
                      <ControlField label='Confidence threshold'>
                        <Input type='number' min='0.10' max='0.99' step='0.01' value={form.confidenceThreshold} onChange={(event) => setForm((prev) => ({ ...prev, confidenceThreshold: event.target.value }))} placeholder='0.20' />
                      </ControlField>
                      <ControlField label='IoU threshold'>
                        <Input type='number' min='0.10' max='0.99' step='0.01' value={form.iouThreshold} onChange={(event) => setForm((prev) => ({ ...prev, iouThreshold: event.target.value }))} placeholder='0.45' />
                      </ControlField>
                      <ControlField label='Brightness'>
                        <Input type='number' min='-80' max='80' step='1' value={form.brightness} onChange={(event) => setForm((prev) => ({ ...prev, brightness: event.target.value }))} placeholder='10' />
                      </ControlField>
                      <ControlField label='Contrast'>
                        <Input type='number' min='0.50' max='2.50' step='0.01' value={form.contrast} onChange={(event) => setForm((prev) => ({ ...prev, contrast: event.target.value }))} placeholder='1.10' />
                      </ControlField>
                      <ControlField label='Gamma'>
                        <Input type='number' min='0.30' max='2.50' step='0.01' value={form.gamma} onChange={(event) => setForm((prev) => ({ ...prev, gamma: event.target.value }))} placeholder='1.10' />
                      </ControlField>
                      <ControlField label='Sharpness'>
                        <Input type='number' min='0' max='2' step='0.01' value={form.sharpness} onChange={(event) => setForm((prev) => ({ ...prev, sharpness: event.target.value }))} placeholder='0.25' />
                      </ControlField>
                      <ControlField label='Hardware exposure'>
                        <Input type='number' min='-13' max='1' step='0.01' value={form.exposure} onChange={(event) => setForm((prev) => ({ ...prev, exposure: event.target.value }))} placeholder='Optional' />
                      </ControlField>
                      <ControlField label='Hardware gain'>
                        <Input type='number' min='0' max='64' step='0.01' value={form.gain} onChange={(event) => setForm((prev) => ({ ...prev, gain: event.target.value }))} placeholder='Optional' />
                      </ControlField>
                    </div>
                  </div>
                </details>

                <div className='grid gap-2 sm:grid-cols-2'>
                  <RuntimeFact label='Current model' value={selectedCatalogModel?.name || 'Not selected'} />
                  <RuntimeFact label='Current camera' value={selectedCameraLabel} />
                </div>
              </CardContent>
            </Card>

            {availableCameras.length ? (
              <Card>
                <CardHeader>
                  <SectionHeader
                    title='Camera labels'
                    description='Rename browser-detected sources without affecting the backend runtime.'
                    actions={
                      <Button variant='ghost' size='sm' onClick={() => setCameraAliases({})}>
                        Reset labels
                      </Button>
                    }
                  />
                </CardHeader>
                <CardContent className='grid gap-2'>
                  {availableCameras.map((camera) => (
                    <div key={`alias-${camera.index}`} className='surface-subtle grid gap-2 rounded-2xl p-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center'>
                      <div>
                        <p className='text-sm font-medium text-foreground'>{formatCameraSource(camera, cameraAliases[String(camera.index)])}</p>
                        <p className='mt-1 text-xs text-muted-foreground'>Index {camera.index}</p>
                      </div>
                      <Input
                        value={cameraAliases[String(camera.index)] || ''}
                        onChange={(event) =>
                          setCameraAliases((prev) => {
                            const nextValue = event.target.value.trimStart().slice(0, 40);
                            if (!nextValue) {
                              const nextAliases = { ...prev };
                              delete nextAliases[String(camera.index)];
                              return nextAliases;
                            }

                            return {
                              ...prev,
                              [String(camera.index)]: nextValue
                            };
                          })
                        }
                        placeholder={suggestedCameraAlias(camera.index)}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeWorkspaceTab === 'counts' ? (
        <>
          <section className='grid gap-3 md:grid-cols-2 xl:grid-cols-6'>
            <StatCard label='Visible Items' value={formatNumber(selectedState?.visibleCounts.total || 0)} hint='Current frame total' icon={<Eye className='h-4 w-4 text-muted-foreground' />} />
            <StatCard label='Session Total' value={formatNumber(selectedState?.cumulativeCounts.total || 0)} hint='Unique detections this session' icon={<Camera className='h-4 w-4 text-muted-foreground' />} />
            <StatCard label='Visible Pills' value={formatNumber(selectedState?.visibleCounts.pill || 0)} hint='Current frame' icon={<Activity className='h-4 w-4 text-muted-foreground' />} />
            <StatCard label='Visible Tablets' value={formatNumber(selectedState?.visibleCounts.tablet || 0)} hint='Current frame' icon={<Layers3 className='h-4 w-4 text-muted-foreground' />} />
            <StatCard label='FPS' value={selectedState?.fps?.toFixed(1) || '0.0'} hint='Vision loop speed' icon={<Gauge className='h-4 w-4 text-muted-foreground' />} />
            <StatCard label='Avg Confidence' value={selectedState?.averageConfidence?.toFixed(2) || '0.00'} hint='Detection confidence' icon={<Cpu className='h-4 w-4 text-muted-foreground' />} />
          </section>

          <section className='grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_320px]'>
            <Card>
              <CardHeader>
                <SectionHeader title='Count breakdown' description='Visible labels show the current frame. Session labels track cumulative detections.' />
              </CardHeader>
              <CardContent className='grid gap-4 lg:grid-cols-[1fr_0.95fr]'>
                <div className='grid gap-3'>
                  <div className='surface-subtle rounded-2xl p-4'>
                    <div className='flex items-center gap-2'>
                      <Clock3 className='h-4 w-4 text-muted-foreground' />
                      <h3 className='text-sm font-semibold'>Visible labels</h3>
                    </div>
                    {visibleByLabel.length ? (
                      <div className='mt-3 flex flex-wrap gap-2'>
                        {visibleByLabel.map(([label, value]) => (
                          <Badge key={`visible-${label}`} variant='default'>
                            {label}: {formatNumber(value)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <CompactEmptyState title='No active detections' message='Counts will appear here once pills enter the frame.' className='mt-3' />
                    )}
                  </div>

                  <div className='surface-subtle rounded-2xl p-4'>
                    <div className='flex items-center gap-2'>
                      <Activity className='h-4 w-4 text-muted-foreground' />
                      <h3 className='text-sm font-semibold'>Session labels</h3>
                    </div>
                    {cumulativeByLabel.length ? (
                      <div className='mt-3 flex flex-wrap gap-2'>
                        {cumulativeByLabel.map(([label, value]) => (
                          <Badge key={`session-${label}`} variant='success'>
                            {label}: {formatNumber(value)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <CompactEmptyState title='No session totals yet' message='Start the runtime to build a count history.' className='mt-3' />
                    )}
                  </div>
                </div>

                <div className='grid gap-2'>
                  <RuntimeFact label='Model key' value={selectedState?.modelKey || form.modelKey || 'Not selected'} />
                  <RuntimeFact label='Model provider' value={selectedState?.modelProvider || selectedCatalogModel?.provider || 'N/A'} />
                  <RuntimeFact label='Model stack' value={selectedCatalogModel?.components?.join(', ') || 'Single model'} />
                  <RuntimeFact label='Model path or id' value={selectedState?.modelPath || 'Not loaded'} />
                  <RuntimeFact label='Camera source' value={selectedCameraLabel} />
                  <RuntimeFact label='Frame size' value={`${selectedState?.frameWidth || 0} x ${selectedState?.frameHeight || 0}`} />
                  <RuntimeFact label='Tracked objects' value={formatNumber(selectedState?.trackedObjectCount || 0)} />
                  <RuntimeFact label='Frame number' value={formatNumber(selectedState?.frameNumber || 0)} />
                </div>
              </CardContent>
            </Card>

            <Card className='h-fit'>
              <CardHeader>
                <SectionHeader title='Runtime snapshot' description='Compact session facts for quick verification.' />
              </CardHeader>
              <CardContent className='space-y-2'>
                <RuntimeFact label='Latest message' value={headlineMessage} />
                <RuntimeFact label='Control state' value={selectedState?.controlState || 'IDLE'} />
                <RuntimeFact label='Camera state' value={selectedState?.cameraState || 'CLOSED'} />
                <RuntimeFact label='Visible total' value={formatNumber(selectedState?.visibleCounts.total || 0)} />
                <RuntimeFact label='Session total' value={formatNumber(selectedState?.cumulativeCounts.total || 0)} />
                {exportErrorMessage ? (
                  <div className='rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700'>{exportErrorMessage}</div>
                ) : null}
              </CardContent>
            </Card>
          </section>
        </>
      ) : null}

      {activeWorkspaceTab === 'diagnostics' ? (
        <section className='grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_320px]'>
          <Card>
            <CardHeader>
              <SectionHeader
                title='Diagnostics'
                description='Logs and machine events stay secondary so the main monitor remains clear.'
                actions={
                  <Button variant='secondary' size='sm' onClick={() => setShowDiagnostics((current) => !current)}>
                    {showDiagnostics ? 'Hide' : 'Load'}
                  </Button>
                }
              />
            </CardHeader>
            <CardContent className='space-y-4'>
              {showDiagnostics ? (
                <>
                  <div>
                    <p className='mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100'>Runtime logs</p>
                    {diagnostics.data?.logTail?.length ? (
                      <pre className='max-h-[360px] overflow-y-auto rounded-2xl bg-muted/35 p-3 text-xs leading-5'>
                        {diagnostics.data.logTail.join('\n')}
                      </pre>
                    ) : diagnostics.isLoading ? (
                      <p className='text-sm text-muted-foreground'>Loading runtime logs...</p>
                    ) : (
                      <CompactEmptyState title='No bridge logs yet' message='Open diagnostics again after the runtime produces output.' />
                    )}
                  </div>

                  <div>
                    <p className='mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100'>Latest machine events</p>
                    <div className='space-y-2'>
                      {events.data?.rows?.length ? (
                        events.data.rows.map((event) => (
                          <div key={event.id} className='surface-subtle rounded-2xl p-3'>
                            <div className='flex flex-wrap items-center justify-between gap-2'>
                              <div className='flex items-center gap-2'>
                                <span className='text-sm font-medium'>{event.eventType}</span>
                                <Badge variant={event.eventType.includes('error') ? 'danger' : 'default'}>{event.machine.machineCode}</Badge>
                              </div>
                              <span className='text-xs text-muted-foreground'>{formatDateTime(event.occurredAt)}</span>
                            </div>
                            <pre className='mt-2 max-h-24 overflow-y-auto rounded-xl bg-muted/35 p-2 text-[11px] leading-4'>
                              {JSON.stringify(event.payload || {}, null, 2)}
                            </pre>
                          </div>
                        ))
                      ) : events.isLoading ? (
                        <p className='text-sm text-muted-foreground'>Loading recent events...</p>
                      ) : (
                        <CompactEmptyState title='No runtime events yet' message='Events will appear here after machine activity is recorded.' />
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <CompactEmptyState title='Diagnostics paused' message='Load this panel only when you need logs or event payloads.' />
              )}
            </CardContent>
          </Card>

          <div className='grid gap-4'>
            <Card>
              <CardHeader>
                <SectionHeader title='Session health' description='Current state, message, and last error.' />
              </CardHeader>
              <CardContent className='space-y-2'>
                <RuntimeFact label='Latest message' value={headlineMessage} />
                <RuntimeFact label='Control state' value={selectedState?.controlState || 'IDLE'} />
                <RuntimeFact label='Camera state' value={selectedState?.cameraState || 'CLOSED'} />
                <RuntimeFact label='Latest error' value={selectedState?.latestError || 'No active runtime error'} />
                <RuntimeFact label='Snapshot updated' value={selectedState?.snapshotUpdatedAt ? formatDateTime(selectedState.snapshotUpdatedAt) : 'No snapshot yet'} />
              </CardContent>
            </Card>

            {exportErrorMessage ? (
              <div className='rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700'>{exportErrorMessage}</div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
