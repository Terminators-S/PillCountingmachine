'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { CloudCog, KeyRound, Paintbrush2, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { DataTable } from '../../../components/data-table';
import { PageHeader } from '../../../components/page-header';
import { WorkspaceTabs } from '../../../components/workspace-tabs';
import { apiRequest } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import {
  ApiKeyCreateResponse,
  ApiKeyRecord,
  AppBrandingSettings,
  AppRoboflowSettings,
  MachineRuntimeModelCatalog
} from '../../../types/api';

const apiKeyColumns: ColumnDef<ApiKeyRecord>[] = [
  { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span className='font-medium'>{row.original.name}</span> },
  { accessorKey: 'keyPrefix', header: 'Key Prefix' },
  {
    accessorKey: 'scopes',
    header: 'Scopes',
    cell: ({ row }) => (
      <div className='flex flex-wrap gap-1'>
        {row.original.scopes.map((scope) => (
          <Badge key={scope}>{scope}</Badge>
        ))}
      </div>
    )
  },
  {
    accessorKey: 'isActive',
    header: 'State',
    cell: ({ row }) => (row.original.isActive ? <Badge variant='success'>Active</Badge> : <Badge variant='danger'>Revoked</Badge>)
  },
  { accessorKey: 'lastUsedAt', header: 'Last Used', cell: ({ row }) => formatDateTime(row.original.lastUsedAt) },
  { accessorKey: 'createdAt', header: 'Created', cell: ({ row }) => formatDateTime(row.original.createdAt) }
];

