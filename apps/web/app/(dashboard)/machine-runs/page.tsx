'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { DataTable } from '../../../components/data-table';
import { PageHeader } from '../../../components/page-header';
import { apiRequest } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { MachineRunListResponse, MachineRunRow } from '../../../types/api';

const runColumns: ColumnDef<MachineRunRow>[] = [
  { accessorKey: 'completedAt', header: 'Completed', cell: ({ row }) => formatDateTime(row.original.completedAt) },
  { accessorKey: 'machineName', header: 'Machine', cell: ({ row }) => <span className='font-medium'>{row.original.machineName}</span> },
  { accessorKey: 'runId', header: 'Run ID', cell: ({ row }) => <span className='font-mono text-xs'>{row.original.runId}</span> },
  {
    accessorKey: 'runtimeStatus',
    header: 'Runtime',
    cell: ({ row }) => {
      const status = row.original.runtimeStatus;
      const variant = status === 'COMPLETED' ? 'success' : status === 'ERROR' ? 'danger' : 'warning';
      return <Badge variant={variant}>{status}</Badge>;
    }
  },
  {
    accessorKey: 'detectorBackend',
    header: 'Detector',
    cell: ({ row }) => {
      const runtimeBackend = row.original.mlRuntimeBackend ? ` / ${row.original.mlRuntimeBackend}` : '';
      return (
        <div className='text-sm'>
          <p className='font-medium'>{row.original.detectorBackend}{runtimeBackend}</p>
          <p className='text-xs text-muted-foreground'>{row.original.modelKey || row.original.modelFormat || '-'}</p>
        </div>
      );
    }
  },
  { accessorKey: 'totalCount', header: 'Count' },
  { accessorKey: 'eventCount', header: 'Events' },
  {
    accessorKey: 'runtimeFps',
    header: 'FPS',
    cell: ({ row }) => (row.original.runtimeFps ? row.original.runtimeFps.toFixed(2) : '-')
  },
  {
    accessorKey: 'sourceMode',
    header: 'Source',
    cell: ({ row }) => (
      <div className='text-sm'>
        <p>{row.original.sourceMode}</p>
        <p className='truncate text-xs text-muted-foreground'>{row.original.sourceLabel || '-'}</p>
      </div>
    )
  }
];

export default function MachineRunsPage() {
  const [query, setQuery] = useState('');
  const [runtimeStatus, setRuntimeStatus] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    if (query) params.set('query', query);
    if (runtimeStatus) params.set('runtimeStatus', runtimeStatus);
    return params.toString();
  }, [query, runtimeStatus]);

  const machineRuns = useQuery({
    queryKey: ['machine-runs', queryString],
    queryFn: () => apiRequest<MachineRunListResponse>(`/machine-runs?${queryString}`)
  });

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Machine Runs'
        description='Recent completed machine-runtime sessions synced from Raspberry Pi into the operations dashboard.'
        actions={<Button onClick={() => machineRuns.refetch()}>Refresh Runs</Button>}
      />

      <Card>
        <CardHeader>
          <CardTitle>Machine Run History</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='grid gap-3 md:grid-cols-3'>
            <div>
              <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Search</label>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Machine name, run id, or model key' />
            </div>
            <div>
              <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Runtime Status</label>
              <Input value={runtimeStatus} onChange={(e) => setRuntimeStatus(e.target.value)} placeholder='COMPLETED or ERROR' />
            </div>
            <div className='flex items-end'>
              <Button
                variant='secondary'
                className='w-full'
                onClick={() => {
                  setQuery('');
                  setRuntimeStatus('');
                }}
              >
                Clear filters
              </Button>
            </div>
          </div>

          {machineRuns.data ? (
            <DataTable
              columns={runColumns}
              data={machineRuns.data.rows}
              searchPlaceholder='Search synced machine runs...'
              emptyText='No synced machine runs available yet.'
            />
          ) : machineRuns.isLoading ? (
            <p className='text-sm text-muted-foreground'>Loading machine runs...</p>
          ) : (
            <p className='text-sm text-red-600'>Failed to load machine runs.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
