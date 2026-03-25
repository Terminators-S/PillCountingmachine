'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, ExternalLink, PackageSearch, Radio, RefreshCcw, Siren, WifiOff } from 'lucide-react';
import { PageHeader } from '../../../components/page-header';
import { StatCard } from '../../../components/stat-card';
import { Badge } from '../../../components/ui/badge';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { apiRequest } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { cn } from '../../../lib/utils';
import { EventListResponse, Lot, Machine, MachineEventRow, MachineRuntimeStateSummary } from '../../../types/api';

type AlertSeverity = 'critical' | 'warning' | 'info';

type AlertRow = {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  machineCode?: string;
  occurredAt?: string | null;
  actionHref?: string;
  actionLabel?: string;
};

function severityVariant(severity: AlertSeverity) {
  if (severity === 'critical') return 'danger';
  if (severity === 'warning') return 'warning';
  return 'default';
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const machines = useQuery({
    queryKey: ['machines', 'notifications'],
    queryFn: () => apiRequest<Machine[]>('/machines'),
    refetchInterval: 10_000
  });

  const runtimeList = useQuery({
    queryKey: ['machine-runtime', 'list', 'notifications'],
    queryFn: () => apiRequest<MachineRuntimeStateSummary[]>('/machine-runtime'),
    refetchInterval: 2_000
  });

  const errorEvents = useQuery({
    queryKey: ['machine-events', 'notifications', 'machine.error'],
    queryFn: () => apiRequest<EventListResponse>('/machine-events?page=1&pageSize=20&eventType=machine.error'),
    refetchInterval: 10_000
  });

  const expiringLots = useQuery({
    queryKey: ['lots', 'notifications', 'expiring'],
    queryFn: () => apiRequest<Lot[]>('/lots?expiringDays=30'),
    refetchInterval: 60_000
  });

  const alerts = useMemo<AlertRow[]>(() => {
    const rows: AlertRow[] = [];
    const runtimeByCode = new Map((runtimeList.data || []).map((entry) => [entry.machineCode, entry]));

    for (const machine of machines.data || []) {
      const displayStatus = machine.displayStatus || machine.status;
      const runtime = runtimeByCode.get(machine.machineCode);

      if (displayStatus === 'OFFLINE') {
        rows.push({
          id: `offline:${machine.machineCode}`,
          severity: 'critical',
          title: `${machine.machineCode} is offline`,
          message: `No fresh heartbeat has been recorded${machine.lastSeen ? ` since ${formatDateTime(machine.lastSeen)}` : ''}.`,
          machineCode: machine.machineCode,
          occurredAt: machine.lastSeen || null,
          actionHref: '/machines',
          actionLabel: 'Open fleet'
        });
      }

      if (runtime?.controlState === 'ERROR' || runtime?.latestError) {
        rows.push({
          id: `runtime-error:${machine.machineCode}`,
          severity: 'critical',
          title: `${machine.machineCode} runtime error`,
          message: runtime.latestError || runtime.latestMessage || 'Machine runtime reported an error state.',
          machineCode: machine.machineCode,
          occurredAt: runtime.lastHeartbeatAt || runtime.lastTelemetryAt || runtime.endedAt || null,
          actionHref: '/live',
          actionLabel: 'Open live view'
        });
      } else if (runtime?.controlState === 'STARTING' && !runtime.lastTelemetryAt) {
        rows.push({
          id: `runtime-starting:${machine.machineCode}`,
          severity: 'warning',
          title: `${machine.machineCode} is starting`,
          message: 'The Pi accepted a start command, but the first telemetry frame has not arrived yet.',
          machineCode: machine.machineCode,
          occurredAt: runtime.startedAt || runtime.lastHeartbeatAt || null,
          actionHref: '/live',
          actionLabel: 'Check live view'
        });
      }
    }

    for (const lot of expiringLots.data || []) {
      rows.push({
        id: `expiry:${lot.id}`,
        severity: 'warning',
        title: `Lot ${lot.lotNumber} expires soon`,
        message: `${lot.pillType?.name || lot.pillType?.code || 'Medication lot'} expires on ${formatDateTime(lot.expiryDate)} at ${lot.location}.`,
        occurredAt: lot.expiryDate,
        actionHref: '/lots-expiry',
        actionLabel: 'Open lots'
      });
    }

    for (const event of errorEvents.data?.rows || []) {
      rows.push({
        id: `event:${event.id}`,
        severity: 'info',
        title: `${event.machine.machineCode} reported ${event.eventType}`,
        message: JSON.stringify(event.payload || {}),
        machineCode: event.machine.machineCode,
        occurredAt: event.occurredAt,
        actionHref: '/machines',
        actionLabel: 'View machine events'
      });
    }

    return rows.sort((left, right) => new Date(right.occurredAt || 0).getTime() - new Date(left.occurredAt || 0).getTime());
  }, [errorEvents.data?.rows, expiringLots.data, machines.data, runtimeList.data]);

  const stats = useMemo(() => {
    const critical = alerts.filter((entry) => entry.severity === 'critical').length;
    const warning = alerts.filter((entry) => entry.severity === 'warning').length;
    const info = alerts.filter((entry) => entry.severity === 'info').length;
    return { critical, warning, info, total: alerts.length };
  }, [alerts]);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['machines', 'notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['machine-runtime', 'list', 'notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['machine-events', 'notifications', 'machine.error'] }),
      queryClient.invalidateQueries({ queryKey: ['lots', 'notifications', 'expiring'] })
    ]);
  };

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Notifications'
        description='Watch the IoT system for offline devices, runtime errors, and inventory risks.'
        actions={
          <Button onClick={() => refreshAll()}>
            <RefreshCcw className='mr-2 h-4 w-4' />
            Refresh alerts
          </Button>
        }
      />

      <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <StatCard label='Total Alerts' value={stats.total} hint='Current attention queue' icon={<Bell className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Critical' value={stats.critical} hint='Offline or runtime error' icon={<Siren className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Warnings' value={stats.warning} hint='Startup delays and expiry risk' icon={<AlertTriangle className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Info' value={stats.info} hint='Recent error event feed' icon={<Radio className='h-4 w-4 text-muted-foreground' />} />
      </section>

      <section className='grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_380px]'>
        <Card>
          <CardHeader>
            <CardTitle>Alert Queue</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {alerts.length ? (
              alerts.map((alert) => (
                <div key={alert.id} className='rounded-2xl border border-border/70 bg-white/75 px-4 py-4 dark:bg-slate-950/40'>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='space-y-2'>
                      <div className='flex flex-wrap gap-2'>
                        <Badge variant={severityVariant(alert.severity)}>{alert.severity.toUpperCase()}</Badge>
                        {alert.machineCode ? <Badge variant='default'>{alert.machineCode}</Badge> : null}
                      </div>
                      <div>
                        <p className='text-sm font-semibold text-slate-950 dark:text-white'>{alert.title}</p>
                        <p className='mt-1 text-sm text-muted-foreground'>{alert.message}</p>
                      </div>
                    </div>
                    <div className='flex flex-col items-end gap-2'>
                      <p className='text-xs text-muted-foreground'>{alert.occurredAt ? formatDateTime(alert.occurredAt) : 'Now'}</p>
                      {alert.actionHref && alert.actionLabel ? (
                        <Link href={alert.actionHref} className={cn(buttonVariants({ size: 'sm', variant: 'secondary' }))}>
                          <ExternalLink className='mr-2 h-4 w-4' />
                          {alert.actionLabel}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            ) : machines.isLoading || runtimeList.isLoading || errorEvents.isLoading || expiringLots.isLoading ? (
              <p className='text-sm text-muted-foreground'>Collecting notifications...</p>
            ) : (
              <div className='rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900'>
                No active alerts right now. The IoT fleet looks stable.
              </div>
            )}
          </CardContent>
        </Card>

        <div className='grid gap-4'>
          <Card>
            <CardHeader>
              <CardTitle>Alert Sources</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='rounded-2xl border border-border/70 bg-muted/15 px-4 py-3'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Offline machines</p>
                    <p className='mt-1 text-sm text-slate-700 dark:text-slate-200'>Uses the fleet heartbeat window from the machines service.</p>
                  </div>
                  <WifiOff className='h-4 w-4 text-muted-foreground' />
                </div>
              </div>
              <div className='rounded-2xl border border-border/70 bg-muted/15 px-4 py-3'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Runtime failures</p>
                    <p className='mt-1 text-sm text-slate-700 dark:text-slate-200'>Reads the live machine runtime state and latest Pi error.</p>
                  </div>
                  <Siren className='h-4 w-4 text-muted-foreground' />
                </div>
              </div>
              <div className='rounded-2xl border border-border/70 bg-muted/15 px-4 py-3'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Lot expiry</p>
                    <p className='mt-1 text-sm text-slate-700 dark:text-slate-200'>Flags inventory lots expiring within 30 days.</p>
                  </div>
                  <PackageSearch className='h-4 w-4 text-muted-foreground' />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Machine Errors</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              {(errorEvents.data?.rows || []).length ? (
                (errorEvents.data?.rows || []).slice(0, 6).map((event: MachineEventRow) => (
                  <div key={event.id} className='rounded-2xl border border-border/70 bg-white/75 px-3 py-3 dark:bg-slate-950/40'>
                    <div className='flex items-start justify-between gap-3'>
                      <div>
                        <p className='text-sm font-semibold'>{event.machine.machineCode}</p>
                        <p className='text-xs text-muted-foreground'>{event.eventType}</p>
                      </div>
                      <p className='text-xs text-muted-foreground'>{formatDateTime(event.occurredAt)}</p>
                    </div>
                    <p className='mt-2 text-xs text-muted-foreground'>{JSON.stringify(event.payload || {})}</p>
                  </div>
                ))
              ) : (
                <p className='text-sm text-muted-foreground'>No recent machine.error events.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
