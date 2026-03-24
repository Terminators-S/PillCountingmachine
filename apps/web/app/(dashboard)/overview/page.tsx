'use client';

import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Activity, ClipboardCheck, Package2, Truck } from 'lucide-react';
import { SectionHeader, CompactEmptyState } from '../../../components/dashboard-section';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { PageHeader } from '../../../components/page-header';
import { StatCard } from '../../../components/stat-card';
import { DataTable } from '../../../components/data-table';
import { apiRequest, downloadFromApi } from '../../../lib/api';
import { formatDateTime, formatNumber } from '../../../lib/format';
import { CountingJob, EventListResponse, Machine, ReportsOverview } from '../../../types/api';
import { Badge } from '../../../components/ui/badge';

const jobColumns: ColumnDef<CountingJob>[] = [
  { accessorKey: 'jobNumber', header: 'Job #', cell: ({ row }) => <span className='font-medium'>{row.original.jobNumber}</span> },
  { accessorKey: 'machine.machineCode', header: 'Machine', cell: ({ row }) => row.original.machine?.machineCode || 'N/A' },
  { accessorKey: 'pillType.code', header: 'Pill', cell: ({ row }) => `${row.original.pillType?.code || 'N/A'} - ${row.original.pillType?.name || ''}` },
  { accessorKey: 'targetQty', header: 'Target', cell: ({ row }) => formatNumber(row.original.targetQty) },
  { accessorKey: 'actualQty', header: 'Actual', cell: ({ row }) => formatNumber(row.original.actualQty || 0) },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.original.status;
      const variant = status === 'COMPLETED' ? 'success' : status === 'NEEDS_RECOUNT' ? 'warning' : status === 'CANCELLED' ? 'danger' : 'default';
      return <Badge variant={variant}>{status}</Badge>;
    }
  },
  { accessorKey: 'createdAt', header: 'Created', cell: ({ row }) => formatDateTime(row.original.createdAt) }
];

const machineColumns: ColumnDef<Machine>[] = [
  { accessorKey: 'machineCode', header: 'Machine', cell: ({ row }) => <span className='font-medium'>{row.original.machineCode}</span> },
  { accessorKey: 'location', header: 'Location' },
  { accessorKey: 'firmwareVersion', header: 'Firmware' },
  {
    accessorKey: 'displayStatus',
    header: 'State',
    cell: ({ row }) => {
      const state = row.original.displayStatus || row.original.status;
      const variant = state === 'ONLINE' ? 'success' : state === 'OFFLINE' ? 'danger' : 'warning';
      return <Badge variant={variant}>{state}</Badge>;
    }
  },
  { accessorKey: 'lastSeen', header: 'Last Seen', cell: ({ row }) => formatDateTime(row.original.lastSeen) }
];

export default function OverviewPage() {
  const overview = useQuery({
    queryKey: ['reports', 'overview'],
    queryFn: () => apiRequest<ReportsOverview>('/reports/overview')
  });
  const jobs = useQuery({
    queryKey: ['jobs', 'overview'],
    queryFn: () => apiRequest<CountingJob[]>('/jobs')
  });
  const machines = useQuery({
    queryKey: ['machines', 'overview'],
    queryFn: () => apiRequest<Machine[]>('/machines')
  });
  const events = useQuery({
    queryKey: ['events', 'overview'],
    queryFn: () => apiRequest<EventListResponse>('/machine-events?page=1&pageSize=10')
  });

  const stats = overview.data;

  return (
    <div className='space-y-4'>
      <PageHeader
        title='Overview'
        description='Fleet, jobs, and inventory status in one compact operator view.'
        actions={
          <>
            <Button variant='secondary' onClick={() => Promise.all([overview.refetch(), jobs.refetch(), machines.refetch(), events.refetch()])}>
              Refresh
            </Button>
            <Button onClick={() => downloadFromApi('/reports/export/records.csv', 'records.csv')}>Export CSV</Button>
          </>
        }
      />

      <section className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
        <StatCard label='Machines Online' value={formatNumber(stats?.machinesOnline || 0)} hint={`${formatNumber(stats?.machinesTotal || 0)} total`} icon={<Truck className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Jobs Completed' value={formatNumber(stats?.jobsCompleted || 0)} hint={`${formatNumber(stats?.jobsTotal || 0)} total`} icon={<ClipboardCheck className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Pill Types' value={formatNumber(stats?.pillsTotal || 0)} hint='Catalog entries' icon={<Package2 className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Inventory Moves' value={formatNumber(stats?.inventoryMovements || 0)} hint='Ledger activity' icon={<Activity className='h-4 w-4 text-muted-foreground' />} />
      </section>

      <section className='grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_320px]'>
        <Card>
          <CardHeader>
            <SectionHeader title='Latest jobs' description='Operational work queue and recent runs.' />
          </CardHeader>
          <CardContent>
            {jobs.isLoading ? <p className='text-sm text-muted-foreground'>Loading jobs...</p> : null}
            {jobs.error ? <p className='text-sm text-red-600'>Failed to load jobs.</p> : null}
            {jobs.data ? (
              <DataTable columns={jobColumns} data={jobs.data.slice(0, 12)} searchPlaceholder='Search jobs...' emptyText='No jobs available yet.' />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeader title='Recent machine events' description='Latest status changes and machine activity.' />
          </CardHeader>
          <CardContent className='space-y-2'>
            {events.isLoading ? <p className='text-sm text-muted-foreground'>Loading events...</p> : null}
            {events.error ? <p className='text-sm text-red-600'>Failed to load events.</p> : null}
            {events.data?.rows?.length ? (
              events.data.rows.slice(0, 8).map((event) => (
                <div key={event.id} className='surface-subtle rounded-2xl p-3'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <p className='text-sm font-semibold text-slate-900 dark:text-slate-50'>{event.eventType}</p>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {event.machine.machineCode} • {event.machine.location}
                      </p>
                    </div>
                    <span className='text-[11px] text-muted-foreground'>{formatDateTime(event.occurredAt)}</span>
                  </div>
                </div>
              ))
            ) : (
              <CompactEmptyState title='No recent machine events' message='New machine activity will appear here automatically.' />
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <SectionHeader title='Machine fleet snapshot' description='Availability and last-seen status without leaving the first screenful.' />
        </CardHeader>
        <CardContent>
          {machines.isLoading ? <p className='text-sm text-muted-foreground'>Loading machines...</p> : null}
          {machines.error ? <p className='text-sm text-red-600'>Failed to load machines.</p> : null}
          {machines.data ? (
            <DataTable columns={machineColumns} data={machines.data} searchPlaceholder='Search machine or location...' emptyText='No machines found.' />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
