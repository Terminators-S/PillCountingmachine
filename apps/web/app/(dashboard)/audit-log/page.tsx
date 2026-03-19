'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { DataTable } from '../../../components/data-table';
import { PageHeader } from '../../../components/page-header';
import { apiRequest } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { AuditLogRow } from '../../../types/api';
import { Badge } from '../../../components/ui/badge';

const auditColumns: ColumnDef<AuditLogRow>[] = [
  { accessorKey: 'createdAt', header: 'When', cell: ({ row }) => formatDateTime(row.original.createdAt) },
  {
    accessorKey: 'actorType',
    header: 'Actor Type',
    cell: ({ row }) => <Badge variant={row.original.actorType === 'SYSTEM' ? 'warning' : 'default'}>{row.original.actorType}</Badge>
  },
  {
    id: 'actor',
    header: 'Actor',
    cell: ({ row }) => row.original.actorUser?.email || row.original.actorApiKey?.name || 'system'
  },
  { accessorKey: 'action', header: 'Action', cell: ({ row }) => <span className='font-medium'>{row.original.action}</span> },
  { accessorKey: 'resourceType', header: 'Resource' },
  { accessorKey: 'resourceId', header: 'Resource ID', cell: ({ row }) => row.original.resourceId || '-' },
  { accessorKey: 'ipAddress', header: 'IP Address', cell: ({ row }) => row.original.ipAddress || '-' }
];

export default function AuditLogPage() {
  const [resourceType, setResourceType] = useState('');
  const [action, setAction] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ limit: '300' });
    if (resourceType) params.set('resourceType', resourceType);
    if (action) params.set('action', action);
    return params.toString();
  }, [resourceType, action]);

  const auditLogs = useQuery({
    queryKey: ['audit-logs', queryString],
    queryFn: () => apiRequest<AuditLogRow[]>(`/audit/logs?${queryString}`)
  });

  return (
    <div className='space-y-6'>
      <PageHeader title='Audit Log' description='Immutable append-only record of write operations, actor identity, and request context.' />

      <Card>
        <CardHeader>
          <CardTitle>Audit Filters</CardTitle>
        </CardHeader>
        <CardContent className='grid gap-3 md:grid-cols-3'>
          <div>
            <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Resource Type</label>
            <Input value={resourceType} onChange={(e) => setResourceType(e.target.value)} placeholder='inventory' />
          </div>
          <div>
            <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Action</label>
            <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder='POST /inventory/dispense' />
          </div>
          <div className='flex items-end'>
            <Button
              variant='secondary'
              className='w-full'
              onClick={() => {
                setResourceType('');
                setAction('');
              }}
            >
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {auditLogs.data ? <DataTable columns={auditColumns} data={auditLogs.data} searchPlaceholder='Search audit entries...' /> : null}
          {auditLogs.isLoading ? <p className='text-sm text-muted-foreground'>Loading audit entries...</p> : null}
          {auditLogs.error ? <p className='text-sm text-red-600'>Failed to load audit entries.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
