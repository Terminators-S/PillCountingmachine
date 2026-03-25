'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Activity, AlertTriangle, Cpu, ExternalLink, Radio, RefreshCcw, Server } from 'lucide-react';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { PageHeader } from '../../../components/page-header';
import { DataTable } from '../../../components/data-table';
import { StatCard } from '../../../components/stat-card';
import { apiRequest } from '../../../lib/api';
import { formatDateTime, formatNumber } from '../../../lib/format';
import { cn } from '../../../lib/utils';
import { EventListResponse, Machine, MachineEventRow, MachineRuntimeStateSummary, MachineStatus } from '../../../types/api';

type FleetHealth = 'healthy' | 'warning' | 'critical';

type FleetMachineRow = Machine & {
  runtime: MachineRuntimeStateSummary | null;
  lastHeartbeat: string | null;
  runtimeState: string;
  cameraState: string;
  fps: number | null;
  visibleTotal: number;
  sessionTotal: number;
  latestMessage: string | null;
  latestError: string | null;
  health: FleetHealth;
};

function machineStatusVariant(status?: string | null) {
  if (status === 'ONLINE' || status === 'RUNNING' || status === 'OPEN') return 'success';
  if (status === 'OFFLINE' || status === 'ERROR') return 'danger';
  if (status === 'MAINTENANCE' || status === 'STARTING' || status === 'STOPPING' || status === 'OPENING') return 'warning';
  return 'default';
}

function computeFleetHealth(machine: Machine, runtime: MachineRuntimeStateSummary | null): FleetHealth {
  const displayStatus = machine.displayStatus || machine.status;
  if (displayStatus === 'OFFLINE' || runtime?.controlState === 'ERROR' || runtime?.latestError) {
    return 'critical';
  }
  if (displayStatus === 'MAINTENANCE' || runtime?.controlState === 'STARTING' || runtime?.controlState === 'STOPPING') {
    return 'warning';
  }
  return 'healthy';
}

function healthLabel(health: FleetHealth) {
  if (health === 'critical') return 'Needs attention';
  if (health === 'warning') return 'Watch';
  return 'Healthy';
}

function summarizeEventPayload(payload?: Record<string, unknown>) {
  if (!payload || !Object.keys(payload).length) return '-';
  const serialized = JSON.stringify(payload);
  return serialized.length > 140 ? `${serialized.slice(0, 137)}...` : serialized;
}

const QUICK_EVENT_FILTERS = ['machine.error', 'machine.heartbeat', 'machine.runtime.remote.start.requested', 'machine.runtime.remote.stop.requested', 'count.completed'];

