'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '../../../components/page-header';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { apiRequest } from '../../../lib/api';
import { cn } from '../../../lib/utils';
import { AdminModelField, AdminModelMeta, AdminRow, AdminRowsResponse, MeProfile } from '../../../types/api';

type EditorValues = Record<string, string>;
const ADMIN_EDITOR_STORAGE_KEY = 'pillcount-admin-editor';

type StoredAdminEditorState = {
  selectedModelName?: string;
  selectedWhere?: Record<string, unknown> | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Request failed';
}

function valueToEditorText(value: unknown) {
  if (value === undefined) {
    return '';
  }

  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function buildBlankEditor(model?: AdminModelMeta): EditorValues {
  if (!model) {
    return {};
  }

  return Object.fromEntries(model.fields.map((field) => [field.name, '']));
}

function buildEditorFromRow(model: AdminModelMeta, row: AdminRow): EditorValues {
  return Object.fromEntries(model.fields.map((field) => [field.name, valueToEditorText(row[field.name])]));
}

function buildWhereFromRow(model: AdminModelMeta, row: AdminRow) {
  return Object.fromEntries(model.primaryKeyFields.map((fieldName) => [fieldName, row[fieldName]]));
}

function buildRowIdentity(model: AdminModelMeta, row: AdminRow) {
  return JSON.stringify(buildWhereFromRow(model, row));
}

function loadStoredAdminEditorState(): StoredAdminEditorState {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(ADMIN_EDITOR_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue) as StoredAdminEditorState;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return parsed;
  } catch (_error) {
    return {};
  }
}

function formatCellValue(value: unknown) {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return '';
  }

  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function parseFieldValue(field: AdminModelField, rawValue: string): unknown {
  const trimmed = rawValue.trim();

  if (trimmed === 'null') {
    return null;
  }

  if (field.isList || field.type === 'Json') {
    if (!trimmed) {
      return undefined;
    }

    try {
      return JSON.parse(rawValue);
    } catch (_error) {
      throw new Error(`${field.name} must contain valid JSON`);
    }
  }

  if (field.type === 'Boolean') {
    if (!trimmed) {
      return undefined;
    }

    if (trimmed === 'true') {
      return true;
    }

    if (trimmed === 'false') {
      return false;
    }

    throw new Error(`${field.name} must be true, false, or null`);
  }

  if (field.type === 'Int' || field.type === 'BigInt' || field.type === 'Float' || field.type === 'Decimal' || field.type === 'DateTime') {
    return trimmed ? trimmed : undefined;
  }

  if (field.kind === 'enum') {
    return trimmed ? trimmed : undefined;
  }

  return rawValue;
}

