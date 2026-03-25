'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowRightLeft, ChevronDown, ClipboardList, PackageCheck, ReceiptText, RefreshCcw } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button, buttonVariants } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { DataTable } from './data-table';
import { PageHeader } from './page-header';
import { StatCard } from './stat-card';
import { apiRequest, downloadFromApi } from '../lib/api';
import { cn } from '../lib/utils';
import { daysUntil, formatDate, formatDateTime, formatNumber } from '../lib/format';
import { CountingJob, InventoryBalance, InventoryMovement, Lot, Machine, PillType } from '../types/api';

type InventoryActionType = 'receive' | 'transfer' | 'adjust' | 'reserve' | 'release' | 'dispense';
type PanelKey = 'actions' | 'sessions' | 'stock' | 'movements';

function createEmptyStockForm() {
  return {
    pillTypeId: '',
    lotId: '',
    lotNumber: '',
    expiryDate: '',
    receivedDate: '',
    unitCost: '0.00',
    isQuarantined: false,
    location: '',
    fromLocation: '',
    toLocation: '',
    quantity: '0',
    quantityDelta: '0',
    approvedByUserId: '',
    reason: ''
  };
}

const sessionColumns: ColumnDef<CountingJob>[] = [
  { accessorKey: 'jobNumber', header: 'Session', cell: ({ row }) => <span className='font-medium'>{row.original.jobNumber}</span> },
  { accessorKey: 'machine.machineCode', header: 'Machine', cell: ({ row }) => row.original.machine.machineCode },
  { accessorKey: 'pillType.code', header: 'Pill', cell: ({ row }) => row.original.pillType.code },
  {
    id: 'qty',
    header: 'Qty',
    cell: ({ row }) => `${formatNumber(row.original.targetQty)} / ${formatNumber(row.original.actualQty || 0)}`
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.original.status;
      const variant = status === 'COMPLETED' ? 'success' : status === 'NEEDS_RECOUNT' ? 'warning' : status === 'CANCELLED' ? 'danger' : 'default';
      return <Badge variant={variant}>{status}</Badge>;
    }
  },
  {
    id: 'updated',
    header: 'When',
    cell: ({ row }) => formatDateTime(row.original.completedAt || row.original.startedAt || row.original.createdAt)
  }
];

const stockColumns: ColumnDef<InventoryBalance>[] = [
  { accessorKey: 'pillType.code', header: 'Pill', cell: ({ row }) => <span className='font-medium'>{row.original.pillType.code}</span> },
  { accessorKey: 'lot.lotNumber', header: 'Lot', cell: ({ row }) => row.original.lot.lotNumber },
  {
    accessorKey: 'lot.expiryDate',
    header: 'Expiry',
    cell: ({ row }) => {
      const days = daysUntil(row.original.lot.expiryDate);
      return (
        <div className='space-y-0.5'>
          <p>{formatDate(row.original.lot.expiryDate)}</p>
          {days !== null && days <= 30 ? <p className='text-xs text-amber-600'>Soon</p> : null}
        </div>
      );
    }
  },
  { accessorKey: 'location', header: 'Location' },
  { accessorKey: 'onHand', header: 'On hand', cell: ({ row }) => formatNumber(row.original.onHand) },
  {
    id: 'available',
    header: 'Available',
    cell: ({ row }) => formatNumber(row.original.onHand - row.original.reserved - row.original.quarantined)
  }
];

const movementColumns: ColumnDef<InventoryMovement>[] = [
  { accessorKey: 'createdAt', header: 'Time', cell: ({ row }) => formatDateTime(row.original.createdAt) },
  {
    accessorKey: 'txnType',
    header: 'Type',
    cell: ({ row }) => {
      const warning = ['ADJUST', 'WASTE', 'QUARANTINE'].includes(row.original.txnType);
      return <Badge variant={warning ? 'warning' : 'default'}>{row.original.txnType}</Badge>;
    }
  },
  { accessorKey: 'pillType.code', header: 'Pill', cell: ({ row }) => row.original.pillType.code },
  { accessorKey: 'lot.lotNumber', header: 'Lot', cell: ({ row }) => row.original.lot?.lotNumber || '-' },
  { accessorKey: 'quantity', header: 'Qty', cell: ({ row }) => formatNumber(row.original.quantity) },
  {
    id: 'where',
    header: 'Where',
    cell: ({ row }) => {
      if (row.original.fromLocation || row.original.toLocation) {
        return `${row.original.fromLocation || '-'} → ${row.original.toLocation || '-'}`;
      }
      return row.original.location;
    }
  }
];

