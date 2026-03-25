'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Activity, AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Radio, RefreshCcw, Server } from 'lucide-react';
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
import { EventListResponse, Machine, MachineRuntimeStateSummary, MachineStatus } from '../../../types/api';

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function truncateText(value: string, maxLength = 140) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function summarizeEventPayload(payload?: Record<string, unknown>) {
  if (!payload || !Object.keys(payload).length) return 'No payload details.';

  const details = asRecord(payload.details);
  const nestedMessage = details && typeof details.message === 'string' ? details.message : null;

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return truncateText(payload.message);
  }

  if (nestedMessage?.trim()) {
    return truncateText(nestedMessage);
  }

  if (typeof payload.statusText === 'string' && payload.statusText.trim()) {
    return truncateText(payload.statusText);
  }

  if (typeof payload.displayName === 'string' || typeof payload.location === 'string' || typeof payload.firmwareVersion === 'string') {
    const fragments = [
      typeof payload.displayName === 'string' ? payload.displayName : null,
      typeof payload.location === 'string' ? payload.location : null,
      typeof payload.firmwareVersion === 'string' ? `Firmware ${payload.firmwareVersion}` : null
    ].filter(Boolean);

    if (fragments.length) return fragments.join(' • ');
  }

  const serialized = JSON.stringify(payload);
  return serialized.length > 140 ? `${serialized.slice(0, 137)}...` : serialized;
}

export default function MachinesPage() {
  const queryClient = useQueryClient();
  const [machineFilter, setMachineFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [bulkFeedback, setBulkFeedback] = useState('');
  const [isEventLogExpanded, setIsEventLogExpanded] = useState(false);

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
            <p className='font-semibold text-slate-950 dark:text-white'>{row.original.machineCode}</p>
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

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Machines Fleet'
        description='A simpler view of device health, runtime state, and recent machine activity.'
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
                      setMachineFilter(row.machineCode);
                      setEventTypeFilter('');
                      setIsEventLogExpanded(true);
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
        <CardHeader className='flex-row items-center justify-between space-y-0'>
          <div className='space-y-1'>
            <CardTitle>Event Log</CardTitle>
            <p className='text-sm text-muted-foreground'>Collapse the full log until you need to inspect machine details.</p>
          </div>
          <Button size='sm' variant='secondary' onClick={() => setIsEventLogExpanded((current) => !current)}>
            {isEventLogExpanded ? (
              <>
                <ChevronUp className='mr-2 h-4 w-4' />
                Hide log
              </>
            ) : (
              <>
                <ChevronDown className='mr-2 h-4 w-4' />
                Show log
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent className='space-y-4'>
          {!isEventLogExpanded ? (
            <div className='flex flex-col gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-4 md:flex-row md:items-center md:justify-between'>
              <div className='space-y-1'>
                <p className='text-sm font-medium text-slate-900 dark:text-slate-100'>Event log hidden</p>
                <p className='text-sm text-muted-foreground'>
                  {events.data ? `${formatNumber(events.data.rows.length)} event(s) loaded` : 'Open the log to inspect machine activity.'}
                  {machineFilter ? ` • Machine ${machineFilter}` : ''}
                  {eventTypeFilter ? ` • Type ${eventTypeFilter}` : ''}
                </p>
              </div>
              <Button size='sm' variant='ghost' onClick={() => setIsEventLogExpanded(true)}>
                Expand details
              </Button>
            </div>
          ) : (
            <>
              <div className='grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]'>
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

              {events.data ? (
                events.data.rows.length ? (
                  <div className='overflow-hidden rounded-2xl border border-border/70 bg-white/75 dark:bg-slate-950/40'>
                    {events.data.rows.map((event) => (
                      <div key={event.id} className='border-b border-border/60 px-4 py-4 last:border-b-0'>
                        <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                          <div className='min-w-0 space-y-2'>
                            <div className='flex flex-wrap items-center gap-2'>
                              <span className='text-sm font-semibold text-slate-950 dark:text-white'>{event.machine.machineCode}</span>
                              <Badge variant={machineStatusVariant(event.eventType.includes('error') ? 'ERROR' : event.eventType.includes('heartbeat') ? 'ONLINE' : 'MAINTENANCE')}>
                                {event.eventType}
                              </Badge>
                            </div>
                            <p className='text-sm text-slate-700 dark:text-slate-200'>{summarizeEventPayload(event.payload)}</p>
                            {event.sourceIp ? <p className='text-xs text-muted-foreground'>Source {event.sourceIp}</p> : null}
                            <details className='text-xs text-muted-foreground'>
                              <summary className='cursor-pointer list-none font-medium hover:text-foreground'>Raw payload</summary>
                              <pre className='mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-[11px] leading-5'>
                                {JSON.stringify(event.payload || {}, null, 2)}
                              </pre>
                            </details>
                          </div>
                          <p className='shrink-0 text-xs text-muted-foreground'>{formatDateTime(event.occurredAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className='rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground'>
                    No events match the current filters.
                  </p>
                )
              ) : events.isLoading ? (
                <p className='text-sm text-muted-foreground'>Loading machine events...</p>
              ) : (
                <p className='text-sm text-red-600'>Failed to load machine events.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
