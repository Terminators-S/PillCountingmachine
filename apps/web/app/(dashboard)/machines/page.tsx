'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { PageHeader } from '../../../components/page-header';
import { DataTable } from '../../../components/data-table';
import { apiRequest } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { EventListResponse, Machine, MachineEventRow } from '../../../types/api';

const machineColumns: ColumnDef<Machine>[] = [
  { accessorKey: 'machineCode', header: 'Machine', cell: ({ row }) => <span className='font-medium'>{row.original.machineCode}</span> },
  { accessorKey: 'displayName', header: 'Display Name', cell: ({ row }) => row.original.displayName || '-' },
  { accessorKey: 'location', header: 'Location' },
  { accessorKey: 'firmwareVersion', header: 'Firmware' },
  {
    accessorKey: 'displayStatus',
    header: 'Status',
    cell: ({ row }) => {
      const state = row.original.displayStatus || row.original.status;
      const variant = state === 'ONLINE' ? 'success' : state === 'OFFLINE' ? 'danger' : 'warning';
      return <Badge variant={variant}>{state}</Badge>;
    }
  },
  { accessorKey: 'lastSeen', header: 'Last Seen', cell: ({ row }) => formatDateTime(row.original.lastSeen) }
];

const eventColumns: ColumnDef<MachineEventRow>[] = [
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
];

export default function MachinesPage() {
  const [machineFilter, setMachineFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');

  const machines = useQuery({
    queryKey: ['machines', 'fleet'],
    queryFn: () => apiRequest<Machine[]>('/machines')
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

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Machines Fleet'
        description='Monitor machine health, heartbeat recency, firmware footprint, and operational events.'
        actions={<Button onClick={() => machines.refetch()}>Refresh Fleet</Button>}
      />

      <Card>
        <CardHeader>
          <CardTitle>Fleet Status</CardTitle>
        </CardHeader>
        <CardContent>
          {machines.data ? (
            <DataTable
              columns={machineColumns}
              data={machines.data}
              enableRowSelection
              bulkActionLabel='Mark selected for maintenance'
              onBulkAction={(rows) => {
                window.alert(`Selected ${rows.length} machine(s). Integrate with maintenance scheduler in next phase.`);
              }}
              renderRowActions={(row) => (
                <Button size='sm' variant='ghost' onClick={() => setMachineFilter(row.machineCode)}>
                  View events
                </Button>
              )}
              searchPlaceholder='Search machine code, location, firmware...'
            />
          ) : machines.isLoading ? (
            <p className='text-sm text-muted-foreground'>Loading machine fleet...</p>
          ) : (
            <p className='text-sm text-red-600'>Failed to load machine fleet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Machine Events Viewer</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='grid gap-3 md:grid-cols-3'>
            <div>
              <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Machine Code</label>
              <Input value={machineFilter} onChange={(e) => setMachineFilter(e.target.value)} placeholder='e.g. MC-01' />
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
