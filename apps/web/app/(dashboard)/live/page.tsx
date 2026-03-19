'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, Camera, Clock3, Cpu, Eye, FileSpreadsheet, FileText, Gauge, Layers3, Play, Square } from 'lucide-react';
import { PageHeader } from '../../../components/page-header';
import { WorkspaceTabs } from '../../../components/workspace-tabs';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { StatCard } from '../../../components/stat-card';
import { apiBlob, apiRequest, downloadFromApi } from '../../../lib/api';
import { formatDateTime, formatNumber } from '../../../lib/format';
import {
  MachineRuntimeCameraSource,
  AppBrandingSettings,
  EventListResponse,
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
      description: 'Choose a model, set the machine camera, and enable the machine to start the ML runtime.',
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
      description: `The model is running on the machine camera and has tracked ${formatNumber(state.cumulativeCounts.total || 0)} item(s) in this session.`,
      tone: 'success' as const
    };
  }

  if (previewMode === 'browser') {
    return {
      title: 'Browser preview is not the ML input',
      description: 'You are viewing the browser camera. Switch back to Machine Snapshot if you want to confirm what the model is actually seeing.',
      tone: 'warning' as const
    };
  }

  return {
    title: 'Model is running, but nothing is detected yet',
    description: 'Try the Blister Pack preset, place the medicine closer to the machine camera, and restart the machine after changing tuning values.',
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
      className={`rounded-2xl border p-4 text-left transition-all ${
        selected
          ? 'border-emerald-300 bg-[linear-gradient(180deg,rgba(236,253,245,0.92),rgba(239,246,255,0.88))] shadow-[0_18px_38px_rgba(15,23,42,0.08)] ring-2 ring-emerald-100 dark:border-emerald-500/30 dark:bg-[linear-gradient(180deg,rgba(6,78,59,0.18),rgba(15,23,42,0.6))]'
          : 'border-border/80 bg-white/82 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)] dark:bg-slate-950/40'
      }`}
    >
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant={selected ? 'success' : 'default'}>{selected ? 'Selected' : 'Available'}</Badge>
        <Badge variant={mode.variant}>{mode.label}</Badge>
        {entry.isCustom ? <Badge variant='warning'>Custom import</Badge> : null}
        {entry.recommendedForCounting ? <Badge variant='success'>Recommended</Badge> : null}
      </div>

      <div className='mt-4 flex flex-wrap items-start justify-between gap-3'>
        <div className='space-y-1'>
          <h3 className='text-base font-semibold text-slate-900 dark:text-slate-50'>{entry.name}</h3>
          <p className='text-sm text-slate-600 dark:text-slate-300'>{mode.detail}</p>
        </div>
        <span className='rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100'>
          {entry.provider === 'roboflow' && entry.deploymentTarget === 'ondevice' ? 'roboflow edge' : entry.provider}
        </span>
      </div>

      {entry.notes ? <p className='mt-3 text-sm text-slate-600 dark:text-slate-300'>{entry.notes}</p> : null}

      <div className='mt-4 grid gap-2 sm:grid-cols-3'>
        <div className='rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-900/60'>
          <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'>Precision</p>
          <p className='mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50'>{formatMetric(entry, 'precision')}</p>
        </div>
        <div className='rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-900/60'>
          <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'>Recall</p>
          <p className='mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50'>{formatMetric(entry, 'recall')}</p>
        </div>
        <div className='rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-900/60'>
          <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'>mAP50</p>
          <p className='mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50'>{formatMetric(entry, 'map50')}</p>
        </div>
      </div>

      {entry.components?.length ? (
        <div className='mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-slate-900/45'>
          <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'>Stack</p>
          <p className='mt-1 text-sm text-slate-700 dark:text-slate-200'>{entry.components.join(', ')}</p>
        </div>
      ) : null}
    </button>
  );
}

function RuntimeFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className='rounded-[22px] border border-border/70 bg-white/72 p-4 shadow-sm dark:bg-slate-950/45'>
      <p className='text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground'>{label}</p>
      <div className='mt-2 text-sm font-medium text-foreground'>{value}</div>
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
    if (typeof window === 'undefined') return;
    if (!cameraAliasesReady) return;

    try {
      window.localStorage.setItem(CAMERA_ALIAS_STORAGE_KEY, JSON.stringify(cameraAliases));
    } catch {
      // Ignore localStorage failures and keep the page usable.
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
    queryFn: () =>
      apiRequest<EventListResponse>(`/machine-events?machineId=${encodeURIComponent(selectedMachineCode)}&page=1&pageSize=8`),
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
    if (!selectedMachineCode || !selectedSnapshotRevision || previewMode !== 'machine') {
      return;
    }

    let revoked = false;
    let nextUrl = '';

    void apiBlob(`/machine-runtime/${encodeURIComponent(selectedMachineCode)}/snapshot.jpg?ts=${encodeURIComponent(selectedSnapshotRevision)}`)
      .then((blob) => {
        if (!blob.size) {
        setSnapshotUrl((previous) => {
          if (previous) {
            URL.revokeObjectURL(previous);
          }
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
          if (previous) {
            URL.revokeObjectURL(previous);
          }
          snapshotUrlRef.current = nextUrl;
          return nextUrl;
        });
      })
      .catch(() => {
        if (revoked) {
          return;
        }

        setSnapshotUrl((previous) => {
          if (previous) {
            URL.revokeObjectURL(previous);
          }
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
  }, [browserCameraId]);

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

  const refreshRuntime = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['machine-runtime', 'list'] }),
      queryClient.invalidateQueries({ queryKey: ['machine-runtime', 'detail', selectedMachineCode] }),
      queryClient.invalidateQueries({ queryKey: ['machine-runtime', 'events', selectedMachineCode] })
    ]);
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
      apiRequest<MachineRuntimeState>(`/machine-runtime/${encodeURIComponent(machineCode)}/stop`, { method: 'POST' }),
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

  return (
    <div className='space-y-8'>
      <PageHeader
        title='Live Counting Control Center'
        description={
          branding.data?.liveTagline || 'Choose a model stack, start the camera, and watch the count stream update in real time.'
        }
        eyebrow={branding.data?.headerEyebrow || 'Live machine control'}
        actions={
          <>
            <Button
              variant='secondary'
              disabled={!selectedState?.machineCode || exportExcel.isPending}
              onClick={() => selectedState?.machineCode && exportExcel.mutate(selectedState.machineCode)}
            >
              <FileSpreadsheet className='mr-2 h-4 w-4' />
              {exportExcel.isPending ? 'Exporting Excel...' : 'Export Excel'}
            </Button>
            <Button
              variant='secondary'
              disabled={!selectedState?.machineCode || exportWord.isPending}
              onClick={() => selectedState?.machineCode && exportWord.mutate(selectedState.machineCode)}
            >
              <FileText className='mr-2 h-4 w-4' />
              {exportWord.isPending ? 'Exporting Word...' : 'Export Word'}
            </Button>
            <Button variant='secondary' onClick={() => refreshRuntime()}>
              Refresh
            </Button>
            <Button
              variant='destructive'
              disabled={!selectedState?.machineCode || !canStop || stopSession.isPending}
              onClick={() => selectedState?.machineCode && stopSession.mutate(selectedState.machineCode)}
            >
              <Square className='mr-2 h-4 w-4' />
              {stopSession.isPending ? 'Stopping...' : 'Stop Machine'}
            </Button>
            <Button disabled={startSession.isPending || !form.machineCode.trim() || !form.modelKey} onClick={() => startSession.mutate()}>
              <Play className='mr-2 h-4 w-4' />
              {startSession.isPending ? 'Starting...' : 'Enable Machine'}
            </Button>
          </>
        }
      />

      <WorkspaceTabs
        value={activeWorkspaceTab}
        onValueChange={(key) => setActiveWorkspaceTab(key as 'monitor' | 'setup' | 'counts' | 'diagnostics')}
        items={[
          { key: 'monitor', label: 'Monitor', icon: Eye, hint: 'Preview, status, live guidance' },
          { key: 'setup', label: 'Setup', icon: Camera, hint: 'Model stack, camera, tuning' },
          { key: 'counts', label: 'Counts', icon: Gauge, hint: 'Totals, labels, runtime facts' },
          { key: 'diagnostics', label: 'Diagnostics', icon: AlertTriangle, hint: 'Logs and machine events' }
        ]}
      />

      {activeWorkspaceTab === 'monitor' ? (
      <section className='grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]'>
        <Card className='overflow-hidden bg-[linear-gradient(155deg,rgba(248,250,252,0.92),rgba(236,253,245,0.82)_42%,rgba(224,242,254,0.8))] dark:bg-[linear-gradient(160deg,rgba(15,23,42,0.82),rgba(17,24,39,0.92))]'>
          <CardContent className='p-0'>
            <div className='relative aspect-[16/9] overflow-hidden'>
              {previewMode === 'browser' ? (
                <video ref={browserVideoRef} className='absolute inset-0 h-full w-full object-cover' autoPlay muted playsInline />
              ) : snapshotUrl ? (
                <img
                  src={snapshotUrl}
                  alt='Live machine preview'
                  className='absolute inset-0 h-full w-full object-cover'
                />
              ) : (
                <>
                  <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),rgba(241,245,249,0.95)_48%,rgba(226,232,240,0.86))]' />
                  <div className='absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:40px_40px]' />
                  <div className='absolute inset-0 flex items-center justify-center p-6'>
                    <div className='max-w-md rounded-[28px] border border-white/70 bg-white/65 p-6 text-center shadow-[0_20px_50px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/55'>
                      <div className='mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-[linear-gradient(145deg,rgba(13,148,136,0.18),rgba(59,130,246,0.14))] text-emerald-700 dark:text-emerald-300'>
                        <Camera className='h-7 w-7' />
                      </div>
                      <p className='mt-4 text-lg font-semibold text-slate-950 dark:text-slate-50'>Live preview appears here</p>
                      <p className='mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300'>
                        Select the camera and model stack, then click <span className='font-semibold'>Enable Machine</span> to start the feed and realtime count.
                      </p>
                    </div>
                  </div>
                </>
              )}

              <div className='absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-slate-900/20' />

              {previewMode === 'browser' ? (
                <div className='absolute inset-x-0 top-20 z-[1] px-5'>
                  <div className='max-w-xl rounded-[22px] border border-amber-200/80 bg-amber-50/92 px-4 py-3 text-sm text-amber-900 shadow-[0_14px_40px_rgba(15,23,42,0.14)] backdrop-blur'>
                    <p className='font-semibold'>Preview only</p>
                    <p className='mt-1'>
                      This browser video is smoother, but the real ML count still runs from the machine runtime camera. Use
                      {' '}
                      <span className='font-semibold'>Machine Snapshot</span>
                      {' '}
                      to verify what the model is reading.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className='absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-4 p-5'>
                <div className='space-y-2'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Badge variant={getStateVariant(selectedState?.controlState)}>{selectedState?.controlState || 'IDLE'}</Badge>
                    <Badge variant={getStateVariant(selectedState?.cameraState)}>{selectedState?.cameraState || 'CLOSED'}</Badge>
                    {selectedCatalogModel ? <Badge variant={selectedModelMode.variant}>{selectedModelMode.label}</Badge> : null}
                    <Badge variant={previewMode === 'browser' ? 'warning' : 'default'}>
                      {previewMode === 'browser' ? 'Browser preview' : 'Machine snapshot'}
                    </Badge>
                  </div>
                  <div>
                    <h2 className='text-2xl font-semibold tracking-tight'>{selectedState?.displayName || form.displayName || 'Vision Counter'}</h2>
                    <p className='mt-1 text-sm text-slate-300'>
                      {selectedCatalogModel?.name || 'Select a model stack'} • {selectedState?.machineCode || form.machineCode}
                    </p>
                  </div>
                </div>

                <div className='min-w-[180px] rounded-[24px] border border-white/30 bg-white/15 p-4 backdrop-blur-xl'>
                  <p className='text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300'>Current frame</p>
                  <p className='mt-3 text-4xl font-semibold'>{formatNumber(selectedState?.visibleCounts.total || 0)}</p>
                  <p className='mt-2 text-sm text-slate-300'>visible items right now</p>
                </div>
              </div>

              <div className='absolute inset-x-0 bottom-0 grid gap-3 border-t border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl md:grid-cols-4'>
                <div>
                  <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-400'>Visible pills</p>
                  <p className='mt-1 text-2xl font-semibold'>{formatNumber(selectedState?.visibleCounts.pill || 0)}</p>
                </div>
                <div>
                  <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-400'>Visible tablets</p>
                  <p className='mt-1 text-2xl font-semibold'>{formatNumber(selectedState?.visibleCounts.tablet || 0)}</p>
                </div>
                <div>
                  <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-400'>Session total</p>
                  <p className='mt-1 text-2xl font-semibold'>{formatNumber(selectedState?.cumulativeCounts.total || 0)}</p>
                </div>
                <div>
                  <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-400'>FPS</p>
                  <p className='mt-1 text-2xl font-semibold'>{selectedState?.fps?.toFixed(1) || '0.0'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className='grid gap-6'>
          <Card>
            <CardHeader>
              <CardTitle>ML Detection Status</CardTitle>
              <CardDescription>Use this to confirm whether the live model is actually reading the machine feed.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div
                className={`rounded-[24px] border p-4 ${
                  runtimeGuidance.tone === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                    : runtimeGuidance.tone === 'danger'
                      ? 'border-red-200 bg-red-50 text-red-900'
                      : runtimeGuidance.tone === 'warning'
                        ? 'border-amber-200 bg-amber-50 text-amber-950'
                        : 'border-border/70 bg-muted/20 text-foreground'
                }`}
              >
                <p className='font-semibold'>{runtimeGuidance.title}</p>
                <p className='mt-1 text-sm leading-6 opacity-90'>{runtimeGuidance.description}</p>
              </div>

              <div className='grid gap-3 sm:grid-cols-2'>
                <RuntimeFact label='Active Model' value={selectedState?.modelName || selectedCatalogModel?.name || 'Not started'} />
                <RuntimeFact
                  label='Machine Camera'
                  value={
                    selectedCamera
                      ? formatCameraSource(selectedCamera, cameraAliases[String(selectedCamera.index)])
                      : selectedState?.cameraIndex !== undefined && selectedState?.cameraIndex !== null
                        ? `Camera ${selectedState.cameraIndex}`
                        : 'Auto / not opened yet'
                  }
                />
                <RuntimeFact label='Tracked Objects' value={formatNumber(selectedState?.trackedObjectCount || 0)} />
                <RuntimeFact label='Average Confidence' value={selectedState?.averageConfidence ? `${(selectedState.averageConfidence * 100).toFixed(1)}%` : '0.0%'} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preview Source</CardTitle>
              <CardDescription>Use the machine snapshot for true ML verification, or ask the browser for camera permission if you want smoother local video.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid gap-2 sm:grid-cols-2'>
                <Button variant={previewMode === 'machine' ? 'default' : 'secondary'} onClick={() => setPreviewMode('machine')}>
                  Machine Snapshot
                </Button>
                <Button
                  variant={previewMode === 'browser' ? 'default' : 'secondary'}
                  onClick={() => void startBrowserPreview()}
                  disabled={browserPreviewState === 'requesting'}
                >
                  {browserPreviewState === 'requesting' ? 'Requesting camera...' : 'Use Browser Camera'}
                </Button>
              </div>

              <div className='rounded-[22px] border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground'>
                Browser preview is only for low-latency viewing in this page. Counting and ML detection still run from the machine runtime camera, and that camera may not match the browser-selected device. If you want to verify detection, switch back to <span className='font-semibold text-slate-900 dark:text-slate-100'>Machine Snapshot</span>.
              </div>

              {browserCameras.length ? (
                <div>
                  <label className='field-label'>Browser Preview Camera</label>
                  <select
                    className='h-11 w-full rounded-2xl border border-input/90 bg-white/82 px-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.66)] dark:bg-slate-950/45'
                    value={browserCameraId}
                    onChange={(event) => setBrowserCameraId(event.target.value)}
                  >
                    {browserCameras.map((camera) => (
                      <option key={camera.deviceId} value={camera.deviceId}>
                        {camera.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {browserPreviewError ? (
                <div className='rounded-[20px] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700'>{browserPreviewError}</div>
              ) : null}
            </CardContent>
          </Card>

          <Card className='bg-[linear-gradient(180deg,rgba(236,253,245,0.72),rgba(255,255,255,0.92))]'>
            <CardHeader>
              <CardTitle>Quick Start</CardTitle>
              <CardDescription>Use the machine in this order for the cleanest live counting workflow.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4 text-sm text-slate-700'>
              <div className='rounded-[24px] border border-emerald-200 bg-white/90 p-4'>
                <p className='font-semibold text-slate-900'>1. Choose a free model</p>
                <p className='mt-1'>Start with <span className='font-semibold'>ensemble-local-best</span>. It combines your local models and does not need an API key.</p>
              </div>
              <div className='rounded-[24px] border border-emerald-200 bg-white/90 p-4'>
                <p className='font-semibold text-slate-900'>2. Enable the machine</p>
                <p className='mt-1'>The machine runtime starts detection and sends lightweight snapshots plus count data back to this dashboard.</p>
              </div>
              <div className='rounded-[24px] border border-emerald-200 bg-white/90 p-4'>
                <p className='font-semibold text-slate-900'>3. Use browser preview if you want smoother video</p>
                <p className='mt-1'>Browser preview asks for permission in Chrome and usually feels faster than the machine snapshot feed.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session Health</CardTitle>
              <CardDescription>The most important runtime message is shown here first.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
            <div className={`rounded-2xl border px-4 py-3 text-sm ${
                selectedState?.latestError ? 'border-red-300 bg-red-50 text-red-700' : 'border-border/70 bg-muted/20 text-muted-foreground'
              }`}>
                {selectedState?.latestError ? <AlertTriangle className='mr-2 inline h-4 w-4' /> : null}
                {headlineMessage}
              </div>

              {exportErrorMessage ? (
                <div className='rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700'>{exportErrorMessage}</div>
              ) : null}

              <div className='grid gap-3 sm:grid-cols-2'>
                <RuntimeFact label='Machine code' value={selectedState?.machineCode || form.machineCode} />
                <RuntimeFact label='Last heartbeat' value={formatDateTime(selectedState?.lastHeartbeatAt)} />
                <RuntimeFact label='Last telemetry' value={formatDateTime(selectedState?.lastTelemetryAt)} />
                <RuntimeFact label='Snapshot updated' value={formatDateTime(selectedState?.snapshotUpdatedAt)} />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
      ) : null}

      {activeWorkspaceTab === 'setup' ? (
      <section className='grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]'>
        <Card>
          <CardHeader>
            <CardTitle>Model Stacks</CardTitle>
            <CardDescription>Free local options are first. Hybrid ensembles still work without a Roboflow key and use the local parts automatically.</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4 lg:grid-cols-2'>
            {orderedModels.map((entry) => (
              <ModelStackCard key={entry.key} entry={entry} selected={form.modelKey === entry.key} onSelect={(key) => setForm((prev) => ({ ...prev, modelKey: key }))} />
            ))}
          </CardContent>
        </Card>

        <Card className='h-fit'>
          <CardHeader>
            <CardTitle>Machine Setup</CardTitle>
            <CardDescription>Set the machine details once, then mainly change the model stack or camera only when needed.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='rounded-[24px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.8),rgba(255,255,255,0.92))] p-4'>
              <div className='flex flex-wrap items-center gap-2'>
                <p className='text-lg font-semibold text-slate-900'>{selectedCatalogModel?.name || 'No model selected'}</p>
                {selectedCatalogModel ? <Badge variant={selectedModelMode.variant}>{selectedModelMode.label}</Badge> : null}
              </div>
              <p className='mt-2 text-sm text-slate-600'>{selectedCatalogModel?.notes || 'Select one of the model cards on the left before starting the machine.'}</p>
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='sm:col-span-2'>
                <label className='field-label'>Machine Code</label>
                <Input value={form.machineCode} onChange={(event) => setForm((prev) => ({ ...prev, machineCode: event.target.value }))} placeholder='MCH-ML-01' />
              </div>
              <div>
                <label className='field-label'>Display Name</label>
                <Input value={form.displayName} onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))} placeholder='Vision Counter' />
              </div>
              <div>
                <label className='field-label'>Location</label>
                <Input value={form.location} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} placeholder='Production Line A' />
              </div>
              <div>
                <label className='field-label'>Firmware Version</label>
                <Input value={form.firmwareVersion} onChange={(event) => setForm((prev) => ({ ...prev, firmwareVersion: event.target.value }))} placeholder='ml-vision-1.0.0' />
              </div>
              <div>
                <label className='field-label'>Camera Source</label>
                <select
                  className='h-11 w-full rounded-2xl border border-input/90 bg-white/82 px-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.66)] dark:bg-slate-950/45'
                  value={form.cameraIndex}
                  onChange={(event) => setForm((prev) => ({ ...prev, cameraIndex: event.target.value }))}
                >
                  <option value=''>Auto detect first available camera</option>
                  {availableCameras.map((camera) => (
                    <option key={camera.index} value={String(camera.index)}>
                      {formatCameraSource(camera, cameraAliases[String(camera.index)])}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className='text-xs text-muted-foreground'>
              {cameraCatalog.isLoading
                ? 'Scanning local camera sources...'
                : availableCameras.length
                  ? 'Choose a specific camera source or leave it on auto detect.'
                  : 'No camera list returned yet. Auto detect will still try the first available camera.'}
            </p>

            <p className='text-xs text-muted-foreground'>
              Performance mode is enabled automatically: lighter snapshots, no extra desktop preview window, and a reduced machine capture size.
            </p>

            <div className='rounded-[24px] border border-border/70 bg-muted/10 p-4'>
              <div className='mb-4'>
                <p className='text-sm font-semibold text-slate-900 dark:text-slate-100'>Vision Tuning</p>
                <p className='mt-1 text-sm text-muted-foreground'>
                  These values affect the real machine-learning feed. Stop and enable the machine again after changing them.
                </p>
              </div>

              <div className='mb-4 flex flex-wrap gap-2'>
                {VISION_PRESETS.map((preset) => (
                  <Button key={preset.key} variant='secondary' size='sm' onClick={() => applyVisionPreset(preset.values)}>
                    {preset.name}
                  </Button>
                ))}
                <Button variant='ghost' size='sm' onClick={() => applyVisionPreset(DEFAULT_VISION_TUNING)}>
                  Reset tuning
                </Button>
              </div>

              <div className='mb-4 rounded-[20px] border border-border/70 bg-background/75 p-3 text-xs leading-6 text-muted-foreground'>
                <span className='font-semibold text-foreground'>Tip:</span> if the camera shows the tablets clearly but the count stays at zero, switch to <span className='font-semibold text-foreground'>Machine Snapshot</span>, then try the <span className='font-semibold text-foreground'>Blister Pack</span> preset and restart the machine.
              </div>

              <div className='grid gap-4 sm:grid-cols-2'>
                <div>
                  <label className='field-label'>Confidence Threshold</label>
                  <Input type='number' min='0.10' max='0.99' step='0.01' value={form.confidenceThreshold} onChange={(event) => setForm((prev) => ({ ...prev, confidenceThreshold: event.target.value }))} placeholder='0.20' />
                </div>
                <div>
                  <label className='field-label'>IoU Threshold</label>
                  <Input type='number' min='0.10' max='0.99' step='0.01' value={form.iouThreshold} onChange={(event) => setForm((prev) => ({ ...prev, iouThreshold: event.target.value }))} placeholder='0.45' />
                </div>
                <div>
                  <label className='field-label'>Brightness</label>
                  <Input type='number' min='-80' max='80' step='1' value={form.brightness} onChange={(event) => setForm((prev) => ({ ...prev, brightness: event.target.value }))} placeholder='10' />
                </div>
                <div>
                  <label className='field-label'>Contrast</label>
                  <Input type='number' min='0.50' max='2.50' step='0.01' value={form.contrast} onChange={(event) => setForm((prev) => ({ ...prev, contrast: event.target.value }))} placeholder='1.10' />
                </div>
                <div>
                  <label className='field-label'>Gamma</label>
                  <Input type='number' min='0.30' max='2.50' step='0.01' value={form.gamma} onChange={(event) => setForm((prev) => ({ ...prev, gamma: event.target.value }))} placeholder='1.10' />
                </div>
                <div>
                  <label className='field-label'>Sharpness</label>
                  <Input type='number' min='0' max='2' step='0.01' value={form.sharpness} onChange={(event) => setForm((prev) => ({ ...prev, sharpness: event.target.value }))} placeholder='0.25' />
                </div>
                <div>
                  <label className='field-label'>Hardware Exposure</label>
                  <Input type='number' min='-13' max='1' step='0.01' value={form.exposure} onChange={(event) => setForm((prev) => ({ ...prev, exposure: event.target.value }))} placeholder='Optional, for example -6' />
                </div>
                <div>
                  <label className='field-label'>Hardware Gain</label>
                  <Input type='number' min='0' max='64' step='0.01' value={form.gain} onChange={(event) => setForm((prev) => ({ ...prev, gain: event.target.value }))} placeholder='Optional' />
                </div>
              </div>

              <p className='mt-4 text-xs text-muted-foreground'>
                Recommended first test for blister tablets: confidence `0.16`, brightness `14`, contrast `1.16`, gamma `1.18`, sharpness `0.32`.
              </p>
            </div>

            {availableCameras.length ? (
              <div className='rounded-[24px] border border-border/70 bg-muted/10 p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div>
                    <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Camera Labels</p>
                    <p className='mt-1 text-sm text-muted-foreground'>Rename the detected sources for this browser, for example Front Camera or Tray Camera.</p>
                  </div>
                  <Button variant='ghost' size='sm' onClick={() => setCameraAliases({})}>
                    Reset labels
                  </Button>
                </div>

                <div className='mt-4 grid gap-3'>
                  {availableCameras.map((camera) => (
                    <div key={`alias-${camera.index}`} className='grid gap-2 rounded-[20px] border border-border/60 bg-background/80 p-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center'>
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
                </div>
              </div>
            ) : null}

            {startSession.error instanceof Error ? (
              <div className='rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700'>
                {startSession.error.message}
              </div>
            ) : null}

            <div className='grid gap-2'>
              <Button disabled={startSession.isPending || !form.machineCode.trim() || !form.modelKey} onClick={() => startSession.mutate()}>
                <Play className='mr-2 h-4 w-4' />
                {startSession.isPending ? 'Starting camera...' : 'Enable Machine'}
              </Button>
              <Button
                variant='destructive'
                disabled={!selectedState?.machineCode || !canStop || stopSession.isPending}
                onClick={() => selectedState?.machineCode && stopSession.mutate(selectedState.machineCode)}
              >
                <Square className='mr-2 h-4 w-4' />
                {stopSession.isPending ? 'Stopping...' : 'Stop Machine'}
              </Button>
            </div>

            <div className='space-y-2'>
              <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Quick switch machines</p>
              <div className='flex flex-wrap gap-2'>
                {(runtimeList.data || []).map((entry) => (
                  <button
                    key={entry.machineCode}
                    type='button'
                    onClick={() => {
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
                    }}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      selectedMachineCode === entry.machineCode ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-border/70 bg-background hover:border-slate-300 hover:bg-muted/30'
                    }`}
                  >
                    {entry.machineCode}
                  </button>
                ))}
              </div>
              {!runtimeList.data?.length ? <p className='text-sm text-muted-foreground'>No runtime sessions yet. Start a machine to create the first live session.</p> : null}
            </div>
          </CardContent>
        </Card>
      </section>
      ) : null}

      {activeWorkspaceTab === 'counts' ? (
      <>
      <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-6'>
        <StatCard label='Visible Items' value={formatNumber(selectedState?.visibleCounts.total || 0)} hint='Current frame total' icon={<Eye className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Session Total' value={formatNumber(selectedState?.cumulativeCounts.total || 0)} hint='Unique detections this session' icon={<Camera className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Visible Pills' value={formatNumber(selectedState?.visibleCounts.pill || 0)} hint='Current frame' icon={<Activity className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Visible Tablets' value={formatNumber(selectedState?.visibleCounts.tablet || 0)} hint='Current frame' icon={<Layers3 className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='FPS' value={selectedState?.fps?.toFixed(1) || '0.0'} hint='Vision loop speed' icon={<Gauge className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Avg Confidence' value={selectedState?.averageConfidence?.toFixed(2) || '0.00'} hint='Detection confidence' icon={<Cpu className='h-4 w-4 text-muted-foreground' />} />
      </section>

      <section className='grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]'>
        <Card>
          <CardHeader>
            <CardTitle>Count Breakdown</CardTitle>
            <CardDescription>Visible counts show the current frame. Session totals track unique detections over time.</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-6 lg:grid-cols-[1fr_1fr]'>
            <div className='space-y-4'>
              <div className='rounded-2xl border border-border/70 p-4'>
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
                  <p className='mt-3 text-sm text-muted-foreground'>No active detections yet.</p>
                )}
              </div>

              <div className='rounded-2xl border border-border/70 p-4'>
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
                  <p className='mt-3 text-sm text-muted-foreground'>No session totals recorded yet.</p>
                )}
              </div>
            </div>

            <div className='space-y-3'>
              <RuntimeFact label='Model key' value={selectedState?.modelKey || form.modelKey || 'Not selected'} />
              <RuntimeFact label='Model provider' value={selectedState?.modelProvider || selectedCatalogModel?.provider || 'N/A'} />
              <RuntimeFact label='Model stack' value={selectedCatalogModel?.components?.join(', ') || 'Single model'} />
              <RuntimeFact label='Model path or id' value={selectedState?.modelPath || 'Not loaded'} />
              <RuntimeFact
                label='Camera source'
                value={
                  selectedCamera
                    ? formatCameraSource(selectedCamera, cameraAliases[String(selectedCamera.index)])
                    : selectedState?.cameraIndex ?? 'Auto'
                }
              />
              <RuntimeFact label='Frame size' value={`${selectedState?.frameWidth || 0} x ${selectedState?.frameHeight || 0}`} />
              <RuntimeFact label='Tracked objects' value={formatNumber(selectedState?.trackedObjectCount || 0)} />
              <RuntimeFact label='Frame number' value={formatNumber(selectedState?.frameNumber || 0)} />
            </div>
          </CardContent>
        </Card>

        <Card className='h-fit'>
          <CardHeader>
            <CardTitle>Runtime Snapshot</CardTitle>
            <CardDescription>Quick facts about the current model session without leaving the counts view.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
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
      <section className='grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]'>
        <Card>
          <CardHeader>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <CardTitle>Advanced Diagnostics</CardTitle>
                <CardDescription>Logs and payloads stay off the main monitor screen so the operator view remains clean.</CardDescription>
              </div>
              <Button variant='secondary' size='sm' onClick={() => setShowDiagnostics((current) => !current)}>
                {showDiagnostics ? 'Hide Diagnostics' : 'Load Diagnostics'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            {showDiagnostics ? (
              <>
                <div>
                  <p className='mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100'>Runtime Logs</p>
                  {diagnostics.data?.logTail?.length ? (
                    <pre className='max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-muted/40 p-3 text-xs leading-5'>
                      {diagnostics.data.logTail.join('\n')}
                    </pre>
                  ) : diagnostics.isLoading ? (
                    <p className='text-sm text-muted-foreground'>Loading runtime logs...</p>
                  ) : (
                    <p className='text-sm text-muted-foreground'>No bridge logs yet.</p>
                  )}
                </div>

                <div>
                  <p className='mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100'>Latest Machine Events</p>
                  <div className='space-y-3'>
                    {events.data?.rows?.length ? (
                      events.data.rows.map((event) => (
                        <div key={event.id} className='rounded-2xl border border-border/70 p-3'>
                          <div className='flex flex-wrap items-center justify-between gap-2'>
                            <div className='flex items-center gap-2'>
                              <span className='font-medium'>{event.eventType}</span>
                              <Badge variant={event.eventType.includes('error') ? 'danger' : 'default'}>{event.machine.machineCode}</Badge>
                            </div>
                            <span className='text-xs text-muted-foreground'>{formatDateTime(event.occurredAt)}</span>
                          </div>
                          <pre className='mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-2 text-[11px] leading-4'>
                            {JSON.stringify(event.payload || {}, null, 2)}
                          </pre>
                        </div>
                      ))
                    ) : events.isLoading ? (
                      <p className='text-sm text-muted-foreground'>Loading recent events...</p>
                    ) : (
                      <p className='text-sm text-muted-foreground'>No runtime events yet.</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className='rounded-[22px] border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground'>
                Diagnostics stay paused until you open them, so the live dashboard remains fast during counting.
              </div>
            )}
          </CardContent>
        </Card>

        <div className='grid gap-6'>
          <Card>
            <CardHeader>
              <CardTitle>Session Health</CardTitle>
              <CardDescription>The current runtime message, last error, and state are summarized here.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
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
