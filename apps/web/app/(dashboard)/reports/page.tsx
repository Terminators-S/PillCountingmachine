'use client';

import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { DataTable } from '../../../components/data-table';
import { PageHeader } from '../../../components/page-header';
import { StatCard } from '../../../components/stat-card';
import { apiRequest, downloadFromApi } from '../../../lib/api';
import { formatCurrency, formatDateTime, formatNumber } from '../../../lib/format';
import { ReportsOverview, ThroughputRow, ValuationRow } from '../../../types/api';

const throughputColumns: ColumnDef<ThroughputRow>[] = [
  { accessorKey: 'jobNumber', header: 'Job #' },
  { accessorKey: 'machineCode', header: 'Machine' },
  { accessorKey: 'pillTypeCode', header: 'Pill Code' },
  { accessorKey: 'pillName', header: 'Pill Name' },
  { accessorKey: 'targetQty', header: 'Target', cell: ({ row }) => formatNumber(row.original.targetQty) },
  { accessorKey: 'actualQty', header: 'Actual', cell: ({ row }) => formatNumber(row.original.actualQty) },
  { accessorKey: 'completedAt', header: 'Completed', cell: ({ row }) => formatDateTime(row.original.completedAt) }
];

const valuationColumns: ColumnDef<ValuationRow>[] = [
  { accessorKey: 'location', header: 'Location', cell: ({ row }) => <span className='font-medium'>{row.original.location}</span> },
  { accessorKey: 'lines', header: 'Stock Lines', cell: ({ row }) => formatNumber(row.original.lines) },
  { accessorKey: 'totalValue', header: 'Inventory Value', cell: ({ row }) => formatCurrency(row.original.totalValue) }
];

export default function ReportsPage() {
  const overview = useQuery({
    queryKey: ['reports', 'overview', 'reports-page'],
    queryFn: () => apiRequest<ReportsOverview>('/reports/overview')
  });

  const throughput = useQuery({
    queryKey: ['reports', 'throughput'],
    queryFn: () => apiRequest<ThroughputRow[]>('/reports/throughput')
  });

  const valuation = useQuery({
    queryKey: ['reports', 'valuation'],
    queryFn: () => apiRequest<ValuationRow[]>('/reports/valuation')
  });

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Reports & Analytics'
        description='Throughput, utilization, and valuation insights for operational decision-making.'
        actions={
          <>
            <Button variant='secondary' onClick={() => downloadFromApi('/reports/export/records.csv', 'records.csv')}>
              Export Records
            </Button>
            <Button onClick={() => downloadFromApi('/reports/export/inventory-movements.csv', 'inventory-movements.csv')}>
              Export Inventory
            </Button>
          </>
        }
      />

      <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <StatCard label='Total Jobs' value={formatNumber(overview.data?.jobsTotal || 0)} />
        <StatCard label='Completed Jobs' value={formatNumber(overview.data?.jobsCompleted || 0)} />
        <StatCard label='Machines Online' value={formatNumber(overview.data?.machinesOnline || 0)} />
        <StatCard label='Movements' value={formatNumber(overview.data?.inventoryMovements || 0)} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Throughput</CardTitle>
        </CardHeader>
        <CardContent>
          {throughput.data ? <DataTable columns={throughputColumns} data={throughput.data} searchPlaceholder='Filter throughput rows...' /> : null}
          {throughput.isLoading ? <p className='text-sm text-muted-foreground'>Loading throughput report...</p> : null}
          {throughput.error ? <p className='text-sm text-red-600'>Failed to load throughput report.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inventory Valuation by Location</CardTitle>
        </CardHeader>
        <CardContent>
          {valuation.data ? <DataTable columns={valuationColumns} data={valuation.data} searchPlaceholder='Search location...' /> : null}
          {valuation.isLoading ? <p className='text-sm text-muted-foreground'>Loading valuation report...</p> : null}
          {valuation.error ? <p className='text-sm text-red-600'>Failed to load valuation report.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