export default function MachinesPage() {
  const queryClient = useQueryClient();
  const [machineFilter, setMachineFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [selectedMachineCode, setSelectedMachineCode] = useState('');
  const [bulkFeedback, setBulkFeedback] = useState('');

  const machines = useQuery({
    queryKey: ['machines', 'fleet'],
    queryFn: () => apiRequest<Machine[]>('/machines'),
    refetchInterval: 10_000
  });

  const runtimeList = useQuery({
    queryKey: ['machine-runtime', 'list', 'machines-page'],
    queryFn: () => apiRequest<MachineRuntimeStateSummary[]>('/machine-runtime'),
    refetchInterval: 2_000
  });

  const eventQueryString = useMemo(() => {
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    if (machineFilter) params.set('machineId', machineFilter);
    if (eventTypeFilter) params.set('eventType', eventTypeFilter);
    return params.toString();
  }, [machineFilter, eventTypeFilter]);

  const events = useQuery({
    queryKey: ['machine-events', eventQueryString],
    queryFn: () => apiRequest<EventListResponse>(`/machine-events?${eventQueryString}`)
  });

  const selectedMachineEvents = useQuery({
    queryKey: ['machine-events', 'selected-machine', selectedMachineCode],
    queryFn: () => apiRequest<EventListResponse>(`/machine-events?machineId=${encodeURIComponent(selectedMachineCode)}&page=1&pageSize=8`),
    enabled: Boolean(selectedMachineCode)
  });

  const fleetRows = useMemo<FleetMachineRow[]>(() => {
    const runtimeByCode = new Map((runtimeList.data || []).map((entry) => [entry.machineCode, entry]));
    return (machines.data || []).map((machine) => {
      const runtime = runtimeByCode.get(machine.machineCode) || null;
      return {
        ...machine,
        runtime,
        lastHeartbeat: runtime?.lastHeartbeatAt || machine.lastSeen || null,
        runtimeState: runtime?.controlState || 'IDLE',
        cameraState: runtime?.cameraState || 'CLOSED',
        fps: runtime?.fps ?? null,
        visibleTotal: runtime?.visibleCounts.total || 0,
        sessionTotal: runtime?.cumulativeCounts.total || 0,
        latestMessage: runtime?.latestMessage || null,
        latestError: runtime?.latestError || null,
        health: computeFleetHealth(machine, runtime)
      };
    });
  }, [machines.data, runtimeList.data]);

  const selectedMachine = useMemo(
    () => fleetRows.find((entry) => entry.machineCode === selectedMachineCode) || null,
    [fleetRows, selectedMachineCode]
  );

  useEffect(() => {
    if (!fleetRows.length) return;
    if (selectedMachineCode && fleetRows.some((entry) => entry.machineCode === selectedMachineCode)) return;
    setSelectedMachineCode(fleetRows.find((entry) => entry.runtimeState === 'RUNNING')?.machineCode || fleetRows[0].machineCode);
  }, [fleetRows, selectedMachineCode]);

  const stats = useMemo(() => {
    const total = fleetRows.length;
    const online = fleetRows.filter((entry) => (entry.displayStatus || entry.status) === 'ONLINE').length;
    const running = fleetRows.filter((entry) => entry.runtimeState === 'RUNNING').length;
    const attention = fleetRows.filter((entry) => entry.health !== 'healthy').length;
    return { total, online, running, attention };
  }, [fleetRows]);

  const refreshAll = async () => {
    setBulkFeedback('');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['machines', 'fleet'] }),
      queryClient.invalidateQueries({ queryKey: ['machine-runtime', 'list', 'machines-page'] }),
      queryClient.invalidateQueries({ queryKey: ['machine-events'] })
    ]);
  };

  const copyMachineCodes = async (rows: FleetMachineRow[]) => {
    const payload = rows.map((entry) => entry.machineCode).join('\n');
    try {
      await navigator.clipboard.writeText(payload);
      setBulkFeedback(`Copied ${rows.length} machine code(s).`);
    } catch {
      setBulkFeedback('Clipboard copy failed in this browser session.');
    }
  };

  const machineColumns = useMemo<ColumnDef<FleetMachineRow>[]>(
    () => [
      {
        accessorKey: 'machineCode',
        header: 'Machine',
        cell: ({ row }) => (
          <div className='space-y-1'>
            <button className='font-semibold text-left text-slate-950 dark:text-white' onClick={() => setSelectedMachineCode(row.original.machineCode)}>
              {row.original.machineCode}
            </button>
            <p className='text-xs text-muted-foreground'>{row.original.displayName || 'Unnamed device'}</p>
          </div>
        )
      },
      { accessorKey: 'location', header: 'Location' },
      {
        accessorKey: 'displayStatus',
        header: 'Fleet Status',
        cell: ({ row }) => {
          const state = row.original.displayStatus || row.original.status;
          return <Badge variant={machineStatusVariant(state)}>{state}</Badge>;
        }
      },
      {
        accessorKey: 'runtimeState',
        header: 'Runtime',
        cell: ({ row }) => (
          <div className='space-y-1'>
            <Badge variant={machineStatusVariant(row.original.runtimeState)}>{row.original.runtimeState}</Badge>
            <p className='text-xs text-muted-foreground'>Camera {row.original.cameraState}</p>
          </div>
        )
      },
      {
        accessorKey: 'lastHeartbeat',
        header: 'Last Heartbeat',
        cell: ({ row }) => (row.original.lastHeartbeat ? formatDateTime(row.original.lastHeartbeat) : 'No heartbeat yet')
      },
      {
        accessorKey: 'sessionTotal',
        header: 'Session Total',
        cell: ({ row }) => formatNumber(row.original.sessionTotal)
      },
      {
        accessorKey: 'fps',
        header: 'FPS',
        cell: ({ row }) => (row.original.fps ? row.original.fps.toFixed(1) : '0.0')
      },
      {
        accessorKey: 'health',
        header: 'Health',
        cell: ({ row }) => <Badge variant={machineStatusVariant(row.original.health === 'healthy' ? 'ONLINE' : row.original.health === 'warning' ? 'MAINTENANCE' : 'ERROR')}>{healthLabel(row.original.health)}</Badge>
      }
    ],
    []
  );

  const eventColumns = useMemo<ColumnDef<MachineEventRow>[]>(
    () => [
      { accessorKey: 'machine.machineCode', header: 'Machine', cell: ({ row }) => row.original.machine.machineCode },
      { accessorKey: 'eventType', header: 'Event Type', cell: ({ row }) => <span className='font-medium'>{row.original.eventType}</span> },
      { accessorKey: 'occurredAt', header: 'Occurred At', cell: ({ row }) => formatDateTime(row.original.occurredAt) },
      { accessorKey: 'sourceIp', header: 'Source IP', cell: ({ row }) => row.original.sourceIp || '-' },
      {
        accessorKey: 'payload',
        header: 'Payload',
        cell: ({ row }) => (
          <pre className='max-w-[420px] overflow-x-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px] leading-4'>
            {JSON.stringify(row.original.payload || {}, null, 2)}
          </pre>
        )
      }
    ],
    []
  );

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Machines Fleet'
        description='Monitor IoT device health, runtime state, heartbeat recency, and operational events from one page.'
        actions={
          <Button onClick={() => refreshAll()}>
            <RefreshCcw className='mr-2 h-4 w-4' />
            Refresh Fleet
          </Button>
        }
      />

      <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <StatCard label='Devices' value={stats.total} hint='Registered machines' icon={<Server className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Online' value={stats.online} hint='Within heartbeat window' icon={<Radio className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Running' value={stats.running} hint='Active runtime sessions' icon={<Activity className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Attention' value={stats.attention} hint='Offline, warning, or error state' icon={<AlertTriangle className='h-4 w-4 text-muted-foreground' />} />
      </section>

      {bulkFeedback ? <div className='rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'>{bulkFeedback}</div> : null}

      <section className='grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_380px]'>
        <Card>
          <CardHeader>
            <CardTitle>Fleet Status</CardTitle>
          </CardHeader>
          <CardContent>
            {machines.data && runtimeList.data ? (
              <DataTable
                columns={machineColumns}
                data={fleetRows}
                enableRowSelection
                bulkActionLabel='Copy selected machine codes'
                onBulkAction={copyMachineCodes}
                renderRowActions={(row) => (
                  <div className='flex justify-end gap-2'>
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => {
                        setSelectedMachineCode(row.machineCode);
                        setMachineFilter(row.machineCode);
                      }}
                    >
                      View events
                    </Button>
                    <Link href='/live' className={cn(buttonVariants({ size: 'sm', variant: 'secondary' }))}>
                      <ExternalLink className='mr-2 h-4 w-4' />
                      Open live
                    </Link>
                  </div>
                )}
                searchPlaceholder='Search machine code, location, runtime state...'
                emptyText='No machines available.'
              />
            ) : machines.isLoading || runtimeList.isLoading ? (
              <p className='text-sm text-muted-foreground'>Loading machine fleet...</p>
            ) : (
              <p className='text-sm text-red-600'>Failed to load machine fleet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedMachine ? `${selectedMachine.machineCode} details` : 'Machine details'}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            {selectedMachine ? (
              <>
                <div className='flex flex-wrap gap-2'>
                  <Badge variant={machineStatusVariant(selectedMachine.displayStatus || selectedMachine.status)}>
                    {selectedMachine.displayStatus || selectedMachine.status}
                  </Badge>
                  <Badge variant={machineStatusVariant(selectedMachine.runtimeState)}>{selectedMachine.runtimeState}</Badge>
                  <Badge variant={machineStatusVariant(selectedMachine.cameraState)}>{selectedMachine.cameraState}</Badge>
                  <Badge variant={machineStatusVariant(selectedMachine.health === 'healthy' ? 'ONLINE' : selectedMachine.health === 'warning' ? 'MAINTENANCE' : 'ERROR')}>
                    {healthLabel(selectedMachine.health)}
                  </Badge>
                </div>

                <div className='grid gap-3 sm:grid-cols-2'>
                  <div className='rounded-2xl border border-border/70 bg-muted/15 px-4 py-3'>
                    <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Location</p>
                    <p className='mt-1 text-sm font-medium'>{selectedMachine.location}</p>
                  </div>
                  <div className='rounded-2xl border border-border/70 bg-muted/15 px-4 py-3'>
                    <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Firmware</p>
                    <p className='mt-1 text-sm font-medium'>{selectedMachine.firmwareVersion}</p>
                  </div>
                  <div className='rounded-2xl border border-border/70 bg-muted/15 px-4 py-3'>
                    <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Last heartbeat</p>
                    <p className='mt-1 text-sm font-medium'>{selectedMachine.lastHeartbeat ? formatDateTime(selectedMachine.lastHeartbeat) : 'No heartbeat yet'}</p>
                  </div>
                  <div className='rounded-2xl border border-border/70 bg-muted/15 px-4 py-3'>
                    <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Model / FPS</p>
                    <p className='mt-1 text-sm font-medium'>{selectedMachine.runtime?.modelName || 'No runtime selected'}</p>
                    <p className='text-xs text-muted-foreground'>{selectedMachine.fps ? `${selectedMachine.fps.toFixed(1)} FPS` : '0.0 FPS'}</p>
                  </div>
                </div>

                <div className='rounded-2xl border border-border/70 bg-muted/15 px-4 py-3'>
                  <div className='flex items-center justify-between gap-3'>
                    <div>
                      <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Live counts</p>
                      <p className='mt-1 text-sm font-medium'>Visible {formatNumber(selectedMachine.visibleTotal)} / Session {formatNumber(selectedMachine.sessionTotal)}</p>
                    </div>
                    <Cpu className='h-4 w-4 text-muted-foreground' />
                  </div>
                </div>

                <div className='rounded-2xl border border-border/70 bg-muted/15 px-4 py-3'>
                  <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Latest status</p>
                  <p className='mt-2 text-sm text-slate-700 dark:text-slate-200'>{selectedMachine.latestError || selectedMachine.latestMessage || 'No runtime message yet.'}</p>
                </div>

                <div className='space-y-2'>
                  <div className='flex items-center justify-between gap-3'>
                    <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Recent events</p>
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => {
                        setMachineFilter(selectedMachine.machineCode);
                        setEventTypeFilter('');
                      }}
                    >
                      Show in viewer
                    </Button>
                  </div>
                  {selectedMachineEvents.data?.rows?.length ? (
                    <div className='space-y-2'>
                      {selectedMachineEvents.data.rows.map((event) => (
                        <div key={event.id} className='rounded-2xl border border-border/70 bg-white/70 px-3 py-3 dark:bg-slate-950/40'>
                          <div className='flex items-start justify-between gap-3'>
                            <p className='text-sm font-semibold'>{event.eventType}</p>
                            <p className='text-xs text-muted-foreground'>{formatDateTime(event.occurredAt)}</p>
                          </div>
                          <p className='mt-2 text-xs text-muted-foreground'>{summarizeEventPayload(event.payload)}</p>
                        </div>
                      ))}
                    </div>
                  ) : selectedMachineEvents.isLoading ? (
                    <p className='text-sm text-muted-foreground'>Loading recent events...</p>
                  ) : (
                    <p className='text-sm text-muted-foreground'>No recent events for this machine.</p>
                  )}
                </div>
              </>
            ) : (
              <p className='text-sm text-muted-foreground'>Select a machine to inspect its runtime health and recent events.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Machine Events Viewer</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-3 md:grid-cols-3'>
            <div>
              <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Machine Code</label>
              <Input value={machineFilter} onChange={(e) => setMachineFilter(e.target.value)} placeholder='e.g. pill-counter-pi' />
            </div>
            <div>
              <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Event Type</label>
              <Input value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)} placeholder='machine.error' />
            </div>
            <div className='flex items-end'>
              <Button
                variant='secondary'
                className='w-full'
                onClick={() => {
                  setMachineFilter('');
                  setEventTypeFilter('');
                }}
              >
                Clear filters
              </Button>
            </div>
          </div>

          <div className='flex flex-wrap gap-2'>
            {QUICK_EVENT_FILTERS.map((eventType) => (
              <Button
                key={eventType}
                size='sm'
                variant={eventTypeFilter === eventType ? 'default' : 'secondary'}
                onClick={() => setEventTypeFilter((current) => (current === eventType ? '' : eventType))}
              >
                {eventType}
              </Button>
            ))}
          </div>

          {events.data ? (
            <DataTable columns={eventColumns} data={events.data.rows} searchPlaceholder='Search event payload...' emptyText='No events match current filters.' />
          ) : events.isLoading ? (
            <p className='text-sm text-muted-foreground'>Loading machine events...</p>
          ) : (
            <p className='text-sm text-red-600'>Failed to load machine events.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
