'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, Camera, Cpu, Gauge, Play, RefreshCcw, Square } from 'lucide-react';
import { CompactEmptyState, SectionHeader } from '../../../components/dashboard-section';
import { PageHeader } from '../../../components/page-header';
import { StatCard } from '../../../components/stat-card';
import { Badge } from '../../../components/ui/badge';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { apiBlob, apiRequest } from '../../../lib/api';
import { formatDateTime, formatNumber } from '../../../lib/format';
import { cn } from '../../../lib/utils';
import { MachineRuntimeCameraSource, MachineRuntimeModelCatalog, MachineRuntimeState, MachineRuntimeStateSummary } from '../../../types/api';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger';

function getStateVariant(state?: string | null): BadgeVariant {
  if (state === 'RUNNING' || state === 'OPEN') return 'success';
  if (state === 'ERROR') return 'danger';
  if (state === 'STARTING' || state === 'STOPPING' || state === 'OPENING') return 'warning';
  return 'default';
}

function toOptionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cameraLabel(camera?: MachineRuntimeCameraSource | null) {
  if (!camera) return 'Auto / first available';
  if (camera.width && camera.height) {
    return `${camera.name} (${camera.width} x ${camera.height})`;
  }
  return camera.name;
}

function ControlField({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className='grid gap-1.5'>
      <span className='text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground'>{label}</span>
      {children}
    </label>
  );
}

