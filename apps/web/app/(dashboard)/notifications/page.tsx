'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, ExternalLink, Radio, RefreshCcw, Siren } from 'lucide-react';
import { PageHeader } from '../../../components/page-header';
import { StatCard } from '../../../components/stat-card';
import { Badge } from '../../../components/ui/badge';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { apiRequest } from '../../../lib/api';
import { formatDateTime, formatNumber } from '../../../lib/format';
import { cn } from '../../../lib/utils';
import { EventListResponse, Lot, Machine, MachineRuntimeStateSummary } from '../../../types/api';

type AlertSeverity = 'critical' | 'warning' | 'info';
type AlertKind = 'offline' | 'runtime' | 'starting' | 'expiry' | 'event';

type AlertRow = {
  id: string;
  kind: AlertKind;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function shorten(value: string, maxLength = 120) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function summarizeEventPayload(payload?: Record<string, unknown>) {
  if (!payload) return 'Machine reported a recent event.';

  const details = asRecord(payload.details);
  const message =
    (typeof payload.message === 'string' && payload.message) ||
    (typeof payload.statusText === 'string' && payload.statusText) ||
    (details && typeof details.message === 'string' ? details.message : '');

  return message ? shorten(message) : 'Machine reported a recent event.';
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
          kind: 'offline',
          severity: 'critical',
          title: `${machine.machineCode} offline`,
          message: machine.lastSeen ? `Last heartbeat ${formatDateTime(machine.lastSeen)}.` : 'No heartbeat received from this machine.',
          machineCode: machine.machineCode,
          occurredAt: machine.lastSeen || null,
          actionHref: '/machines',
          actionLabel: 'Open fleet'
        });
      }

      if (runtime?.controlState === 'ERROR' || runtime?.latestError) {
        rows.push({
          id: `runtime:${machine.machineCode}`,
          kind: 'runtime',
          severity: 'critical',
          title: `${machine.machineCode} runtime error`,
          message: shorten(runtime.latestError || runtime.latestMessage || 'The Pi runtime reported an error state.'),
          machineCode: machine.machineCode,
          occurredAt: runtime.lastHeartbeatAt || runtime.lastTelemetryAt || runtime.endedAt || null,
          actionHref: '/live',
          actionLabel: 'Open live'
        });
      } else if (runtime?.controlState === 'STARTING' && !runtime.lastTelemetryAt) {
        rows.push({
          id: `starting:${machine.machineCode}`,
          kind: 'starting',
          severity: 'warning',
          title: `${machine.machineCode} starting`,
          message: 'Waiting for the first frame from the Pi.',
          machineCode: machine.machineCode,
          occurredAt: runtime.startedAt || runtime.lastHeartbeatAt || null,
          actionHref: '/live',
          actionLabel: 'Check live'
        });
      }
    }

    for (const lot of expiringLots.data || []) {
      rows.push({
        id: `expiry:${lot.id}`,
        kind: 'expiry',
        severity: 'warning',
        title: `Lot ${lot.lotNumber} expiring`,
        message: `${lot.pillType?.code || lot.pillType?.name || 'Medication'} • ${lot.location} • ${formatDateTime(lot.expiryDate)}`,
        occurredAt: lot.expiryDate,
        actionHref: '/jobs',
        actionLabel: 'Open stock'
      });
    }

    for (const event of errorEvents.data?.rows || []) {
      rows.push({
        id: `event:${event.id}`,
        kind: 'event',
        severity: 'info',
        title: `${event.machine.machineCode} machine.error`,
        message: summarizeEventPayload(event.payload),
        machineCode: event.machine.machineCode,
        occurredAt: event.occurredAt,
        actionHref: '/machines',
        actionLabel: 'Open fleet'
      });
    }

    return rows.sort((left, right) => new Date(right.occurredAt || 0).getTime() - new Date(left.occurredAt || 0).getTime());
  }, [errorEvents.data?.rows, expiringLots.data, machines.data, runtimeList.data]);

  const stats = useMemo(() => {
    const critical = alerts.filter((entry) => entry.severity === 'critical').length;
    const warning = alerts.filter((entry) => entry.severity === 'warning').length;
    const info = alerts.filter((entry) => entry.severity === 'info').length;
    return { total: alerts.length, critical, warning, info };
  }, [alerts]);

  const queueAlerts = useMemo(() => {
    const critical = alerts.filter((entry) => entry.severity === 'critical');
    const warning = alerts.filter((entry) => entry.severity === 'warning');
    const info = alerts.filter((entry) => entry.severity === 'info').slice(0, 3);
    return [...critical, ...warning, ...info];
  }, [alerts]);

  const hiddenAlertCount = Math.max(0, alerts.length - queueAlerts.length);

  const overview = useMemo(() => {
    const topAlert = queueAlerts[0] || null;
    const machineSummary =
      stats.critical > 0
        ? `${stats.critical} critical issue${stats.critical === 1 ? '' : 's'} need attention.`
        : stats.warning > 0
          ? `${stats.warning} warning${stats.warning === 1 ? '' : 's'} should be checked.`
          : 'No urgent issue right now.';

    return {
      now: machineSummary,
      focus: topAlert ? topAlert.title : 'System stable',
      detail: topAlert ? topAlert.message : 'Machines, runtime, and stock alerts are quiet.'
    };
  }, [queueAlerts, stats.critical, stats.warning]);

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
        description='A short view of what needs attention right now.'
        actions={
          <Button onClick={() => refreshAll()}>
            <RefreshCcw className='mr-2 h-4 w-4' />
            Refresh
          </Button>
        }
      />

      <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <StatCard label='Alerts' value={stats.total} hint='Items in queue' icon={<Bell className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Critical' value={stats.critical} hint='Offline or crashed' icon={<Siren className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Warnings' value={stats.warning} hint='Starting or expiring' icon={<AlertTriangle className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Info' value={stats.info} hint='Recent machine logs' icon={<Radio className='h-4 w-4 text-muted-foreground' />} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>What Is Going On</CardTitle>
        </CardHeader>
        <CardContent className='grid gap-3 md:grid-cols-3'>
          <div className='rounded-2xl border border-border/70 bg-muted/10 px-4 py-4'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Now</p>
            <p className='mt-2 text-sm font-semibold text-slate-950 dark:text-white'>{overview.now}</p>
          </div>
          <div className='rounded-2xl border border-border/70 bg-muted/10 px-4 py-4'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Main issue</p>
            <p className='mt-2 text-sm font-semibold text-slate-950 dark:text-white'>{overview.focus}</p>
          </div>
          <div className='rounded-2xl border border-border/70 bg-muted/10 px-4 py-4'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Detail</p>
            <p className='mt-2 text-sm text-slate-700 dark:text-slate-200'>{overview.detail}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alert Queue</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {alerts.length ? (
            <>
              {queueAlerts.map((alert) => (
                <div key={alert.id} className='rounded-2xl border border-border/70 bg-white/75 px-4 py-4 dark:bg-slate-950/40'>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='space-y-2'>
                      <div className='flex flex-wrap gap-2'>
                        <Badge variant={severityVariant(alert.severity)}>{alert.severity.toUpperCase()}</Badge>
                        {alert.machineCode ? <Badge variant='default'>{alert.machineCode}</Badge> : null}
                      </div>
                      <div className='space-y-1'>
                        <p className='text-sm font-semibold text-slate-950 dark:text-white'>{alert.title}</p>
                        <p className='text-sm text-muted-foreground'>{alert.message}</p>
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
              ))}

              {hiddenAlertCount ? (
                <p className='text-sm text-muted-foreground'>Older info logs hidden: {formatNumber(hiddenAlertCount)}.</p>
              ) : null}
            </>
          ) : machines.isLoading || runtimeList.isLoading || errorEvents.isLoading || expiringLots.isLoading ? (
            <p className='text-sm text-muted-foreground'>Collecting notifications...</p>
          ) : (
            <div className='rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900'>
              No active alerts right now. The IoT fleet looks stable.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
