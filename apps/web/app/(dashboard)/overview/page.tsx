'use client';

import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Activity, ClipboardCheck, Package2, Truck } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
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
    <div className='space-y-6'>
      <PageHeader
        title='Overview Dashboard'
        description='Operational snapshot across fleet, counting jobs, and inventory activity.'
        actions={
          <>
            <Button variant='secondary' onClick={() => jobs.refetch()}>
              Refresh now
            </Button>
            <Button onClick={() => downloadFromApi('/reports/export/records.csv', 'records.csv')}>Export records CSV</Button>
          </>
        }
      />

      <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <StatCard label='Machines Online' value={formatNumber(stats?.machinesOnline || 0)} hint={`${formatNumber(stats?.machinesTotal || 0)} total`} icon={<Truck className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Jobs Completed' value={formatNumber(stats?.jobsCompleted || 0)} hint={`${formatNumber(stats?.jobsTotal || 0)} total jobs`} icon={<ClipboardCheck className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Pill Types' value={formatNumber(stats?.pillsTotal || 0)} hint='Configured product catalog' icon={<Package2 className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Inventory Movements' value={formatNumber(stats?.inventoryMovements || 0)} hint='Ledger rows (append-only)' icon={<Activity className='h-4 w-4 text-muted-foreground' />} />
      </section>

      <section className='grid gap-6 xl:grid-cols-3'>
        <Card className='xl:col-span-2'>
          <CardHeader>
            <CardTitle>Latest Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.isLoading ? <div className='text-sm text-muted-foreground'>Loading jobs...</div> : null}
            {jobs.error ? <div className='text-sm text-red-600'>Failed to load jobs.</div> : null}
            {jobs.data ? <DataTable columns={jobColumns} data={jobs.data.slice(0, 20)} searchPlaceholder='Search jobs...' /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Machine Events</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {events.isLoading ? <p className='text-sm text-muted-foreground'>Loading events...</p> : null}
            {events.error ? <p className='text-sm text-red-600'>Failed to load events.</p> : null}
            {events.data?.rows?.length ? (
              events.data.rows.slice(0, 8).map((event) => (
                <div key={event.id} className='rounded-lg border border-border/70 p-3 text-sm'>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='font-medium'>{event.eventType}</span>
                    <span className='text-xs text-muted-foreground'>{formatDateTime(event.occurredAt)}</span>
                  </div>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {event.machine.machineCode} • {event.machine.location}
                  </p>
                </div>
              ))
            ) : (
              <p className='text-sm text-muted-foreground'>No events available.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Machine Fleet Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          {machines.isLoading ? <div className='text-sm text-muted-foreground'>Loading machines...</div> : null}
          {machines.error ? <div className='text-sm text-red-600'>Failed to load machines.</div> : null}
          {machines.data ? <DataTable columns={machineColumns} data={machines.data} searchPlaceholder='Search machine or location...' /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
