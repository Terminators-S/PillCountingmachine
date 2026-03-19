'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { ClipboardPlus, History } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { DataTable } from '../../../components/data-table';
import { PageHeader } from '../../../components/page-header';
import { WorkspaceTabs } from '../../../components/workspace-tabs';
import { apiRequest } from '../../../lib/api';
import { formatDateTime, formatNumber } from '../../../lib/format';
import { CountingJob, Machine, PillType } from '../../../types/api';
import { Badge } from '../../../components/ui/badge';

const jobColumns: ColumnDef<CountingJob>[] = [
  { accessorKey: 'jobNumber', header: 'Job #', cell: ({ row }) => <span className='font-medium'>{row.original.jobNumber}</span> },
  { accessorKey: 'machine.machineCode', header: 'Machine', cell: ({ row }) => row.original.machine.machineCode },
  { accessorKey: 'pillType.code', header: 'Pill', cell: ({ row }) => `${row.original.pillType.code} - ${row.original.pillType.name}` },
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
  { accessorKey: 'startedAt', header: 'Started', cell: ({ row }) => formatDateTime(row.original.startedAt) },
  { accessorKey: 'completedAt', header: 'Completed', cell: ({ row }) => formatDateTime(row.original.completedAt) }
];

export default function JobsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('history');
  const [form, setForm] = useState({
    machineId: '',
    pillTypeId: '',
    targetQty: '100',
    lotPreferenceId: '',
    operatorId: '',
    tolerancePct: '2',
    notes: ''
  });
  const [error, setError] = useState('');

  const jobs = useQuery({
    queryKey: ['jobs', 'list'],
    queryFn: () => apiRequest<CountingJob[]>('/jobs')
  });

  const machines = useQuery({
    queryKey: ['machines', 'jobs'],
    queryFn: () => apiRequest<Machine[]>('/machines')
  });

  const pillTypes = useQuery({
    queryKey: ['pill-types', 'jobs'],
    queryFn: () => apiRequest<PillType[]>('/pill-types')
  });

  const createJob = useMutation({
    mutationFn: async () => {
      setError('');
      return apiRequest('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          machineId: form.machineId,
          pillTypeId: form.pillTypeId,
          targetQty: Number(form.targetQty),
          lotPreferenceId: form.lotPreferenceId || undefined,
          operatorId: form.operatorId || undefined,
          tolerancePct: Number(form.tolerancePct),
          notes: form.notes || undefined
        })
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['jobs', 'list'] });
      setForm((prev) => ({ ...prev, targetQty: '100', notes: '' }));
    },
    onError: (err: any) => {
      setError(err?.message || 'Failed to create job');
    }
  });

  const jobAction = useMutation({
    mutationFn: async ({ path, payload }: { path: string; payload: Record<string, unknown> }) =>
      apiRequest(path, {
        method: 'POST',
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['jobs', 'list'] });
    }
  });

  return (
    <div className='space-y-6'>
      <PageHeader title='Jobs / Sessions' description='Create, run, complete, and recount counting sessions with machine traceability.' />

      <WorkspaceTabs
        value={activeTab}
        onValueChange={(key) => setActiveTab(key as 'create' | 'history')}
        items={[
          { key: 'history', label: 'Job Queue', icon: History, hint: 'Active and historical runs' },
          { key: 'create', label: 'Create Job', icon: ClipboardPlus, hint: 'Start a new counting session' }
        ]}
      />

      {activeTab === 'create' ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Counting Job</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='grid gap-3 md:grid-cols-3'>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Machine</label>
                <select className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm' value={form.machineId} onChange={(e) => setForm((prev) => ({ ...prev, machineId: e.target.value }))}>
                  <option value=''>Select machine</option>
                  {machines.data?.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machine.machineCode} - {machine.location}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Pill Type</label>
                <select className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm' value={form.pillTypeId} onChange={(e) => setForm((prev) => ({ ...prev, pillTypeId: e.target.value }))}>
                  <option value=''>Select pill type</option>
                  {pillTypes.data?.map((pill) => (
                    <option key={pill.id} value={pill.id}>
                      {pill.code} - {pill.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Target Qty</label>
                <Input type='number' value={form.targetQty} onChange={(e) => setForm((prev) => ({ ...prev, targetQty: e.target.value }))} />
              </div>
            </div>

            <div className='grid gap-3 md:grid-cols-4'>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Lot Preference ID</label>
                <Input value={form.lotPreferenceId} onChange={(e) => setForm((prev) => ({ ...prev, lotPreferenceId: e.target.value }))} placeholder='Optional lot UUID' />
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Operator ID</label>
                <Input value={form.operatorId} onChange={(e) => setForm((prev) => ({ ...prev, operatorId: e.target.value }))} placeholder='Optional user UUID' />
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Tolerance %</label>
                <Input type='number' value={form.tolerancePct} onChange={(e) => setForm((prev) => ({ ...prev, tolerancePct: e.target.value }))} />
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Notes</label>
                <Input value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder='Optional notes' />
              </div>
            </div>

            {error ? <p className='text-sm text-red-600'>{error}</p> : null}
            <Button onClick={() => createJob.mutate()} disabled={createJob.isPending}>
              {createJob.isPending ? 'Creating job...' : 'Create job'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'history' ? (
        <Card>
          <CardHeader>
            <CardTitle>Active and Historical Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.data ? (
              <DataTable
                columns={jobColumns}
                data={jobs.data}
                enableRowSelection
                searchPlaceholder='Search by job number, machine, or status...'
                renderRowActions={(job) => {
                  return (
                    <div className='flex items-center justify-end gap-1'>
                      {(job.status === 'CREATED' || job.status === 'NEEDS_RECOUNT') && (
                        <Button size='sm' variant='ghost' onClick={() => jobAction.mutate({ path: `/jobs/${job.id}/start`, payload: {} })}>
                          Start
                        </Button>
                      )}
                      {job.status === 'IN_PROGRESS' && (
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => {
                            const raw = window.prompt('Enter actual quantity');
                            const actualQty = Number(raw || '0');
                            if (!actualQty || actualQty < 0) return;
                            jobAction.mutate({ path: `/jobs/${job.id}/complete`, payload: { actualQty } });
                          }}
                        >
                          Complete
                        </Button>
                      )}
                      {job.status === 'NEEDS_RECOUNT' && (
                        <Button size='sm' variant='ghost' onClick={() => jobAction.mutate({ path: `/jobs/${job.id}/recount`, payload: { reason: 'Variance outside tolerance' } })}>
                          Recount
                        </Button>
                      )}
                    </div>
                  );
                }}
              />
            ) : jobs.isLoading ? (
              <p className='text-sm text-muted-foreground'>Loading jobs...</p>
            ) : (
              <p className='text-sm text-red-600'>Failed to load jobs.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
