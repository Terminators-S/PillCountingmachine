'use client';

import {
  ColumnDef,
  RowSelectionState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '../lib/utils';

export function DataTable<TData>({
  columns,
  data,
  enableRowSelection = false,
  searchPlaceholder = 'Filter rows...',
  renderRowActions,
  onBulkAction,
  bulkActionLabel,
  emptyText = 'No records found.'
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  enableRowSelection?: boolean;
  searchPlaceholder?: string;
  renderRowActions?: (row: TData) => React.ReactNode;
  onBulkAction?: (rows: TData[]) => void;
  bulkActionLabel?: string;
  emptyText?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const computedColumns = useMemo<ColumnDef<TData, unknown>[]>(() => {
    const base = [...columns];

    if (enableRowSelection) {
      base.unshift({
        id: '__select',
        header: ({ table }) => (
          <input
            aria-label='Select all rows'
            type='checkbox'
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input aria-label='Select row' type='checkbox' checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 36
      });
    }

    if (renderRowActions) {
      base.push({
        id: '__actions',
        header: 'Actions',
        cell: ({ row }) => <div className='text-right'>{renderRowActions(row.original)}</div>,
        enableSorting: false,
        enableHiding: false
      });
    }

    return base;
  }, [columns, enableRowSelection, renderRowActions]);

  const table = useReactTable({
    data,
    columns: computedColumns,
    state: {
      sorting,
      globalFilter,
      rowSelection
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
    enableRowSelection
  });

  const selectedRows = table.getSelectedRowModel().rows.map((entry) => entry.original);

  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
        <Input
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder={searchPlaceholder}
          className='w-full md:max-w-xs'
        />
        {onBulkAction && selectedRows.length > 0 ? (
          <Button size='sm' variant='secondary' onClick={() => onBulkAction(selectedRows)}>
            {bulkActionLabel || `Apply to ${selectedRows.length} selected`}
          </Button>
        ) : null}
      </div>

      <div className='scroll-table'>
        <table className='w-full border-collapse text-sm'>
          <thead className='sticky top-0 z-10 bg-white/85 backdrop-blur dark:bg-slate-950/80'>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      'border-b border-border/70 px-3.5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground',
                      header.column.getCanSort() ? 'cursor-pointer select-none' : ''
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {header.isPlaceholder ? null : (
                      <div className='inline-flex items-center gap-1'>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? '↑' : null}
                        {header.column.getIsSorted() === 'desc' ? '↓' : null}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className='border-b border-border/60 transition-colors hover:bg-muted/25'>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className='px-3.5 py-3 align-top text-slate-700 dark:text-slate-200'>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className='px-3 py-8 text-center text-sm text-muted-foreground' colSpan={computedColumns.length}>
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className='flex items-center justify-between text-xs text-muted-foreground'>
        <span>
          Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
        </span>
        <div className='flex items-center gap-2'>
          <Button size='sm' variant='ghost' onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Previous
          </Button>
          <Button size='sm' variant='ghost' onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
