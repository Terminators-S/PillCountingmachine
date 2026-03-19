'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { DataTable } from '../../../components/data-table';
import { PageHeader } from '../../../components/page-header';
import { apiRequest } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { RoleRow, UserRow } from '../../../types/api';

const userColumns: ColumnDef<UserRow>[] = [
  { accessorKey: 'fullName', header: 'Name', cell: ({ row }) => <span className='font-medium'>{row.original.fullName}</span> },
  { accessorKey: 'email', header: 'Email' },
  {
    accessorKey: 'roles',
    header: 'Roles',
    cell: ({ row }) => (
      <div className='flex flex-wrap gap-1'>
        {row.original.roles.map((role) => (
          <Badge key={role}>{role}</Badge>
        ))}
      </div>
    )
  },
  { accessorKey: 'isActive', header: 'Active', cell: ({ row }) => (row.original.isActive ? 'Yes' : 'No') },
  { accessorKey: 'createdAt', header: 'Created', cell: ({ row }) => formatDateTime(row.original.createdAt) }
];

const roleColumns: ColumnDef<RoleRow>[] = [
  { accessorKey: 'code', header: 'Role Code', cell: ({ row }) => <span className='font-medium'>{row.original.code}</span> },
  { accessorKey: 'name', header: 'Role Name' },
  {
    accessorKey: 'permissions',
    header: 'Permissions',
    cell: ({ row }) => (
      <div className='flex flex-wrap gap-1'>
        {(row.original.permissions || []).map((permission) => (
          <Badge key={permission} variant='default'>
            {permission}
          </Badge>
        ))}
      </div>
    )
  }
];

export default function UsersRolesPage() {
  const queryClient = useQueryClient();

  const users = useQuery({
    queryKey: ['users', 'list'],
    queryFn: () => apiRequest<UserRow[]>('/users')
  });

  const rolesCatalog = useQuery({
    queryKey: ['roles', 'catalog'],
    queryFn: () => apiRequest<RoleRow[]>('/users/roles/catalog')
  });

  const roleMatrix = useQuery({
    queryKey: ['roles', 'matrix'],
    queryFn: () => apiRequest<RoleRow[]>('/rbac/matrix')
  });

  const assignRoles = useMutation({
    mutationFn: ({ userId, roleIds }: { userId: string; roleIds: string[] }) =>
      apiRequest(`/users/${userId}/roles`, {
        method: 'PATCH',
        body: JSON.stringify({ roleIds })
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
    }
  });

  return (
    <div className='space-y-6'>
      <PageHeader title='Users & Roles' description='Role-based access control with assignable role sets and permission matrix visibility.' />

      <Card>
        <CardHeader>
          <CardTitle>User Directory</CardTitle>
        </CardHeader>
        <CardContent>
          {users.data ? (
            <DataTable
              columns={userColumns}
              data={users.data}
              searchPlaceholder='Search by name, email, or role...'
              renderRowActions={(user) => (
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => {
                    const available = rolesCatalog.data || [];
                    if (!available.length) {
                      window.alert('Role catalog is empty.');
                      return;
                    }
                    const message = `Enter role IDs separated by comma:\n${available
                      .map((role) => `${role.id} => ${role.code}`)
                      .join('\n')}`;
                    const raw = window.prompt(message, '');
                    if (!raw) return;
                    const roleIds = raw
                      .split(',')
                      .map((entry) => entry.trim())
                      .filter(Boolean);
                    if (!roleIds.length) return;
                    assignRoles.mutate({ userId: user.id, roleIds });
                  }}
                >
                  Assign roles
                </Button>
              )}
            />
          ) : users.isLoading ? (
            <p className='text-sm text-muted-foreground'>Loading users...</p>
          ) : (
            <p className='text-sm text-red-600'>Failed to load users.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>RBAC Permission Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          {roleMatrix.data ? <DataTable columns={roleColumns} data={roleMatrix.data} searchPlaceholder='Search roles or permissions...' /> : null}
          {roleMatrix.isLoading ? <p className='text-sm text-muted-foreground'>Loading role matrix...</p> : null}
          {roleMatrix.error ? <p className='text-sm text-red-600'>Failed to load role matrix.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