function buildDataPayload(model: AdminModelMeta, editorValues: EditorValues, isEditingExisting: boolean) {
  const data: Record<string, unknown> = {};

  for (const field of model.fields) {
    if (field.isUpdatedAt) {
      continue;
    }

    if (isEditingExisting && model.primaryKeyFields.includes(field.name)) {
      continue;
    }

    const parsed = parseFieldValue(field, editorValues[field.name] ?? '');
    if (parsed !== undefined) {
      data[field.name] = parsed;
    }
  }

  return data;
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [selectedModelName, setSelectedModelName] = useState('');
  const [selectedWhere, setSelectedWhere] = useState<Record<string, unknown> | null>(null);
  const [editorValues, setEditorValues] = useState<EditorValues>({});
  const [tableFilter, setTableFilter] = useState('');
  const [rowLimit, setRowLimit] = useState('100');
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [hasLoadedStoredState, setHasLoadedStoredState] = useState(false);
  const [preferredSelection, setPreferredSelection] = useState<StoredAdminEditorState | null>(null);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiRequest<MeProfile>('/auth/me'),
    refetchInterval: false
  });

  const isAdmin = me.data?.roles?.includes('ADMIN');

  const models = useQuery({
    queryKey: ['admin-models'],
    queryFn: () => apiRequest<AdminModelMeta[]>('/admin/models'),
    enabled: Boolean(isAdmin),
    refetchInterval: false
  });

  const selectedModel = useMemo(
    () => models.data?.find((model) => model.name === selectedModelName) || null,
    [models.data, selectedModelName]
  );

  const rows = useQuery({
    queryKey: ['admin-rows', selectedModelName, rowLimit],
    queryFn: () => apiRequest<AdminRowsResponse>(`/admin/models/${selectedModelName}/rows?limit=${encodeURIComponent(rowLimit || '100')}`),
    enabled: Boolean(isAdmin && selectedModelName),
    refetchInterval: false
  });

  useEffect(() => {
    const storedState = loadStoredAdminEditorState();
    if (storedState.selectedModelName) {
      setSelectedModelName(storedState.selectedModelName);
    }
    if (storedState.selectedWhere) {
      setPreferredSelection(storedState);
    }
    setHasLoadedStoredState(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredState) {
      return;
    }

    if (!selectedModelName && models.data?.length) {
      setSelectedModelName(models.data[0].name);
    }
  }, [hasLoadedStoredState, models.data, selectedModelName]);

  useEffect(() => {
    if (!selectedModel) {
      return;
    }

    setIsCreateMode(false);
    setSelectedWhere(null);
    setEditorValues(buildBlankEditor(selectedModel));
    setTableFilter('');
    setStatus(null);
  }, [selectedModelName]);

  useEffect(() => {
    if (!selectedModel || !rows.data?.rows?.length || selectedWhere || isCreateMode) {
      return;
    }

    const targetRow =
      preferredSelection?.selectedModelName === selectedModel.name && preferredSelection.selectedWhere
        ? rows.data.rows.find(
            (row) => buildRowIdentity(selectedModel, row) === JSON.stringify(preferredSelection.selectedWhere)
          )
        : rows.data.rows[0];

    if (!targetRow) {
      return;
    }

    setSelectedWhere(buildWhereFromRow(selectedModel, targetRow));
    setEditorValues(buildEditorFromRow(selectedModel, targetRow));
    setPreferredSelection(null);
  }, [isCreateMode, preferredSelection, rows.data?.rows, selectedModel, selectedWhere]);

  useEffect(() => {
    if (typeof window === 'undefined' || !selectedModelName) {
      return;
    }

    const nextState: StoredAdminEditorState = {
      selectedModelName,
      selectedWhere: isCreateMode ? null : selectedWhere
    };

    window.localStorage.setItem(ADMIN_EDITOR_STORAGE_KEY, JSON.stringify(nextState));
  }, [isCreateMode, selectedModelName, selectedWhere]);

  const filteredRows = useMemo(() => {
    if (!rows.data?.rows || !tableFilter.trim()) {
      return rows.data?.rows || [];
    }

    const term = tableFilter.toLowerCase();
    return rows.data.rows.filter((row) => JSON.stringify(row).toLowerCase().includes(term));
  }, [rows.data?.rows, tableFilter]);

  const payloadPreview = useMemo(() => {
    if (!selectedModel) {
      return { data: {}, error: '' };
    }

    try {
      return {
        data: buildDataPayload(selectedModel, editorValues, Boolean(selectedWhere)),
        error: ''
      };
    } catch (error) {
      return {
        data: {},
        error: getErrorMessage(error)
      };
    }
  }, [editorValues, selectedModel, selectedWhere]);

  function startCreateRow() {
    if (!selectedModel) {
      return;
    }

    setIsCreateMode(true);
    setPreferredSelection(null);
    setSelectedWhere(null);
    setEditorValues(buildBlankEditor(selectedModel));
    setStatus(null);
  }

  function selectRow(row: AdminRow) {
    if (!selectedModel) {
      return;
    }

    const nextWhere = buildWhereFromRow(selectedModel, row);
    setIsCreateMode(false);
    setPreferredSelection({ selectedModelName: selectedModel.name, selectedWhere: nextWhere });
    setSelectedWhere(nextWhere);
    setEditorValues(buildEditorFromRow(selectedModel, row));
    setStatus(null);
  }

  async function refreshRows() {
    await rows.refetch();
  }

  const createRow = useMutation({
    mutationFn: async () => {
      if (!selectedModel) {
        throw new Error('Select a model first');
      }

      const data = buildDataPayload(selectedModel, editorValues, false);
      return apiRequest<AdminRow>(`/admin/models/${selectedModel.name}/rows`, {
        method: 'POST',
        body: JSON.stringify({ data })
      });
    },
    onSuccess: async (createdRow) => {
      if (!selectedModel) {
        return;
      }

      setSelectedWhere(buildWhereFromRow(selectedModel, createdRow));
      setIsCreateMode(false);
      setEditorValues(buildEditorFromRow(selectedModel, createdRow));
      setStatus({ kind: 'success', message: `Created row in ${selectedModel.name}` });
      await queryClient.invalidateQueries({ queryKey: ['admin-rows', selectedModel.name] });
    },
    onError: (error) => {
      setStatus({ kind: 'error', message: getErrorMessage(error) });
    }
  });

  const updateRow = useMutation({
    mutationFn: async () => {
      if (!selectedModel) {
        throw new Error('Select a model first');
      }

      if (!selectedWhere) {
        throw new Error('Choose an existing row before saving');
      }

      const data = buildDataPayload(selectedModel, editorValues, true);
      return apiRequest<AdminRow>(`/admin/models/${selectedModel.name}/rows`, {
        method: 'PATCH',
        body: JSON.stringify({ where: selectedWhere, data })
      });
    },
    onSuccess: async (updatedRow) => {
      if (!selectedModel) {
        return;
      }

      setSelectedWhere(buildWhereFromRow(selectedModel, updatedRow));
      setIsCreateMode(false);
      setEditorValues(buildEditorFromRow(selectedModel, updatedRow));
      setStatus({ kind: 'success', message: `Updated row in ${selectedModel.name}` });
      await queryClient.invalidateQueries({ queryKey: ['admin-rows', selectedModel.name] });
    },
    onError: (error) => {
      setStatus({ kind: 'error', message: getErrorMessage(error) });
    }
  });

  const deleteRow = useMutation({
    mutationFn: async () => {
      if (!selectedModel) {
        throw new Error('Select a model first');
      }

      if (!selectedWhere) {
        throw new Error('Choose an existing row before deleting');
      }

      return apiRequest<AdminRow>(`/admin/models/${selectedModel.name}/delete`, {
        method: 'POST',
        body: JSON.stringify({ where: selectedWhere })
      });
    },
    onSuccess: async () => {
      if (!selectedModel) {
        return;
      }

      setStatus({ kind: 'success', message: `Deleted row from ${selectedModel.name}` });
      setIsCreateMode(false);
      setPreferredSelection(null);
      setSelectedWhere(null);
      setEditorValues(buildBlankEditor(selectedModel));
      await queryClient.invalidateQueries({ queryKey: ['admin-rows', selectedModel.name] });
    },
    onError: (error) => {
      setStatus({ kind: 'error', message: getErrorMessage(error) });
    }
  });

  const isSaving = createRow.isPending || updateRow.isPending || deleteRow.isPending;

  if (me.isLoading) {
    return <p className='text-sm text-muted-foreground'>Loading admin access...</p>;
  }

  if (!isAdmin) {
    return (
      <div className='space-y-6'>
        <PageHeader title='Admin' description='Direct database editing is restricted to users with the ADMIN role.' />
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>Your current account does not have permission to use the admin editor.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Admin'
        description='Direct database editor for live PostgreSQL rows. Changes apply immediately and bypass normal business rules.'
        actions={
          <>
            <Button variant='ghost' onClick={() => void refreshRows()} disabled={!selectedModelName || rows.isFetching}>
              <RefreshCw className={cn('mr-2 h-4 w-4', rows.isFetching ? 'animate-spin' : '')} />
              Refresh
            </Button>
            <Button variant='secondary' onClick={startCreateRow} disabled={!selectedModel}>
              <Plus className='mr-2 h-4 w-4' />
              New Row
            </Button>
          </>
        }
      />

      <div className='grid gap-6 xl:grid-cols-[240px_minmax(0,1.4fr)_minmax(360px,1fr)]'>
        <Card className='xl:sticky xl:top-24 xl:h-fit'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Database className='h-4 w-4' />
              Models
            </CardTitle>
            <CardDescription>{models.data?.length || 0} editable Prisma models</CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            {models.isLoading ? (
              <p className='text-sm text-muted-foreground'>Loading models...</p>
            ) : (
              models.data?.map((model) => (
                <button
                  key={model.name}
                  type='button'
                  onClick={() => setSelectedModelName(model.name)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    selectedModelName === model.name
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background hover:bg-muted/50'
                  )}
                >
                  <div className='font-medium'>{model.name}</div>
                  <div className='mt-1 text-xs text-muted-foreground'>
                    PK: {model.primaryKeyFields.join(', ') || 'none'}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedModel ? `${selectedModel.name} rows` : 'Rows'}</CardTitle>
            <CardDescription>
              Click any row to load it into the editor. Search is local across the fetched result set.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-3 md:grid-cols-[minmax(0,1fr)_120px]'>
              <Input
                value={tableFilter}
                onChange={(event) => setTableFilter(event.target.value)}
                placeholder='Filter current rows...'
              />
              <Input
                type='number'
                min='1'
                max='250'
                value={rowLimit}
                onChange={(event) => setRowLimit(event.target.value)}
              />
            </div>

            <div className='rounded-lg border border-border'>
              <div className='max-h-[70vh] overflow-auto'>
                <table className='min-w-full border-collapse text-sm'>
                  <thead className='sticky top-0 z-10 bg-muted/70 backdrop-blur'>
                    <tr>
                      {selectedModel?.fields.map((field) => (
                        <th key={field.name} className='border-b border-border px-3 py-2 text-left font-semibold'>
                          {field.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.isLoading ? (
                      <tr>
                        <td className='px-3 py-6 text-center text-muted-foreground' colSpan={selectedModel?.fields.length || 1}>
                          Loading rows...
                        </td>
                      </tr>
                    ) : filteredRows.length ? (
                      filteredRows.map((row) => {
                        const identity = selectedModel ? buildRowIdentity(selectedModel, row) : '';
                        const active = selectedModel && selectedWhere ? identity === JSON.stringify(selectedWhere) : false;

                        return (
                          <tr
                            key={identity || JSON.stringify(row)}
                            className={cn(
                              'cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40',
                              active ? 'bg-primary/10' : 'bg-background'
                            )}
                            onClick={() => selectRow(row)}
                          >
                            {selectedModel?.fields.map((field) => (
                              <td key={`${identity}-${field.name}`} className='max-w-[240px] px-3 py-2 align-top'>
                                <div className='truncate' title={formatCellValue(row[field.name])}>
                                  {formatCellValue(row[field.name]) || <span className='text-muted-foreground'>empty</span>}
                                </div>
                              </td>
                            ))}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td className='px-3 py-6 text-center text-muted-foreground' colSpan={selectedModel?.fields.length || 1}>
                          {rows.error ? 'Failed to load rows.' : 'No rows found for the current filter.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className='text-xs text-muted-foreground'>
              Showing {filteredRows.length} of {rows.data?.rows.length || 0} fetched rows.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedWhere ? 'Edit row' : 'Create row'}</CardTitle>
            <CardDescription>
              Blank string fields save as empty text. Use <code>null</code> to clear optional values.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {status ? (
              <div
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm',
                  status.kind === 'success'
                    ? 'border-emerald-300/70 bg-emerald-50 text-emerald-800'
                    : 'border-red-300/70 bg-red-50 text-red-700'
                )}
              >
                {status.message}
              </div>
            ) : null}

            {!selectedWhere ? (
              <div className='rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900'>
                Create mode is active. Click a row in the middle table to edit existing data, or keep these fields blank to create a new row.
              </div>
            ) : null}

            <div className='rounded-lg border border-border/70 bg-muted/20 p-3 text-xs'>
              <div className='font-semibold text-foreground'>Row key</div>
              <pre className='mt-2 whitespace-pre-wrap break-words text-muted-foreground'>
                {JSON.stringify(selectedWhere || {}, null, 2)}
              </pre>
            </div>

            <div className='max-h-[50vh] space-y-3 overflow-auto pr-1'>
              {selectedModel?.fields.map((field) => {
                const isPrimaryKey = selectedModel.primaryKeyFields.includes(field.name);
                const disabled = field.isUpdatedAt || (Boolean(selectedWhere) && isPrimaryKey);
                const value = editorValues[field.name] ?? '';
                const useTextarea = field.isList || field.type === 'Json';

                return (
                  <div key={field.name} className='space-y-1.5'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <label className='text-sm font-medium'>{field.name}</label>
                      <span className='rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase text-muted-foreground'>
                        {field.type}
                      </span>
                      {isPrimaryKey ? (
                        <span className='rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary'>PK</span>
                      ) : null}
                      {field.isRequired ? (
                        <span className='rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground'>required</span>
                      ) : null}
                      {field.hasDefaultValue ? (
                        <span className='rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground'>default</span>
                      ) : null}
                    </div>

                    {field.type === 'Boolean' ? (
                      <select
                        className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
                        value={value}
                        disabled={disabled}
                        onChange={(event) =>
                          setEditorValues((current) => ({
                            ...current,
                            [field.name]: event.target.value
                          }))
                        }
                      >
                        <option value=''>Unset</option>
                        <option value='true'>true</option>
                        <option value='false'>false</option>
                        <option value='null'>null</option>
                      </select>
                    ) : useTextarea ? (
                      <textarea
                        className='min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        value={value}
                        disabled={disabled}
                        onChange={(event) =>
                          setEditorValues((current) => ({
                            ...current,
                            [field.name]: event.target.value
                          }))
                        }
                      />
                    ) : (
                      <Input
                        value={value}
                        disabled={disabled}
                        onChange={(event) =>
                          setEditorValues((current) => ({
                            ...current,
                            [field.name]: event.target.value
                          }))
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className='rounded-lg border border-border/70 bg-muted/20 p-3 text-xs'>
              <div className='font-semibold text-foreground'>Payload preview</div>
              <pre className='mt-2 whitespace-pre-wrap break-words text-muted-foreground'>
                {payloadPreview.error || JSON.stringify(payloadPreview.data, null, 2)}
              </pre>
            </div>

            <div className='flex flex-wrap gap-2'>
              {selectedWhere ? (
                <Button onClick={() => updateRow.mutate()} disabled={isSaving || Boolean(payloadPreview.error)}>
                  <Save className='mr-2 h-4 w-4' />
                  Save changes
                </Button>
              ) : (
                <Button onClick={() => createRow.mutate()} disabled={isSaving || Boolean(payloadPreview.error)}>
                  <Plus className='mr-2 h-4 w-4' />
                  Create row
                </Button>
              )}

              <Button variant='ghost' onClick={startCreateRow} disabled={isSaving || !selectedModel}>
                Reset editor
              </Button>

              <Button
                variant='destructive'
                onClick={() => {
                  if (!selectedWhere) {
                    return;
                  }

                  if (window.confirm('Delete this row from the live database?')) {
                    deleteRow.mutate();
                  }
                }}
                disabled={isSaving || !selectedWhere}
              >
                <Trash2 className='mr-2 h-4 w-4' />
                Delete row
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
