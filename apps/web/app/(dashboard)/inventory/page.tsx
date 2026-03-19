'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowRightLeft, PackageCheck, ReceiptText } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { DataTable } from '../../../components/data-table';
import { PageHeader } from '../../../components/page-header';
import { WorkspaceTabs } from '../../../components/workspace-tabs';
import { apiRequest, downloadFromApi } from '../../../lib/api';
import { formatDate, formatDateTime, formatNumber } from '../../../lib/format';
import { InventoryBalance, InventoryMovement, PillType, Lot } from '../../../types/api';
import { Badge } from '../../../components/ui/badge';

type InventoryActionType = 'receive' | 'transfer' | 'adjust' | 'reserve' | 'release' | 'dispense';

const balanceColumns: ColumnDef<InventoryBalance>[] = [
  { accessorKey: 'pillType.code', header: 'Pill Code', cell: ({ row }) => <span className='font-medium'>{row.original.pillType.code}</span> },
  { accessorKey: 'pillType.name', header: 'Pill Name', cell: ({ row }) => row.original.pillType.name },
  { accessorKey: 'lot.lotNumber', header: 'Lot', cell: ({ row }) => row.original.lot.lotNumber },
  { accessorKey: 'lot.expiryDate', header: 'Expiry', cell: ({ row }) => formatDate(row.original.lot.expiryDate) },
  { accessorKey: 'location', header: 'Location' },
  { accessorKey: 'onHand', header: 'On Hand', cell: ({ row }) => formatNumber(row.original.onHand) },
  { accessorKey: 'reserved', header: 'Reserved', cell: ({ row }) => formatNumber(row.original.reserved) },
  { accessorKey: 'quarantined', header: 'Quarantine', cell: ({ row }) => formatNumber(row.original.quarantined) },
  {
    id: 'available',
    header: 'Available',
    cell: ({ row }) => formatNumber(row.original.onHand - row.original.reserved - row.original.quarantined)
  }
];

const movementColumns: ColumnDef<InventoryMovement>[] = [
  { accessorKey: 'createdAt', header: 'Timestamp', cell: ({ row }) => formatDateTime(row.original.createdAt) },
  {
    accessorKey: 'txnType',
    header: 'Type',
    cell: ({ row }) => {
      const danger = ['ADJUST', 'WASTE', 'QUARANTINE'].includes(row.original.txnType);
      return <Badge variant={danger ? 'warning' : 'default'}>{row.original.txnType}</Badge>;
    }
  },
  { accessorKey: 'pillType.code', header: 'Pill', cell: ({ row }) => row.original.pillType.code },
  { accessorKey: 'lot.lotNumber', header: 'Lot', cell: ({ row }) => row.original.lot?.lotNumber || '-' },
  { accessorKey: 'location', header: 'Location' },
  { accessorKey: 'quantity', header: 'Qty', cell: ({ row }) => formatNumber(row.original.quantity) },
  { accessorKey: 'operator', header: 'Operator', cell: ({ row }) => row.original.operator?.email || '-' },
  { accessorKey: 'machine', header: 'Machine', cell: ({ row }) => row.original.machine?.machineCode || '-' }
];