const defaultBrandingForm: AppBrandingSettings = {
  productName: 'PillCount Operations Console',
  organizationName: 'Pharmacy Operations',
  logoUrl: '',
  supportLabel: 'Real-time machine control',
  welcomeMessage: 'Live pill counting, machine monitoring, exports, and audit-ready operations in one place.',
  accentNote: 'Use the live dashboard for camera control, model switching, and session exports.',
  headerEyebrow: 'Operations command layer',
  headerSummary: 'Track machine status, move between workflows faster, and keep the operator focused on the current run.',
  liveTagline: 'Monitor your machine, model, and count stream in real time.',
  authHeadline: 'Secure operator sign-in',
  authSubheadline: 'Access the pharmacy and warehouse workflow with your staff account.'
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'brand' | 'models' | 'keys'>('brand');
  const [brandingForm, setBrandingForm] = useState<AppBrandingSettings>(defaultBrandingForm);
  const [brandingLoaded, setBrandingLoaded] = useState(false);
  const [roboflowLoaded, setRoboflowLoaded] = useState(false);
  const [roboflowApiKey, setRoboflowApiKey] = useState('');
  const [defaultModelKey, setDefaultModelKey] = useState('');
  const [deploymentTarget, setDeploymentTarget] = useState<'hosted' | 'ondevice'>('hosted');
  const [inferenceServerUrl, setInferenceServerUrl] = useState('http://127.0.0.1:9001');
  const [deviceProfile, setDeviceProfile] = useState<'desktop' | 'raspberry-pi-5'>('desktop');
  const [modelForm, setModelForm] = useState({
    reference: '',
    name: '',
    classes: 'pill, tablet',
    notes: '',
    recommendedForCounting: true,
    makeDefault: true,
    apiKey: '',
    deploymentTarget: 'hosted' as 'hosted' | 'ondevice',
    inferenceServerUrl: 'http://127.0.0.1:9001'
  });
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState('machine:write,events:write');
  const [plainKey, setPlainKey] = useState('');

  const branding = useQuery({
    queryKey: ['app-settings', 'branding'],
    queryFn: () => apiRequest<AppBrandingSettings>('/app-settings/branding')
  });

  const roboflow = useQuery({
    queryKey: ['app-settings', 'roboflow'],
    queryFn: () => apiRequest<AppRoboflowSettings>('/app-settings/roboflow')
  });

  const runtimeCatalog = useQuery({
    queryKey: ['machine-runtime', 'catalog'],
    queryFn: () => apiRequest<MachineRuntimeModelCatalog>('/machine-runtime/catalog/models')
  });

  const apiKeys = useQuery({
    queryKey: ['api-keys', 'list'],
    queryFn: () => apiRequest<ApiKeyRecord[]>('/api-keys')
  });

  useEffect(() => {
    if (!branding.data || brandingLoaded) {
      return;
    }

    setBrandingForm(branding.data);
    setBrandingLoaded(true);
  }, [branding.data, brandingLoaded]);

  useEffect(() => {
    if (!roboflow.data || roboflowLoaded) {
      return;
    }

    setDefaultModelKey(roboflow.data.defaultModelKey || '');
    setDeploymentTarget(roboflow.data.deploymentTarget || 'hosted');
    setInferenceServerUrl(roboflow.data.inferenceServerUrl || 'http://127.0.0.1:9001');
    setDeviceProfile(roboflow.data.deviceProfile || 'desktop');
    setModelForm((prev) => ({
      ...prev,
      deploymentTarget: roboflow.data.deploymentTarget || 'hosted',
      inferenceServerUrl: roboflow.data.inferenceServerUrl || 'http://127.0.0.1:9001'
    }));
    setRoboflowLoaded(true);
  }, [roboflow.data, roboflowLoaded]);

  const brandInitials = useMemo(() => {
    const source = brandingForm.organizationName || brandingForm.productName;
    return (
      source
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((segment) => segment[0]?.toUpperCase() || '')
        .join('') || 'PC'
    );
  }, [brandingForm.organizationName, brandingForm.productName]);

  const preferredModelOptions = useMemo(() => runtimeCatalog.data?.models || [], [runtimeCatalog.data?.models]);

  const saveBranding = useMutation({
    mutationFn: () =>
      apiRequest<AppBrandingSettings>('/app-settings/branding', {
        method: 'PUT',
        body: JSON.stringify(brandingForm)
      }),
    onSuccess: async (payload) => {
      setBrandingForm(payload);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['app-settings', 'branding'] }),
        queryClient.invalidateQueries({ queryKey: ['app-settings', 'public'] })
      ]);
    }
  });

  const saveRoboflowConfig = useMutation({
    mutationFn: (payload: {
      apiKey?: string;
      clearApiKey?: boolean;
      defaultModelKey?: string;
      deploymentTarget?: 'hosted' | 'ondevice';
      inferenceServerUrl?: string;
      deviceProfile?: 'desktop' | 'raspberry-pi-5';
    }) =>
      apiRequest<AppRoboflowSettings>('/app-settings/roboflow', {
        method: 'PUT',
        body: JSON.stringify(payload)
      }),
    onSuccess: async (payload) => {
      setRoboflowApiKey('');
      setDefaultModelKey(payload.defaultModelKey || '');
      setDeploymentTarget(payload.deploymentTarget);
      setInferenceServerUrl(payload.inferenceServerUrl);
      setDeviceProfile(payload.deviceProfile);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['app-settings', 'roboflow'] }),
        queryClient.invalidateQueries({ queryKey: ['machine-runtime', 'catalog'] })
      ]);
    }
  });

  const addRoboflowModel = useMutation({
    mutationFn: () =>
      apiRequest<AppRoboflowSettings>('/app-settings/roboflow/models', {
        method: 'POST',
        body: JSON.stringify({
          reference: modelForm.reference,
          name: modelForm.name || undefined,
          classes: modelForm.classes
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
          notes: modelForm.notes || undefined,
          recommendedForCounting: modelForm.recommendedForCounting,
          makeDefault: modelForm.makeDefault,
          apiKey: modelForm.apiKey || undefined,
          deploymentTarget: modelForm.deploymentTarget,
          inferenceServerUrl: modelForm.deploymentTarget === 'ondevice' ? modelForm.inferenceServerUrl || undefined : undefined
        })
      }),
    onSuccess: async (payload) => {
      setModelForm({
        reference: '',
        name: '',
        classes: 'pill, tablet',
        notes: '',
        recommendedForCounting: true,
        makeDefault: true,
        apiKey: '',
        deploymentTarget: payload.deploymentTarget,
        inferenceServerUrl: payload.inferenceServerUrl
      });
      setDefaultModelKey(payload.defaultModelKey || '');
      setDeploymentTarget(payload.deploymentTarget);
      setInferenceServerUrl(payload.inferenceServerUrl);
      setDeviceProfile(payload.deviceProfile);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['app-settings', 'roboflow'] }),
        queryClient.invalidateQueries({ queryKey: ['machine-runtime', 'catalog'] })
      ]);
    }
  });

  const removeRoboflowModel = useMutation({
    mutationFn: (modelKey: string) =>
      apiRequest<AppRoboflowSettings>(`/app-settings/roboflow/models/${encodeURIComponent(modelKey)}`, {
        method: 'DELETE'
      }),
    onSuccess: async (payload) => {
      setDefaultModelKey(payload.defaultModelKey || '');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['app-settings', 'roboflow'] }),
        queryClient.invalidateQueries({ queryKey: ['machine-runtime', 'catalog'] })
      ]);
    }
  });

  const createKey = useMutation({
    mutationFn: () =>
      apiRequest<ApiKeyCreateResponse>('/api-keys', {
        method: 'POST',
        body: JSON.stringify({
          name,
          scopes: scopes
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
        })
      }),
    onSuccess: async (payload) => {
      setPlainKey(payload.plainKey);
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['api-keys', 'list'] });
    }
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api-keys/${id}`, {
        method: 'DELETE'
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['api-keys', 'list'] });
    }
  });

  const customModels = roboflow.data?.customModels || [];
  const settingsError =
    saveBranding.error instanceof Error
      ? saveBranding.error.message
      : saveRoboflowConfig.error instanceof Error
        ? saveRoboflowConfig.error.message
        : addRoboflowModel.error instanceof Error
          ? addRoboflowModel.error.message
          : '';

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Settings'
        description='Customize the product identity, the global shell header, Roboflow onboarding, and machine access from one control surface.'
        eyebrow='System customization'
      />

      <WorkspaceTabs
        value={activeTab}
        onValueChange={(key) => setActiveTab(key as 'brand' | 'models' | 'keys')}
        items={[
          { key: 'brand', label: 'Brand Studio', icon: Paintbrush2, hint: 'Logo, header, login copy' },
          { key: 'models', label: 'Roboflow Setup', icon: CloudCog, hint: 'Runtime, model import, Pi profile' },
          { key: 'keys', label: 'API Keys', icon: KeyRound, hint: 'Machine-side credentials' }
        ]}
      />

      {activeTab === 'brand' ? (
      <section className='grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_380px]'>
        <Card>
          <CardHeader>
            <div className='flex items-center gap-3'>
              <div className='rounded-2xl bg-[linear-gradient(145deg,rgba(15,23,42,0.98),rgba(13,148,136,0.92))] p-3 text-white shadow-lg'>
                <Paintbrush2 className='h-5 w-5' />
              </div>
              <div>
                <CardTitle>Brand Studio</CardTitle>
                <CardDescription>Change the product name, logo, shell header messaging, and login copy shown across the website.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div>
                <label className='field-label'>Product Name</label>
                <Input value={brandingForm.productName} onChange={(event) => setBrandingForm((prev) => ({ ...prev, productName: event.target.value }))} />
              </div>
              <div>
                <label className='field-label'>Organization Name</label>
                <Input value={brandingForm.organizationName} onChange={(event) => setBrandingForm((prev) => ({ ...prev, organizationName: event.target.value }))} />
              </div>
              <div className='sm:col-span-2'>
                <label className='field-label'>Logo URL</label>
                <Input value={brandingForm.logoUrl} onChange={(event) => setBrandingForm((prev) => ({ ...prev, logoUrl: event.target.value }))} placeholder='https://your-domain/logo.png' />
              </div>
              <div>
                <label className='field-label'>Support Label</label>
                <Input value={brandingForm.supportLabel} onChange={(event) => setBrandingForm((prev) => ({ ...prev, supportLabel: event.target.value }))} />
              </div>
              <div>
                <label className='field-label'>Live Tagline</label>
                <Input value={brandingForm.liveTagline} onChange={(event) => setBrandingForm((prev) => ({ ...prev, liveTagline: event.target.value }))} />
              </div>
              <div>
                <label className='field-label'>Header Eyebrow</label>
                <Input value={brandingForm.headerEyebrow} onChange={(event) => setBrandingForm((prev) => ({ ...prev, headerEyebrow: event.target.value }))} />
              </div>
              <div>
                <label className='field-label'>Header Summary</label>
                <Input value={brandingForm.headerSummary} onChange={(event) => setBrandingForm((prev) => ({ ...prev, headerSummary: event.target.value }))} />
              </div>
              <div className='sm:col-span-2'>
                <label className='field-label'>Welcome Message</label>
                <Input value={brandingForm.welcomeMessage} onChange={(event) => setBrandingForm((prev) => ({ ...prev, welcomeMessage: event.target.value }))} />
              </div>
              <div className='sm:col-span-2'>
                <label className='field-label'>Accent Note</label>
                <Input value={brandingForm.accentNote} onChange={(event) => setBrandingForm((prev) => ({ ...prev, accentNote: event.target.value }))} />
              </div>
              <div>
                <label className='field-label'>Login Headline</label>
                <Input value={brandingForm.authHeadline} onChange={(event) => setBrandingForm((prev) => ({ ...prev, authHeadline: event.target.value }))} />
              </div>
              <div>
                <label className='field-label'>Login Subheadline</label>
                <Input value={brandingForm.authSubheadline} onChange={(event) => setBrandingForm((prev) => ({ ...prev, authSubheadline: event.target.value }))} />
              </div>
            </div>

            <div className='flex flex-wrap items-center gap-3'>
              <Button onClick={() => saveBranding.mutate()} disabled={saveBranding.isPending}>
                {saveBranding.isPending ? 'Saving branding...' : 'Save Branding'}
              </Button>
              {branding.isLoading ? <span className='text-sm text-muted-foreground'>Loading current branding...</span> : null}
            </div>
          </CardContent>
        </Card>

        <Card className='bg-[linear-gradient(165deg,rgba(15,23,42,0.98),rgba(8,145,178,0.9)_58%,rgba(16,185,129,0.84))] text-white'>
          <CardHeader>
            <CardTitle>Brand Preview</CardTitle>
            <CardDescription className='text-white/74'>This is how the current logo, shell header, and login language will feel in the product.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='rounded-[24px] border border-white/12 bg-white/10 p-4 backdrop-blur'>
              <div className='flex items-center gap-3'>
                {brandingForm.logoUrl ? (
                  <img src={brandingForm.logoUrl} alt='Brand logo preview' className='h-14 w-14 rounded-2xl border border-white/20 bg-white/10 object-cover' />
                ) : (
                  <div className='flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 text-lg font-bold tracking-wide'>{brandInitials}</div>
                )}
                <div>
                  <p className='text-[11px] uppercase tracking-[0.24em] text-white/65'>{brandingForm.supportLabel}</p>
                  <p className='mt-2 text-lg font-semibold'>{brandingForm.organizationName}</p>
                  <p className='text-sm text-white/72'>{brandingForm.productName}</p>
                </div>
              </div>
            </div>

            <div className='rounded-[24px] border border-white/12 bg-white/10 p-4 backdrop-blur'>
              <p className='text-[11px] uppercase tracking-[0.24em] text-white/60'>Shell header</p>
              <p className='mt-3 text-sm font-semibold'>{brandingForm.headerEyebrow}</p>
              <p className='mt-2 text-sm leading-6 text-white/80'>{brandingForm.headerSummary}</p>
            </div>

            <div className='rounded-[24px] border border-white/12 bg-white/10 p-4 backdrop-blur'>
              <p className='text-sm font-semibold'>{brandingForm.authHeadline}</p>
              <p className='mt-2 text-sm leading-6 text-white/78'>{brandingForm.authSubheadline}</p>
              <p className='mt-4 text-xs uppercase tracking-[0.24em] text-white/60'>Live message</p>
              <p className='mt-2 text-sm text-white/80'>{brandingForm.liveTagline}</p>
            </div>

            <p className='text-sm leading-6 text-white/74'>{brandingForm.welcomeMessage}</p>
          </CardContent>
        </Card>
      </section>
      ) : null}

      {activeTab === 'models' ? (
      <section className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
        <Card>
          <CardHeader>
            <div className='flex items-center gap-3'>
              <div className='rounded-xl bg-emerald-600 p-2 text-white'>
                <CloudCog className='h-5 w-5' />
              </div>
              <div>
                <CardTitle>Roboflow Live Model Onboarding</CardTitle>
                <CardDescription>Paste a Roboflow Universe URL, serverless inference URL, or model ID and the live dashboard will offer it immediately. On-device mode is tuned for Raspberry Pi 5.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-5'>
            <div className='rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-slate-700'>
              <p className='font-semibold text-slate-900'>Accepted formats</p>
              <p className='mt-2'>`https://universe.roboflow.com/.../project/model/3`</p>
              <p>`https://serverless.roboflow.com/project/3?api_key=...`</p>
              <p>`project/3`</p>
              <p className='mt-3 text-xs text-slate-600'>For Raspberry Pi 5, use the Universe URL or `project/3`, then set the target to `On-device Inference Server` and keep the server URL on `http://127.0.0.1:9001`.</p>
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='sm:col-span-2'>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Roboflow API Key</label>
                <Input value={roboflowApiKey} onChange={(event) => setRoboflowApiKey(event.target.value)} placeholder={roboflow.data?.hasApiKey ? 'Stored key is already available' : 'Paste your Roboflow API key'} />
                <p className='mt-2 text-xs text-muted-foreground'>
                  {roboflow.data?.hasApiKey ? `Stored key: ${roboflow.data.apiKeyPreview}` : 'No Roboflow API key stored yet.'}
                </p>
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Roboflow Deployment Target</label>
                <select
                  className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
                  value={deploymentTarget}
                  onChange={(event) => {
                    const nextValue = event.target.value as 'hosted' | 'ondevice';
                    setDeploymentTarget(nextValue);
                    setModelForm((prev) => ({ ...prev, deploymentTarget: nextValue }));
                  }}
                >
                  <option value='hosted'>Hosted API</option>
                  <option value='ondevice'>On-device Inference Server</option>
                </select>
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Runtime Device Profile</label>
                <select
                  className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
                  value={deviceProfile}
                  onChange={(event) => setDeviceProfile(event.target.value as 'desktop' | 'raspberry-pi-5')}
                >
                  <option value='desktop'>Desktop / laptop</option>
                  <option value='raspberry-pi-5'>Raspberry Pi 5</option>
                </select>
              </div>
              <div className='sm:col-span-2'>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>On-device Inference Server URL</label>
                <Input
                  value={inferenceServerUrl}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setInferenceServerUrl(nextValue);
                    setModelForm((prev) => ({ ...prev, inferenceServerUrl: nextValue }));
                  }}
                  placeholder='http://127.0.0.1:9001'
                />
                <p className='mt-2 text-xs text-muted-foreground'>Leave this on localhost when the API, UI, and Roboflow Inference Server all run on the same Raspberry Pi 5.</p>
              </div>
              <div>
                <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Preferred Live Model</label>
                <select
                  className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
                  value={defaultModelKey}
                  onChange={(event) => setDefaultModelKey(event.target.value)}
                >
                  <option value=''>Use base catalog default</option>
                  {preferredModelOptions.map((model) => (
                    <option key={model.key} value={model.key}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className='flex items-end gap-2'>
                <Button
                  variant='secondary'
                  className='flex-1'
                  disabled={
                    saveRoboflowConfig.isPending ||
                    (!roboflowApiKey.trim() &&
                      defaultModelKey === (roboflow.data?.defaultModelKey || '') &&
                      deploymentTarget === (roboflow.data?.deploymentTarget || 'hosted') &&
                      inferenceServerUrl === (roboflow.data?.inferenceServerUrl || 'http://127.0.0.1:9001') &&
                      deviceProfile === (roboflow.data?.deviceProfile || 'desktop'))
                  }
                  onClick={() =>
                    saveRoboflowConfig.mutate({
                      apiKey: roboflowApiKey.trim() || undefined,
                      defaultModelKey,
                      deploymentTarget,
                      inferenceServerUrl,
                      deviceProfile
                    })
                  }
                >
                  {saveRoboflowConfig.isPending ? 'Saving...' : 'Save Roboflow Setup'}
                </Button>
                <Button
                  variant='ghost'
                  disabled={saveRoboflowConfig.isPending || !roboflow.data?.hasApiKey}
                  onClick={() => saveRoboflowConfig.mutate({ clearApiKey: true, defaultModelKey })}
                >
                  Clear Key
                </Button>
              </div>
            </div>

            <div className='rounded-2xl border border-border/70 p-4'>
              <p className='text-sm font-semibold text-slate-900'>Add or update a Roboflow model</p>
              <div className='mt-4 grid gap-4 sm:grid-cols-2'>
                <div className='sm:col-span-2'>
                  <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Roboflow Reference</label>
                  <Input
                    value={modelForm.reference}
                    onChange={(event) => setModelForm((prev) => ({ ...prev, reference: event.target.value }))}
                    placeholder='Paste the Roboflow model URL or project/3'
                  />
                </div>
                <div>
                  <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Display Name</label>
                  <Input value={modelForm.name} onChange={(event) => setModelForm((prev) => ({ ...prev, name: event.target.value }))} placeholder='Optional custom name' />
                </div>
                <div>
                  <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Classes</label>
                  <Input value={modelForm.classes} onChange={(event) => setModelForm((prev) => ({ ...prev, classes: event.target.value }))} placeholder='pill, tablet' />
                </div>
                <div className='sm:col-span-2'>
                  <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Notes</label>
                  <Input value={modelForm.notes} onChange={(event) => setModelForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder='Optional operator note for this model' />
                </div>
                <div className='sm:col-span-2'>
                  <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Optional API Key For This Import</label>
                  <Input value={modelForm.apiKey} onChange={(event) => setModelForm((prev) => ({ ...prev, apiKey: event.target.value }))} placeholder='Optional. Stored as the active Roboflow API key if provided.' />
                </div>
                <div>
                  <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Run This Model Via</label>
                  <select
                    className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
                    value={modelForm.deploymentTarget}
                    onChange={(event) => setModelForm((prev) => ({ ...prev, deploymentTarget: event.target.value as 'hosted' | 'ondevice' }))}
                  >
                    <option value='hosted'>Hosted API</option>
                    <option value='ondevice'>On-device Inference Server</option>
                  </select>
                </div>
                <div>
                  <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Inference Server URL</label>
                  <Input
                    value={modelForm.inferenceServerUrl}
                    onChange={(event) => setModelForm((prev) => ({ ...prev, inferenceServerUrl: event.target.value }))}
                    placeholder='http://127.0.0.1:9001'
                    disabled={modelForm.deploymentTarget !== 'ondevice'}
                  />
                </div>
              </div>

              <div className='mt-4 flex flex-wrap items-center gap-4'>
                <label className='inline-flex items-center gap-2 text-sm text-slate-700'>
                  <input
                    type='checkbox'
                    checked={modelForm.recommendedForCounting}
                    onChange={(event) => setModelForm((prev) => ({ ...prev, recommendedForCounting: event.target.checked }))}
                  />
                  Recommended for counting
                </label>
                <label className='inline-flex items-center gap-2 text-sm text-slate-700'>
                  <input
                    type='checkbox'
                    checked={modelForm.makeDefault}
                    onChange={(event) => setModelForm((prev) => ({ ...prev, makeDefault: event.target.checked }))}
                  />
                  Make it the preferred live model
                </label>
              </div>

              <div className='mt-4'>
                <Button disabled={addRoboflowModel.isPending || !modelForm.reference.trim()} onClick={() => addRoboflowModel.mutate()}>
                  {addRoboflowModel.isPending ? 'Importing model...' : 'Add Roboflow Model'}
                </Button>
              </div>
            </div>

            {settingsError ? <div className='rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700'>{settingsError}</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Imported Roboflow Models</CardTitle>
            <CardDescription>Custom hosted models appear here and on the live dashboard model list as soon as they are saved.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {customModels.length ? (
              customModels.map((model) => (
                <div key={model.key} className='rounded-2xl border border-border/70 p-4'>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div>
                      <div className='flex flex-wrap items-center gap-2'>
                        <p className='text-sm font-semibold text-slate-900'>{model.name}</p>
                        <Badge variant='warning'>Roboflow</Badge>
                        <Badge variant='default'>Custom</Badge>
                        <Badge variant={model.deploymentTarget === 'ondevice' ? 'success' : 'warning'}>
                          {model.deploymentTarget === 'ondevice' ? 'On-device' : 'Hosted'}
                        </Badge>
                        {roboflow.data?.defaultModelKey === model.key ? <Badge variant='success'>Preferred live model</Badge> : null}
                      </div>
                      <p className='mt-2 text-sm text-slate-600'>{model.notes || 'No notes added.'}</p>
                    </div>
                    <Button variant='ghost' size='sm' disabled={removeRoboflowModel.isPending} onClick={() => removeRoboflowModel.mutate(model.key)}>
                      <Trash2 className='mr-2 h-4 w-4' />
                      Remove
                    </Button>
                  </div>

                  <div className='mt-4 grid gap-3 sm:grid-cols-2'>
                    <div className='rounded-xl border border-border/60 bg-muted/20 p-3'>
                      <p className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>Model key</p>
                      <p className='mt-1 text-sm font-medium text-foreground'>{model.key}</p>
                    </div>
                    <div className='rounded-xl border border-border/60 bg-muted/20 p-3'>
                      <p className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>Model ID</p>
                      <p className='mt-1 text-sm font-medium text-foreground'>{model.modelId || 'n/a'}</p>
                    </div>
                    <div className='rounded-xl border border-border/60 bg-muted/20 p-3 sm:col-span-2'>
                      <p className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>Source</p>
                      <p className='mt-1 break-all text-sm font-medium text-foreground'>{model.sourceUrl || 'n/a'}</p>
                    </div>
                    {model.deploymentTarget === 'ondevice' ? (
                      <div className='rounded-xl border border-border/60 bg-muted/20 p-3 sm:col-span-2'>
                        <p className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>Inference Server</p>
                        <p className='mt-1 break-all text-sm font-medium text-foreground'>{model.inferenceServerUrl || 'http://127.0.0.1:9001'}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className='rounded-2xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground'>
                No custom Roboflow models yet. Paste a model reference on the left to make it available in the live dashboard.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
      ) : null}

      {activeTab === 'keys' ? (
      <Card>
        <CardHeader>
          <div className='flex items-center gap-3'>
            <div className='rounded-xl bg-slate-900 p-2 text-white'>
              <KeyRound className='h-5 w-5' />
            </div>
            <div>
              <CardTitle>Machine API Keys</CardTitle>
              <CardDescription>Generate API keys for firmware clients and machine-side event writers.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-3 md:grid-cols-3'>
            <div>
              <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Key Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='Warehouse Robot Key' />
            </div>
            <div>
              <label className='mb-1 block text-xs font-semibold uppercase text-muted-foreground'>Scopes</label>
              <Input value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder='machine:write,events:write' />
            </div>
            <div className='flex items-end'>
              <Button onClick={() => createKey.mutate()} disabled={createKey.isPending || !name.trim()} className='w-full'>
                {createKey.isPending ? 'Creating...' : 'Create API Key'}
              </Button>
            </div>
          </div>

          {plainKey ? (
            <div className='rounded-md border border-emerald-300/70 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'>
              Save now: <code className='font-mono'>{plainKey}</code>
            </div>
          ) : null}

          {apiKeys.data ? (
            <DataTable
              columns={apiKeyColumns}
              data={apiKeys.data}
              searchPlaceholder='Search API keys...'
              renderRowActions={(row) => (
                <Button size='sm' variant='ghost' disabled={!row.isActive || revokeKey.isPending} onClick={() => revokeKey.mutate(row.id)}>
                  Revoke
                </Button>
              )}
            />
          ) : apiKeys.isLoading ? (
            <p className='text-sm text-muted-foreground'>Loading API keys...</p>
          ) : (
            <p className='text-sm text-red-600'>Failed to load API keys.</p>
          )}
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}