function buildIdempotencyKey(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function CollapsibleSection({
  title,
  summary,
  open,
  onToggle,
  actions,
  children
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <button type='button' onClick={onToggle} className='flex min-w-0 flex-1 items-center gap-3 text-left'>
            <span className='flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-muted/20'>
              <ChevronDown className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : '')} />
            </span>
            <div className='min-w-0'>
              <CardTitle>{title}</CardTitle>
              <p className='mt-1 text-sm text-muted-foreground'>{summary}</p>
            </div>
          </button>
          {actions}
        </div>
      </CardHeader>
      {open ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}

export function OperationsWorkspace() {
  const queryClient = useQueryClient();
  const [panels, setPanels] = useState<Record<PanelKey, boolean>>({
    actions: false,
    sessions: true,
    stock: true,
    movements: false
  });
  const [sessionForm, setSessionForm] = useState({
    machineId: '',
    pillTypeId: '',
    targetQty: '100',
    lotPreferenceId: '',
    operatorId: '',
    tolerancePct: '2',
    notes: ''
  });
  const [stockForm, setStockForm] = useState({
    ...createEmptyStockForm()
  });
  const [actionType, setActionType] = useState<InventoryActionType>('receive');
  const [sessionError, setSessionError] = useState('');
  const [stockError, setStockError] = useState('');
  const isReceiveAction = actionType === 'receive';

  const jobs = useQuery({
    queryKey: ['jobs', 'list'],
    queryFn: () => apiRequest<CountingJob[]>('/jobs')
  });
  const machines = useQuery({
    queryKey: ['machines', 'jobs'],
    queryFn: () => apiRequest<Machine[]>('/machines')
  });
  const pillTypes = useQuery({
    queryKey: ['pill-types', 'operations'],
    queryFn: () => apiRequest<PillType[]>('/pill-types')
  });
  const balances = useQuery({
    queryKey: ['inventory', 'balances'],
    queryFn: () => apiRequest<InventoryBalance[]>('/inventory/balances')
  });
  const movements = useQuery({
    queryKey: ['inventory', 'movements'],
    queryFn: () => apiRequest<InventoryMovement[]>('/inventory/movements?limit=200')
  });
  const lots = useQuery({
    queryKey: ['lots', 'operations'],
    queryFn: () => apiRequest<Lot[]>('/lots')
  });

  const createSession = useMutation({
    mutationFn: async () => {
      setSessionError('');
      return apiRequest('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          machineId: sessionForm.machineId,
          pillTypeId: sessionForm.pillTypeId,
          targetQty: Number(sessionForm.targetQty),
          lotPreferenceId: sessionForm.lotPreferenceId || undefined,
          operatorId: sessionForm.operatorId || undefined,
          tolerancePct: Number(sessionForm.tolerancePct),
          notes: sessionForm.notes || undefined
        })
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['jobs', 'list'] });
      setSessionForm((current) => ({ ...current, targetQty: '100', notes: '' }));
      setPanels((current) => ({ ...current, sessions: true }));
    },
    onError: (error: any) => {
      setSessionError(error?.message || 'Failed to create session');
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

  const submitStockAction = useMutation({
    mutationFn: async () => {
      setStockError('');
      const quantity = Number(stockForm.quantity);
      const quantityDelta = Number(stockForm.quantityDelta);
      const common = {
        idempotencyKey: buildIdempotencyKey(actionType),
        reason: stockForm.reason || undefined
      };

      if (actionType === 'receive') {
        if (!stockForm.pillTypeId) {
          throw new Error('Select a pill type for incoming stock.');
        }
        if (!stockForm.location.trim()) {
          throw new Error('Enter where the stock is being stored.');
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error('Enter an incoming quantity greater than zero.');
        }

        let lotId = stockForm.lotId;

        if (!lotId) {
          if (!stockForm.lotNumber.trim()) {
            throw new Error('Enter a lot number for the new stock.');
          }
          if (!stockForm.receivedDate) {
            throw new Error('Enter the received date for the new lot.');
          }
          if (!stockForm.expiryDate) {
            throw new Error('Enter the expiry date for the new lot.');
          }

          const createdLot = await apiRequest<Lot>('/lots', {
            method: 'POST',
            body: JSON.stringify({
              pillTypeId: stockForm.pillTypeId,
              lotNumber: stockForm.lotNumber,
              expiryDate: new Date(stockForm.expiryDate).toISOString(),
              receivedDate: new Date(stockForm.receivedDate).toISOString(),
              unitCost: Number(stockForm.unitCost || '0'),
              location: stockForm.location,
              isQuarantined: stockForm.isQuarantined
            })
          });

          lotId = createdLot.id;
        }

        return apiRequest('/inventory/receive', {
          method: 'POST',
          body: JSON.stringify({ ...common, pillTypeId: stockForm.pillTypeId, lotId, location: stockForm.location, quantity })
        });
      }
      if (actionType === 'transfer') {
        return apiRequest('/inventory/transfer', {
          method: 'POST',
          body: JSON.stringify({
            ...common,
            pillTypeId: stockForm.pillTypeId,
            lotId: stockForm.lotId,
            fromLocation: stockForm.fromLocation,
            toLocation: stockForm.toLocation,
            quantity
          })
        });
      }
      if (actionType === 'adjust') {
        return apiRequest('/inventory/adjust', {
          method: 'POST',
          body: JSON.stringify({
            ...common,
            pillTypeId: stockForm.pillTypeId,
            lotId: stockForm.lotId,
            location: stockForm.location,
            quantityDelta,
            approvedByUserId: stockForm.approvedByUserId
          })
        });
      }
      if (actionType === 'reserve') {
        return apiRequest('/inventory/reserve', {
          method: 'POST',
          body: JSON.stringify({ ...common, pillTypeId: stockForm.pillTypeId, lotId: stockForm.lotId, location: stockForm.location, quantity })
        });
      }
      if (actionType === 'release') {
        return apiRequest('/inventory/release', {
          method: 'POST',
          body: JSON.stringify({ ...common, pillTypeId: stockForm.pillTypeId, lotId: stockForm.lotId, location: stockForm.location, quantity })
        });
      }

      return apiRequest('/inventory/dispense', {
        method: 'POST',
        body: JSON.stringify({ ...common, pillTypeId: stockForm.pillTypeId, lotId: stockForm.lotId || undefined, location: stockForm.location, quantity })
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory', 'balances'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory', 'movements'] }),
        queryClient.invalidateQueries({ queryKey: ['lots', 'operations'] }),
        queryClient.invalidateQueries({ queryKey: ['jobs', 'list'] })
      ]);
      setStockForm(createEmptyStockForm());
      setActionType('receive');
      setPanels((current) => ({ ...current, actions: true, stock: true }));
    },
    onError: (error: any) => {
      setStockError(error?.message || 'Stock action failed');
    }
  });

  const lotOptions = useMemo(() => {
    if (!lots.data) return [];
    return lots.data
      .filter((lot) => (stockForm.pillTypeId ? lot.pillTypeId === stockForm.pillTypeId : true))
      .map((lot) => ({ id: lot.id, label: `${lot.lotNumber} (${lot.location})` }));
  }, [lots.data, stockForm.pillTypeId]);

  const sessionLotOptions = useMemo(() => {
    if (!lots.data) return [];
    return lots.data
      .filter((lot) => (sessionForm.pillTypeId ? lot.pillTypeId === sessionForm.pillTypeId : true))
      .map((lot) => ({ id: lot.id, label: `${lot.lotNumber} (${lot.location})` }));
  }, [lots.data, sessionForm.pillTypeId]);

  const summary = useMemo(() => {
    const jobList = jobs.data || [];
    const stockBalances = balances.data || [];
    const lotList = lots.data || [];

    const openSessions = jobList.filter((job) => job.status === 'CREATED' || job.status === 'IN_PROGRESS').length;
    const needsRecount = jobList.filter((job) => job.status === 'NEEDS_RECOUNT').length;
    const availableUnits = stockBalances.reduce((total, entry) => total + entry.onHand - entry.reserved - entry.quarantined, 0);
    const expiringSoon = lotList.filter((lot) => {
      const days = daysUntil(lot.expiryDate);
      return days !== null && days <= 30;
    }).length;
    const quarantinedLots = lotList.filter((lot) => lot.isQuarantined).length;
    const soonestExpiry =
      [...lotList]
        .filter((lot) => !lot.isQuarantined)
        .sort((left, right) => new Date(left.expiryDate).getTime() - new Date(right.expiryDate).getTime())[0] || null;

    return { openSessions, needsRecount, availableUnits, expiringSoon, quarantinedLots, soonestExpiry };
  }, [balances.data, jobs.data, lots.data]);

  const refreshAll = async () => {
    await Promise.all([
      jobs.refetch(),
      balances.refetch(),
      movements.refetch(),
      lots.refetch(),
      machines.refetch(),
      pillTypes.refetch()
    ]);
  };

  const togglePanel = (panel: PanelKey) => {
    setPanels((current) => ({ ...current, [panel]: !current[panel] }));
  };

  const openIncomingStock = () => {
    setActionType('receive');
    setPanels((current) => ({ ...current, actions: true }));
    window.setTimeout(() => {
      document.getElementById('incoming-stock-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Sessions & Stock'
        description='Run sessions and manage stock in one place.'
        actions={
          <Button variant='secondary' onClick={() => refreshAll()}>
            <RefreshCcw className='mr-2 h-4 w-4' />
            Refresh
          </Button>
        }
      />

      <section className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
        <StatCard label='Open Sessions' value={formatNumber(summary.openSessions)} hint='Created or in progress' icon={<ClipboardList className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Needs Recount' value={formatNumber(summary.needsRecount)} hint='Session attention needed' icon={<RefreshCcw className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Available Stock' value={formatNumber(summary.availableUnits)} hint='Ready units across lots' icon={<PackageCheck className='h-4 w-4 text-muted-foreground' />} />
        <StatCard label='Expiry Watch' value={formatNumber(summary.expiringSoon)} hint={`${formatNumber(summary.quarantinedLots)} quarantined lots`} icon={<ReceiptText className='h-4 w-4 text-muted-foreground' />} />
      </section>

      <CollapsibleSection
        title='Quick actions'
        summary='Start a session or update stock only when needed.'
        open={panels.actions}
        onToggle={() => togglePanel('actions')}
      >
        <div className='grid gap-4 xl:grid-cols-2'>
          <div className='rounded-2xl border border-border/70 bg-muted/10 p-4'>
            <div className='mb-3'>
              <p className='text-sm font-semibold text-slate-950 dark:text-white'>New session</p>
              <p className='text-xs text-muted-foreground'>Machine, pill, and target.</p>
            </div>

            <div className='grid gap-3 md:grid-cols-2'>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Machine</label>
                <select
                  className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
                  value={sessionForm.machineId}
                  onChange={(event) => setSessionForm((current) => ({ ...current, machineId: event.target.value }))}
                >
                  <option value=''>Select machine</option>
                  {machines.data?.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machine.machineCode} - {machine.location}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Pill</label>
                <select
                  className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
                  value={sessionForm.pillTypeId}
                  onChange={(event) => setSessionForm((current) => ({ ...current, pillTypeId: event.target.value }))}
                >
                  <option value=''>Select pill type</option>
                  {pillTypes.data?.map((pill) => (
                    <option key={pill.id} value={pill.id}>
                      {pill.code} - {pill.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Target qty</label>
                <Input type='number' value={sessionForm.targetQty} onChange={(event) => setSessionForm((current) => ({ ...current, targetQty: event.target.value }))} />
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Tolerance %</label>
                <Input type='number' value={sessionForm.tolerancePct} onChange={(event) => setSessionForm((current) => ({ ...current, tolerancePct: event.target.value }))} />
              </div>
            </div>

            <details className='mt-3 rounded-xl border border-border/70 bg-white/80 p-3 dark:bg-slate-950/40'>
              <summary className='cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200'>More fields</summary>
              <div className='mt-3 grid gap-3 md:grid-cols-3'>
                <div>
                  <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Lot preference</label>
                  <select
                    className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
                    value={sessionForm.lotPreferenceId}
                    onChange={(event) => setSessionForm((current) => ({ ...current, lotPreferenceId: event.target.value }))}
                  >
                    <option value=''>No preference</option>
                    {sessionLotOptions.map((lot) => (
                      <option key={lot.id} value={lot.id}>
                        {lot.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Operator ID</label>
                  <Input value={sessionForm.operatorId} onChange={(event) => setSessionForm((current) => ({ ...current, operatorId: event.target.value }))} />
                </div>
                <div>
                  <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Note</label>
                  <Input value={sessionForm.notes} onChange={(event) => setSessionForm((current) => ({ ...current, notes: event.target.value }))} />
                </div>
              </div>
            </details>

            {sessionError ? <p className='mt-3 text-sm text-red-600'>{sessionError}</p> : null}
            <div className='mt-3'>
              <Button onClick={() => createSession.mutate()} disabled={createSession.isPending}>
                {createSession.isPending ? 'Creating...' : 'Create session'}
              </Button>
            </div>
          </div>

          <div className='rounded-2xl border border-border/70 bg-muted/10 p-4'>
            <div className='mb-3'>
              <p className='text-sm font-semibold text-slate-950 dark:text-white'>{isReceiveAction ? 'Incoming stock' : 'Stock action'}</p>
              <p className='text-xs text-muted-foreground'>
                {isReceiveAction ? 'Record new stock with lot and expiry, or receive into an existing lot.' : 'Transfer, adjust, reserve, release, or dispense stock.'}
              </p>
            </div>

            <div id='incoming-stock-form' className='grid gap-3 md:grid-cols-2'>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Action</label>
                <select className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm' value={actionType} onChange={(event) => setActionType(event.target.value as InventoryActionType)}>
                  <option value='receive'>Receive</option>
                  <option value='transfer'>Transfer</option>
                  <option value='adjust'>Adjust</option>
                  <option value='reserve'>Reserve</option>
                  <option value='release'>Release</option>
                  <option value='dispense'>Dispense</option>
                </select>
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Pill</label>
                <select
                  className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
                  value={stockForm.pillTypeId}
                  onChange={(event) => setStockForm((current) => ({ ...current, pillTypeId: event.target.value }))}
                >
                  <option value=''>Select pill type</option>
                  {pillTypes.data?.map((pill) => (
                    <option key={pill.id} value={pill.id}>
                      {pill.code} - {pill.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>{isReceiveAction ? 'Existing lot' : 'Lot'}</label>
                <select className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm' value={stockForm.lotId} onChange={(event) => setStockForm((current) => ({ ...current, lotId: event.target.value }))}>
                  <option value=''>{isReceiveAction ? 'Create new lot from details below' : 'Select lot'}</option>
                  {lotOptions.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Quantity</label>
                <Input type='number' value={stockForm.quantity} onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))} />
              </div>
              <div className='md:col-span-2'>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Location</label>
                <Input value={stockForm.location} onChange={(event) => setStockForm((current) => ({ ...current, location: event.target.value }))} placeholder='Main Pharmacy' />
              </div>
              {isReceiveAction ? (
                <div className='md:col-span-2 rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10'>
                  <p className='text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-200'>New lot details</p>
                  <p className='mt-1 text-xs text-slate-600 dark:text-slate-300'>
                    Use these fields when the stock is newly received and does not exist in the system yet.
                  </p>
                  <div className='mt-3 grid gap-3 md:grid-cols-2'>
                    <div>
                      <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Lot number</label>
                      <Input value={stockForm.lotNumber} onChange={(event) => setStockForm((current) => ({ ...current, lotNumber: event.target.value }))} placeholder='LOT-2026-001' />
                    </div>
                    <div>
                      <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Unit cost</label>
                      <Input type='number' value={stockForm.unitCost} onChange={(event) => setStockForm((current) => ({ ...current, unitCost: event.target.value }))} placeholder='0.00' />
                    </div>
                    <div>
                      <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Received date</label>
                      <Input type='date' value={stockForm.receivedDate} onChange={(event) => setStockForm((current) => ({ ...current, receivedDate: event.target.value }))} />
                    </div>
                    <div>
                      <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Expiry date</label>
                      <Input type='date' value={stockForm.expiryDate} onChange={(event) => setStockForm((current) => ({ ...current, expiryDate: event.target.value }))} />
                    </div>
                    <label className='inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 md:col-span-2'>
                      <input
                        type='checkbox'
                        checked={stockForm.isQuarantined}
                        onChange={(event) => setStockForm((current) => ({ ...current, isQuarantined: event.target.checked }))}
                      />
                      Start this lot in quarantine
                    </label>
                  </div>
                </div>
              ) : null}
            </div>

            <details className='mt-3 rounded-xl border border-border/70 bg-white/80 p-3 dark:bg-slate-950/40'>
              <summary className='cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200'>More fields</summary>
              <div className='mt-3 grid gap-3 md:grid-cols-2'>
                {actionType === 'transfer' ? (
                  <>
                    <Input value={stockForm.fromLocation} onChange={(event) => setStockForm((current) => ({ ...current, fromLocation: event.target.value }))} placeholder='From location' />
                    <Input value={stockForm.toLocation} onChange={(event) => setStockForm((current) => ({ ...current, toLocation: event.target.value }))} placeholder='To location' />
                  </>
                ) : null}
                {actionType === 'adjust' ? (
                  <>
                    <Input type='number' value={stockForm.quantityDelta} onChange={(event) => setStockForm((current) => ({ ...current, quantityDelta: event.target.value }))} placeholder='Quantity delta' />
                    <Input value={stockForm.approvedByUserId} onChange={(event) => setStockForm((current) => ({ ...current, approvedByUserId: event.target.value }))} placeholder='Approved by user ID' />
                  </>
                ) : null}
                <div className='md:col-span-2'>
                  <Input value={stockForm.reason} onChange={(event) => setStockForm((current) => ({ ...current, reason: event.target.value }))} placeholder='Reason' />
                </div>
              </div>
            </details>

            {stockError ? <p className='mt-3 text-sm text-red-600'>{stockError}</p> : null}
            <div className='mt-3'>
              <Button onClick={() => submitStockAction.mutate()} disabled={submitStockAction.isPending}>
                {submitStockAction.isPending ? 'Submitting...' : 'Submit stock action'}
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title='Session queue'
        summary={`${formatNumber(summary.openSessions)} open • ${formatNumber(summary.needsRecount)} need recount`}
        open={panels.sessions}
        onToggle={() => togglePanel('sessions')}
      >
        {jobs.data ? (
          <DataTable
            columns={sessionColumns}
            data={jobs.data}
            searchPlaceholder='Search sessions...'
            renderRowActions={(job) => (
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
            )}
          />
        ) : jobs.isLoading ? (
          <p className='text-sm text-muted-foreground'>Loading sessions...</p>
        ) : (
          <p className='text-sm text-red-600'>Failed to load sessions.</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title='Stock snapshot'
        summary={`${formatNumber(summary.availableUnits)} available • ${formatNumber(summary.expiringSoon)} expiring soon`}
        open={panels.stock}
        onToggle={() => togglePanel('stock')}
        actions={
          <div className='flex items-center gap-2'>
            <Button variant='secondary' size='sm' onClick={openIncomingStock}>
              Add incoming stock
            </Button>
            <Link href='/lots-expiry' className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Lot control
            </Link>
          </div>
        }
      >
        <div className='mb-4 grid gap-3 md:grid-cols-3'>
          <div className='rounded-2xl border border-border/70 bg-muted/10 px-4 py-4'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Next expiry</p>
            <p className='mt-2 text-sm font-semibold text-slate-950 dark:text-white'>
              {summary.soonestExpiry ? summary.soonestExpiry.lotNumber : 'No active lot'}
            </p>
            <p className='mt-1 text-sm text-muted-foreground'>
              {summary.soonestExpiry ? formatDate(summary.soonestExpiry.expiryDate) : 'Nothing scheduled'}
            </p>
          </div>
          <div className='rounded-2xl border border-border/70 bg-muted/10 px-4 py-4'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Expiring soon</p>
            <p className='mt-2 text-2xl font-semibold text-slate-950 dark:text-white'>{formatNumber(summary.expiringSoon)}</p>
            <p className='mt-1 text-sm text-muted-foreground'>Within 30 days</p>
          </div>
          <div className='rounded-2xl border border-border/70 bg-muted/10 px-4 py-4'>
            <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Quarantined</p>
            <p className='mt-2 text-2xl font-semibold text-slate-950 dark:text-white'>{formatNumber(summary.quarantinedLots)}</p>
            <p className='mt-1 text-sm text-muted-foreground'>Blocked from use</p>
          </div>
        </div>

        {balances.data ? (
          <DataTable columns={stockColumns} data={balances.data} searchPlaceholder='Search stock...' />
        ) : balances.isLoading ? (
          <p className='text-sm text-muted-foreground'>Loading stock...</p>
        ) : (
          <p className='text-sm text-red-600'>Failed to load stock.</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title='Movement log'
        summary='Recent stock changes'
        open={panels.movements}
        onToggle={() => togglePanel('movements')}
        actions={
          <Button variant='secondary' size='sm' onClick={() => downloadFromApi('/reports/export/inventory-movements.csv', 'inventory-movements.csv')}>
            Export CSV
          </Button>
        }
      >
        {movements.data ? (
          <DataTable columns={movementColumns} data={movements.data} searchPlaceholder='Search movement log...' />
        ) : movements.isLoading ? (
          <p className='text-sm text-muted-foreground'>Loading movement log...</p>
        ) : (
          <p className='text-sm text-red-600'>Failed to load movement log.</p>
        )}
      </CollapsibleSection>
    </div>
  );
}