function buildIdempotencyKey(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'actions' | 'balances' | 'movements'>('balances');
  const [actionType, setActionType] = useState<InventoryActionType>('receive');
  const [form, setForm] = useState({
    pillTypeId: '',
    lotId: '',
    location: '',
    fromLocation: '',
    toLocation: '',
    quantity: '0',
    quantityDelta: '0',
    approvedByUserId: '',
    reason: ''
  });
  const [actionError, setActionError] = useState('');

  const balances = useQuery({
    queryKey: ['inventory', 'balances'],
    queryFn: () => apiRequest<InventoryBalance[]>('/inventory/balances')
  });

  const movements = useQuery({
    queryKey: ['inventory', 'movements'],
    queryFn: () => apiRequest<InventoryMovement[]>('/inventory/movements?limit=200')
  });

  const pillTypes = useQuery({
    queryKey: ['pill-types', 'inventory'],
    queryFn: () => apiRequest<PillType[]>('/pill-types')
  });

  const lots = useQuery({
    queryKey: ['lots', 'inventory'],
    queryFn: () => apiRequest<Lot[]>('/lots')
  });

  const submitAction = useMutation({
    mutationFn: async () => {
      setActionError('');
      const quantity = Number(form.quantity);
      const quantityDelta = Number(form.quantityDelta);
      const common = {
        idempotencyKey: buildIdempotencyKey(actionType),
        reason: form.reason || undefined
      };

      if (actionType === 'receive') {
        return apiRequest('/inventory/receive', {
          method: 'POST',
          body: JSON.stringify({ ...common, pillTypeId: form.pillTypeId, lotId: form.lotId, location: form.location, quantity })
        });
      }
      if (actionType === 'transfer') {
        return apiRequest('/inventory/transfer', {
          method: 'POST',
          body: JSON.stringify({
            ...common,
            pillTypeId: form.pillTypeId,
            lotId: form.lotId,
            fromLocation: form.fromLocation,
            toLocation: form.toLocation,
            quantity
          })
        });
      }
      if (actionType === 'adjust') {
        return apiRequest('/inventory/adjust', {
          method: 'POST',
          body: JSON.stringify({
            ...common,
            pillTypeId: form.pillTypeId,
            lotId: form.lotId,
            location: form.location,
            quantityDelta,
            approvedByUserId: form.approvedByUserId
          })
        });
      }
      if (actionType === 'reserve') {
        return apiRequest('/inventory/reserve', {
          method: 'POST',
          body: JSON.stringify({ ...common, pillTypeId: form.pillTypeId, lotId: form.lotId, location: form.location, quantity })
        });
      }
      if (actionType === 'release') {
        return apiRequest('/inventory/release', {
          method: 'POST',
          body: JSON.stringify({ ...common, pillTypeId: form.pillTypeId, lotId: form.lotId, location: form.location, quantity })
        });
      }

      return apiRequest('/inventory/dispense', {
        method: 'POST',
        body: JSON.stringify({ ...common, pillTypeId: form.pillTypeId, lotId: form.lotId || undefined, location: form.location, quantity })
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory', 'balances'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory', 'movements'] })
      ]);
      setForm((prev) => ({ ...prev, quantity: '0', quantityDelta: '0', reason: '' }));
    },
    onError: (error: any) => {
      setActionError(error?.message || 'Inventory action failed');
    }
  });

  const lotOptions = useMemo(() => {
    if (!lots.data) return [];
    return lots.data
      .filter((lot) => (form.pillTypeId ? lot.pillTypeId === form.pillTypeId : true))
      .map((lot) => ({ id: lot.id, label: `${lot.lotNumber} (${lot.location})` }));
  }, [lots.data, form.pillTypeId]);

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Inventory Ledger'
        description='Append-only stock ledger with FEFO-aware balances and transaction traceability.'
        actions={
          <>
            <Button variant='secondary' onClick={() => balances.refetch()}>
              Refresh balances
            </Button>
            <Button onClick={() => downloadFromApi('/reports/export/inventory-movements.csv', 'inventory-movements.csv')}>Export movements CSV</Button>
          </>
        }
      />

      <WorkspaceTabs
        value={activeTab}
        onValueChange={(key) => setActiveTab(key as 'actions' | 'balances' | 'movements')}
        items={[
          { key: 'balances', label: 'Balances', icon: PackageCheck, hint: 'Current FEFO-ready stock' },
          { key: 'movements', label: 'Movements', icon: ReceiptText, hint: 'Ledger transaction history' },
          { key: 'actions', label: 'Actions', icon: ArrowRightLeft, hint: 'Receive, transfer, adjust, reserve' }
        ]}
      />

      {activeTab === 'actions' ? (
        <Card>
          <CardHeader>
            <CardTitle>Inventory Actions</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='grid gap-3 md:grid-cols-4'>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Action</label>
                <select className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm' value={actionType} onChange={(e) => setActionType(e.target.value as InventoryActionType)}>
                  <option value='receive'>Receive</option>
                  <option value='transfer'>Transfer</option>
                  <option value='adjust'>Adjust (approval)</option>
                  <option value='reserve'>Reserve</option>
                  <option value='release'>Release</option>
                  <option value='dispense'>Dispense (FEFO)</option>
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
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Lot</label>
                <select className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm' value={form.lotId} onChange={(e) => setForm((prev) => ({ ...prev, lotId: e.target.value }))}>
                  <option value=''>Select lot</option>
                  {lotOptions.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Quantity</label>
                <Input type='number' value={form.quantity} onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))} />
              </div>
            </div>

            <div className='grid gap-3 md:grid-cols-4'>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Location</label>
                <Input value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} placeholder='Main Pharmacy' />
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>From Location</label>
                <Input value={form.fromLocation} onChange={(e) => setForm((prev) => ({ ...prev, fromLocation: e.target.value }))} placeholder='Warehouse-A' />
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>To Location</label>
                <Input value={form.toLocation} onChange={(e) => setForm((prev) => ({ ...prev, toLocation: e.target.value }))} placeholder='Dispense-Room-1' />
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Quantity Delta</label>
                <Input type='number' value={form.quantityDelta} onChange={(e) => setForm((prev) => ({ ...prev, quantityDelta: e.target.value }))} />
              </div>
            </div>

            <div className='grid gap-3 md:grid-cols-2'>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Approved By User ID (adjust only)</label>
                <Input value={form.approvedByUserId} onChange={(e) => setForm((prev) => ({ ...prev, approvedByUserId: e.target.value }))} placeholder='UUID' />
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Reason</label>
                <Input value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder='Optional reason' />
              </div>
            </div>

            {actionError ? <p className='text-sm text-red-600'>{actionError}</p> : null}
            <Button onClick={() => submitAction.mutate()} disabled={submitAction.isPending}>
              {submitAction.isPending ? 'Submitting...' : 'Submit inventory action'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'balances' ? (
        <Card>
          <CardHeader>
            <CardTitle>Inventory Balances (FEFO Ready)</CardTitle>
          </CardHeader>
          <CardContent>
            {balances.data ? <DataTable columns={balanceColumns} data={balances.data} enableRowSelection searchPlaceholder='Search by pill, lot, location...' /> : null}
            {balances.isLoading ? <p className='text-sm text-muted-foreground'>Loading balances...</p> : null}
            {balances.error ? <p className='text-sm text-red-600'>Failed to load balances.</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'movements' ? (
        <Card>
          <CardHeader>
            <CardTitle>Inventory Movements</CardTitle>
          </CardHeader>
          <CardContent>
            {movements.data ? <DataTable columns={movementColumns} data={movements.data} searchPlaceholder='Filter transaction history...' /> : null}
            {movements.isLoading ? <p className='text-sm text-muted-foreground'>Loading movement history...</p> : null}
            {movements.error ? <p className='text-sm text-red-600'>Failed to load movement history.</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