export default function LiveDashboardPage() {
  const queryClient = useQueryClient();
  const snapshotUrlRef = useRef('');

  const [selectedMachineCode, setSelectedMachineCode] = useState('');
  const [snapshotUrl, setSnapshotUrl] = useState('');
  const [form, setForm] = useState({
    machineCode: 'pill-counter-pi',
    modelKey: '',
    cameraIndex: ''
  });

  const modelCatalog = useQuery({
    queryKey: ['machine-runtime', 'catalog'],
    queryFn: () => apiRequest<MachineRuntimeModelCatalog>('/machine-runtime/catalog/models'),
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

  const runtimeEntries = runtimeList.data || [];
  const availableCameras = useMemo(
    () => [...(cameraCatalog.data || [])].sort((left, right) => left.index - right.index),
    [cameraCatalog.data]
  );

  const selectedState = useMemo(
    () => runtimeEntries.find((entry) => entry.machineCode === selectedMachineCode) || null,
    [runtimeEntries, selectedMachineCode]
  );

  const selectedModel = useMemo(
    () => modelCatalog.data?.models.find((entry) => entry.key === (selectedState?.modelKey || form.modelKey)) || null,
    [form.modelKey, modelCatalog.data?.models, selectedState?.modelKey]
  );

  const selectedCamera = useMemo(() => {
    if (form.cameraIndex) {
      return availableCameras.find((entry) => entry.index === Number(form.cameraIndex)) || null;
    }
    return null;
  }, [availableCameras, form.cameraIndex]);

  useEffect(() => {
    if (!runtimeEntries.length) return;

    const preferredMachine =
      runtimeEntries.find((entry) => entry.machineCode === selectedMachineCode) ||
      runtimeEntries.find((entry) => entry.controlState === 'RUNNING') ||
      runtimeEntries[0];

    if (!preferredMachine) return;

    if (preferredMachine.machineCode !== selectedMachineCode) {
      setSelectedMachineCode(preferredMachine.machineCode);
    }

    setForm((current) => ({
      ...current,
      machineCode: preferredMachine.machineCode,
      modelKey: current.modelKey || preferredMachine.modelKey || modelCatalog.data?.defaultModelKey || current.modelKey
    }));
  }, [modelCatalog.data?.defaultModelKey, runtimeEntries, selectedMachineCode]);

  useEffect(() => {
    if (!form.modelKey && modelCatalog.data?.defaultModelKey) {
      setForm((current) => ({ ...current, modelKey: modelCatalog.data.defaultModelKey }));
    }
  }, [form.modelKey, modelCatalog.data?.defaultModelKey]);

  useEffect(() => {
    return () => {
      if (snapshotUrlRef.current) {
        URL.revokeObjectURL(snapshotUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    snapshotUrlRef.current = snapshotUrl;
  }, [snapshotUrl]);

  useEffect(() => {
    const revision = selectedState?.snapshotUpdatedAt;
    if (!selectedMachineCode || !revision) {
      setSnapshotUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        snapshotUrlRef.current = '';
        return '';
      });
      return;
    }

    let cancelled = false;

    void apiBlob(`/machine-runtime/${encodeURIComponent(selectedMachineCode)}/snapshot.jpg?ts=${encodeURIComponent(revision)}`)
      .then((blob) => {
        if (!blob.size || cancelled) return;
        const nextUrl = URL.createObjectURL(blob);
        setSnapshotUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          snapshotUrlRef.current = nextUrl;
          return nextUrl;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSnapshotUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          snapshotUrlRef.current = '';
          return '';
        });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMachineCode, selectedState?.snapshotUpdatedAt]);

  const refreshRuntime = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['machine-runtime', 'list'] }),
      queryClient.invalidateQueries({ queryKey: ['machine-runtime', 'cameras'] }),
      queryClient.invalidateQueries({ queryKey: ['machine-runtime', 'catalog'] })
    ]);
  };

  const startSession = useMutation({
    mutationFn: async () => {
      const machineCode = form.machineCode.trim();
      return apiRequest<MachineRuntimeState>(`/machine-runtime/${encodeURIComponent(machineCode)}/start`, {
        method: 'POST',
        body: JSON.stringify({
          executionMode: 'remote',
          modelKey: form.modelKey || undefined,
          cameraIndex: toOptionalNumber(form.cameraIndex),
          telemetryIntervalMs: 750,
          snapshotIntervalMs: 750
        })
      });
    },
    onSuccess: async (payload) => {
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

  const canStart = Boolean(form.machineCode.trim() && form.modelKey);
  const canStop = Boolean(selectedState?.machineCode && ['STARTING', 'RUNNING', 'STOPPING', 'ERROR'].includes(selectedState.controlState));
  const waitingForTelemetry = Boolean(selectedState?.controlState === 'RUNNING' && !selectedState.lastTelemetryAt);
  const statusMessage =
    selectedState?.latestError ||
    selectedState?.latestMessage ||
    (waitingForTelemetry
      ? 'The Pi is running, but the website has not received the first preview frame yet.'
      : 'Ready to start the machine from the website.');
  const controlErrorMessage =
    startSession.error instanceof Error
      ? startSession.error.message
      : stopSession.error instanceof Error
        ? stopSession.error.message
        : '';

  return (
    <div className='space-y-4'>
      <PageHeader
        title='Machine Control'
        description='Start the Raspberry Pi, see the live preview, and watch the count in one place.'
        eyebrow='Operator view'
      />

      <section className='grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]'>
        <Card className='overflow-hidden'>
          <CardHeader className='border-b border-border/70 bg-white/55 dark:bg-slate-950/25'>
            <SectionHeader
              title='Live Preview'
              description='This is the operator screen: Pi status, remote start/stop, preview, and counts.'
              actions={
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant={getStateVariant(selectedState?.controlState)}>{selectedState?.controlState || 'IDLE'}</Badge>
                  <Badge variant={getStateVariant(selectedState?.cameraState)}>{selectedState?.cameraState || 'CLOSED'}</Badge>
                  {selectedModel ? <Badge variant='default'>{selectedModel.name}</Badge> : null}
                </div>
              }
            />
          </CardHeader>
          <CardContent className='space-y-4 p-4 md:p-5'>
            <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_auto]'>
              <ControlField label='Machine'>
                <select
                  className='select-field'
                  value={selectedMachineCode || form.machineCode}
                  onChange={(event) => {
                    const nextMachine = event.target.value;
                    const match = runtimeEntries.find((entry) => entry.machineCode === nextMachine);
                    setSelectedMachineCode(nextMachine);
                    setForm((current) => ({
                      ...current,
                      machineCode: nextMachine,
                      modelKey: current.modelKey || match?.modelKey || modelCatalog.data?.defaultModelKey || ''
                    }));
                  }}
                >
                  {runtimeEntries.length ? null : <option value='pill-counter-pi'>pill-counter-pi</option>}
                  {runtimeEntries.map((entry) => (
                    <option key={entry.machineCode} value={entry.machineCode}>
                      {entry.machineCode}
                    </option>
                  ))}
                </select>
              </ControlField>

              <ControlField label='Model'>
                <select
                  className='select-field'
                  value={form.modelKey}
                  onChange={(event) => setForm((current) => ({ ...current, modelKey: event.target.value }))}
                >
                  <option value=''>Select model</option>
                  {(modelCatalog.data?.models || []).map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </ControlField>

              <ControlField label='Camera'>
                <select
                  className='select-field'
                  value={form.cameraIndex}
                  onChange={(event) => setForm((current) => ({ ...current, cameraIndex: event.target.value }))}
                >
                  <option value=''>Auto / first available</option>
                  {availableCameras.map((entry) => (
                    <option key={entry.index} value={String(entry.index)}>
                      Camera {entry.index}: {cameraLabel(entry)}
                    </option>
                  ))}
                </select>
              </ControlField>

              <div className='flex flex-wrap items-end gap-2'>
                <Button variant='secondary' size='sm' onClick={() => refreshRuntime()}>
                  <RefreshCcw className='mr-2 h-4 w-4' />
                  Refresh
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

            {controlErrorMessage ? (
              <div className='rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800'>{controlErrorMessage}</div>
            ) : null}

            <div className='relative aspect-[16/9] overflow-hidden rounded-[24px] border border-border/70 bg-[linear-gradient(155deg,rgba(248,250,252,0.94),rgba(236,253,245,0.82)_42%,rgba(224,242,254,0.82))] dark:bg-[linear-gradient(160deg,rgba(15,23,42,0.82),rgba(17,24,39,0.94))]'>
              {snapshotUrl ? (
                <img src={snapshotUrl} alt='Live machine preview' className='absolute inset-0 h-full w-full object-cover' />
              ) : (
                <div className='absolute inset-0 flex items-center justify-center p-6'>
                  <CompactEmptyState
                    icon={Camera}
                    title={waitingForTelemetry ? 'Waiting for Pi preview' : 'Preview will appear here'}
                    message={
                      waitingForTelemetry
                        ? 'The Pi has started, but the first preview frame has not reached the website yet.'
                        : 'Use Start to launch the Pi and stream preview snapshots to this page.'
                    }
                    action={
                      !selectedState || selectedState.controlState === 'IDLE' ? (
                        <Button size='sm' disabled={!canStart || startSession.isPending} onClick={() => startSession.mutate()}>
                          <Play className='mr-2 h-4 w-4' />
                          {startSession.isPending ? 'Starting...' : 'Start machine'}
                        </Button>
                      ) : undefined
                    }
                    className='w-full max-w-md border-white/25 bg-white/74 backdrop-blur dark:border-white/10 dark:bg-slate-950/55'
                  />
                </div>
              )}

              <div className='absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-4'>
                <div className='space-y-2'>
                  <div className='flex flex-wrap gap-2'>
                    <Badge variant={getStateVariant(selectedState?.controlState)}>{selectedState?.controlState || 'IDLE'}</Badge>
                    <Badge variant={getStateVariant(selectedState?.cameraState)}>{selectedState?.cameraState || 'CLOSED'}</Badge>
                  </div>
                  <div className='rounded-2xl bg-slate-950/55 px-4 py-3 text-white backdrop-blur'>
                    <p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300'>{selectedState?.machineCode || form.machineCode}</p>
                    <p className='mt-1 text-lg font-semibold'>{selectedState?.displayName || 'Pill Counter Pi'}</p>
                    <p className='text-sm text-slate-300'>{selectedModel?.name || 'No model selected'}</p>
                  </div>
                </div>

                <div className='min-w-[156px] rounded-2xl bg-slate-950/55 px-4 py-3 text-white backdrop-blur'>
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

            <div className='rounded-2xl border border-border/70 bg-muted/15 px-4 py-3 text-sm text-muted-foreground'>
              <span className='font-semibold text-foreground'>Status:</span> {statusMessage}
            </div>
          </CardContent>
        </Card>

        <div className='grid gap-4'>
          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-1'>
            <StatCard label='Visible Items' value={formatNumber(selectedState?.visibleCounts.total || 0)} hint='Current frame' icon={<Camera className='h-4 w-4 text-muted-foreground' />} />
            <StatCard label='Session Total' value={formatNumber(selectedState?.cumulativeCounts.total || 0)} hint='Current run' icon={<Activity className='h-4 w-4 text-muted-foreground' />} />
            <StatCard label='FPS' value={selectedState?.fps?.toFixed(1) || '0.0'} hint='Runtime speed' icon={<Gauge className='h-4 w-4 text-muted-foreground' />} />
            <StatCard
              label='Avg Confidence'
              value={selectedState?.averageConfidence?.toFixed(2) || '0.00'}
              hint='ML confidence'
              icon={<Cpu className='h-4 w-4 text-muted-foreground' />}
            />
          </div>

          <Card>
            <CardHeader>
              <SectionHeader title='Machine Status' description='The facts you need when the Pi is not behaving as expected.' />
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-1'>
                <div className='surface-subtle rounded-2xl p-3'>
                  <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Camera source</p>
                  <p className='mt-1.5 text-sm font-medium text-foreground'>{cameraLabel(selectedCamera)}</p>
                </div>
                <div className='surface-subtle rounded-2xl p-3'>
                  <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Last telemetry</p>
                  <p className='mt-1.5 text-sm font-medium text-foreground'>
                    {selectedState?.lastTelemetryAt ? formatDateTime(selectedState.lastTelemetryAt) : 'No live frame yet'}
                  </p>
                </div>
                <div className='surface-subtle rounded-2xl p-3'>
                  <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Last snapshot</p>
                  <p className='mt-1.5 text-sm font-medium text-foreground'>
                    {selectedState?.snapshotUpdatedAt ? formatDateTime(selectedState.snapshotUpdatedAt) : 'No snapshot yet'}
                  </p>
                </div>
                <div className='surface-subtle rounded-2xl p-3'>
                  <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Tracked objects</p>
                  <p className='mt-1.5 text-sm font-medium text-foreground'>{formatNumber(selectedState?.trackedObjectCount || 0)}</p>
                </div>
              </div>

              {selectedState?.latestError ? (
                <div className='rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'>
                  <div className='flex items-start gap-2'>
                    <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
                    <span>{selectedState.latestError}</span>
                  </div>
                </div>
              ) : null}

              <div className='rounded-2xl border border-dashed border-border/80 bg-muted/10 px-4 py-3 text-sm text-muted-foreground'>
                If the Pi screen shows preview but this page stays blank, leave camera on <span className='font-semibold text-foreground'>Auto</span> first. The older page often kept a stale camera index and made remote start harder than it needed to be.
              </div>
            </CardContent>
          </Card>

          <details className='surface-card overflow-hidden rounded-[24px]'>
            <summary className='cursor-pointer list-none px-4 py-4 md:px-5'>
              <SectionHeader title='Advanced' description='Only open this when you need setup details or troubleshooting.' />
            </summary>
            <CardContent className='space-y-4 border-t border-border/70 pt-4'>
              <div className='grid gap-3 sm:grid-cols-2'>
                <ControlField label='Machine code'>
                  <Input value={form.machineCode} onChange={(event) => setForm((current) => ({ ...current, machineCode: event.target.value }))} />
                </ControlField>
                <ControlField label='Selected camera index'>
                  <Input value={form.cameraIndex || 'Auto'} readOnly />
                </ControlField>
              </div>

              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='surface-subtle rounded-2xl p-3'>
                  <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Model key</p>
                  <p className='mt-1.5 text-sm font-medium text-foreground'>{selectedState?.modelKey || form.modelKey || 'Not selected'}</p>
                </div>
                <div className='surface-subtle rounded-2xl p-3'>
                  <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Last heartbeat</p>
                  <p className='mt-1.5 text-sm font-medium text-foreground'>
                    {selectedState?.lastHeartbeatAt ? formatDateTime(selectedState.lastHeartbeatAt) : 'No heartbeat yet'}
                  </p>
                </div>
              </div>

              <div className='flex flex-wrap gap-2'>
                <Link href='/machine-runs' className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
                  Open run history
                </Link>
              </div>
            </CardContent>
          </details>
        </div>
      </section>
    </div>
  );
}
