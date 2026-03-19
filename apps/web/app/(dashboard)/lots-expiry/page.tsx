'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { DataTable } from '../../../components/data-table';
import { PageHeader } from '../../../components/page-header';
import { apiRequest } from '../../../lib/api';
import { daysUntil, formatDate } from '../../../lib/format';
import { Lot, PillType } from '../../../types/api';

const lotColumns: ColumnDef<Lot>[] = [
  { accessorKey: 'pillType.code', header: 'Pill', cell: ({ row }) => `${row.original.pillType?.code || 'N/A'} - ${row.original.pillType?.name || ''}` },
  { accessorKey: 'lotNumber', header: 'Lot #', cell: ({ row }) => <span className='font-medium'>{row.original.lotNumber}</span> },
  { accessorKey: 'location', header: 'Location' },
  { accessorKey: 'receivedDate', header: 'Received', cell: ({ row }) => formatDate(row.original.receivedDate) },
  { accessorKey: 'expiryDate', header: 'Expiry', cell: ({ row }) => formatDate(row.original.expiryDate) },
  {
    id: 'daysToExpiry',
    header: 'Days Left',
    cell: ({ row }) => {
      const days = daysUntil(row.original.expiryDate);
      if (days === null) return 'N/A';
      if (days <= 30) return <Badge variant='warning'>{days}</Badge>;
      return <Badge variant='default'>{days}</Badge>;
    }
  },
  {
    accessorKey: 'isQuarantined',
    header: 'State',
    cell: ({ row }) => (row.original.isQuarantined ? <Badge variant='danger'>Quarantined</Badge> : <Badge variant='success'>Available</Badge>)
  }
];

export default function LotsExpiryPage() {
  const queryClient = useQueryClient();
  const [createError, setCreateError] = useState('');
  const [form, setForm] = useState({
    pillTypeId: '',
    lotNumber: '',
    expiryDate: '',
    receivedDate: '',
    unitCost: '0.00',
    location: '',
    isQuarantined: false
  });

  const pillTypes = useQuery({
    queryKey: ['pill-types', 'lots'],
    queryFn: () => apiRequest<PillType[]>('/pill-types')
  });

  const lots = useQuery({
    queryKey: ['lots', 'all'],
    queryFn: () => apiRequest<Lot[]>('/lots')
  });

  const createLot = useMutation({
    mutationFn: async () => {
      setCreateError('');
      return apiRequest('/lots', {
        method: 'POST',
        body: JSON.stringify({
          pillTypeId: form.pillTypeId,
          lotNumber: form.lotNumber,
          expiryDate: new Date(form.expiryDate).toISOString(),
          receivedDate: new Date(form.receivedDate).toISOString(),
          unitCost: Number(form.unitCost),
          location: form.location,
          isQuarantined: form.isQuarantined
        })
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lots', 'all'] });
      setForm({ pillTypeId: '', lotNumber: '', expiryDate: '', receivedDate: '', unitCost: '0.00', location: '', isQuarantined: false });
    },
    onError: (error: any) => {
      setCreateError(error?.message || 'Failed to create lot');
    }
  });

  const toggleQuarantine = useMutation({
    mutationFn: ({ lotId, isQuarantined }: { lotId: string; isQuarantined: boolean }) =>
      apiRequest(`/lots/${lotId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isQuarantined })
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lots', 'all'] });
    }
  });

  const fefoQueue = useMemo(() => {
    if (!lots.data) return [];
    return lots.data
      .filter((lot) => !lot.isQuarantined)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
      .slice(0, 12);
  }, [lots.data]);

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Lots & Expiry Control'
        description='Manage FEFO queue, quarantine flags, and expiry-risk inventory before dispense.'
      />

      <Card>
        <CardHeader>
          <CardTitle>Create Lot</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='grid gap-3 md:grid-cols-3'>
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
              <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Lot Number</label>
              <Input value={form.lotNumber} onChange={(e) => setForm((prev) => ({ ...prev, lotNumber: e.target.value }))} />
            </div>
            <div>
              <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Location</label>
              <Input value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} />
            </div>
          </div>

          <div className='grid gap-3 md:grid-cols-4'>
            <div>
              <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Received Date</label>
              <Input type='date' value={form.receivedDate} onChange={(e) => setForm((prev) => ({ ...prev, receivedDate: e.target.value }))} />
            </div>
            <div>
              <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Expiry Date</label>
              <Input type='date' value={form.expiryDate} onChange={(e) => setForm((prev) => ({ ...prev, expiryDate: e.target.value }))} />
            </div>
            <div>
              <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Unit Cost</label>
              <Input type='number' value={form.unitCost} onChange={(e) => setForm((prev) => ({ ...prev, unitCost: e.target.value }))} />
            </div>
            <div className='flex items-end'>
              <label className='inline-flex items-center gap-2 text-sm'>
                <input type='checkbox' checked={form.isQuarantined} onChange={(e) => setForm((prev) => ({ ...prev, isQuarantined: e.target.checked }))} />
                Start in quarantine
              </label>
            </div>
          </div>

          {createError ? <p className='text-sm text-red-600'>{createError}</p> : null}
          <Button onClick={() => createLot.mutate()} disabled={createLot.isPending}>
            {createLot.isPending ? 'Saving lot...' : 'Create lot'}
          </Button>
        </CardContent>
      </Card>

      <section className='grid gap-6 xl:grid-cols-3'>
        <Card className='xl:col-span-2'>
          <CardHeader>
            <CardTitle>Lot Registry</CardTitle>
          </CardHeader>
          <CardContent>
            {lots.data ? (
              <DataTable
                columns={lotColumns}
                data={lots.data}
                enableRowSelection
                searchPlaceholder='Search lot number, location, or pill code...'
                renderRowActions={(row) => (
                  <Button size='sm' variant='ghost' onClick={() => toggleQuarantine.mutate({ lotId: row.id, isQuarantined: !row.isQuarantined })}>
                    {row.isQuarantined ? 'Release' : 'Quarantine'}
                  </Button>
                )}
              />
            ) : null}
            {lots.isLoading ? <p className='text-sm text-muted-foreground'>Loading lots...</p> : null}
            {lots.error ? <p className='text-sm text-red-600'>Failed to load lots.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>FEFO Priority Queue</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {fefoQueue.length ? (
              fefoQueue.map((lot) => {
                const days = daysUntil(lot.expiryDate) || 0;
                return (
                  <div key={lot.id} className='rounded-lg border border-border/70 p-3'>
                    <div className='flex items-start justify-between gap-2'>
                      <div>
                        <p className='text-sm font-semibold'>{lot.pillType?.code || 'PILL'} • {lot.lotNumber}</p>
                        <p className='text-xs text-muted-foreground'>{lot.location}</p>
                      </div>
                      <Badge variant={days <= 30 ? 'warning' : 'default'}>{days}d</Badge>
                    </div>
                    <p className='mt-2 text-xs text-muted-foreground'>Expiry: {formatDate(lot.expiryDate)}</p>
                  </div>
                );
              })
            ) : (
              <p className='text-sm text-muted-foreground'>No FEFO entries available.</p>
            )}

            <div className='rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'>
              <div className='flex items-center gap-2'>
                <AlertTriangle className='h-4 w-4' />
                <span>Lots within 30 days should be prioritized or quarantined.</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
