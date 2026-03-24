
import { useEffect, useMemo, useRef, useState } from 'react';
import { request } from './lib/api';
import { getProviderIdToken } from './lib/providerAuth';
import { useDashboardData } from './hooks/useDashboardData';
import { StatusCard } from './components/StatusCard';
import { ApiKeyCard } from './components/auth/ApiKeyCard';
import { LoginPage } from './components/auth/LoginPage';
import { StatsGrid } from './components/dashboard/StatsGrid';
import { DashboardToolbar } from './components/dashboard/DashboardToolbar';
import { PillTypeForm } from './components/forms/PillTypeForm';
import { RecordForm } from './components/forms/RecordForm';
import { MachinesTable } from './components/tables/MachinesTable';
import { RecordsTable } from './components/tables/RecordsTable';
import { EventsTable } from './components/tables/EventsTable';
import { JobsTable } from './components/tables/JobsTable';
import { InventoryTable } from './components/tables/InventoryTable';

const STORE_TITLE_KEY = 'pillcountStoreTitle';
const STORE_LOGO_KEY = 'pillcountStoreLogoUrl';
const THEME_KEY = 'pillcountTheme';
const DEFAULT_STORE_TITLE = 'Your Pharmacy Store';
const NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'jobs', label: 'Jobs/Sessions' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'lots', label: 'Lots & Expiry' },
  { id: 'machines', label: 'Machines Fleet' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'reports', label: 'Reports' },
  { id: 'users', label: 'Users & Roles' },
  { id: 'settings', label: 'Settings' },
  { id: 'audit', label: 'Audit Log' },
  { id: 'notifications', label: 'Notifications' }
];

function toCsvValue(value) {
  const normalized = value === null || value === undefined ? '' : String(value);
  if (normalized.includes(',') || normalized.includes('"') || normalized.includes('\n')) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }
  return normalized;
}

function exportRecordsCsv(records) {
  const headers = [
    'id',
    'timestamp',
    'machineId',
    'pillTypeCode',
    'pillName',
    'lotNo',
    'location',
    'operatorId',
    'quantity',
    'status',
    'countMode'
  ];

  const lines = [
    headers.join(','),
    ...records.map((record) =>
      headers.map((key) => toCsvValue(record[key])).join(',')
    )
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `pillcount-records-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function normalizeSearchText(...parts) {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export default function App() {
  const envStoreTitle = (import.meta.env.VITE_STORE_TITLE || '').trim();
  const envStoreLogo = (import.meta.env.VITE_STORE_LOGO_URL || '').trim();

  const {
    health,
    stats,
    pillTypes,
    machines,
    records,
    events,
    jobs,
    inventoryBalances,
    error,
    authToken,
    authRequired,
    isLocked,
    statusText,
    isLoading,
    isRefreshing,
    autoRefresh,
    lastUpdatedAt,
    setAutoRefresh,
    refresh,
    saveToken
  } = useDashboardData();

  const [activePage, setActivePage] = useState('overview');
  const [theme, setTheme] = useState(localStorage.getItem(THEME_KEY) || 'light');
  const [globalSearch, setGlobalSearch] = useState('');
  const [savedView, setSavedView] = useState('default');
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [quickRole, setQuickRole] = useState('admin');
  const [quickCode, setQuickCode] = useState('');
  const [apiKey, setApiKey] = useState(localStorage.getItem('pillcountApiKey') || '');
  const [storeTitle, setStoreTitle] = useState(() =>
    (localStorage.getItem(STORE_TITLE_KEY) || '').trim() || envStoreTitle || DEFAULT_STORE_TITLE
  );
  const [storeLogoUrl, setStoreLogoUrl] = useState(() =>
    (localStorage.getItem(STORE_LOGO_KEY) || '').trim() || envStoreLogo
  );
  const [pillForm, setPillForm] = useState({ code: '', name: '', dosageMg: '', manufacturer: '' });
  const [recordForm, setRecordForm] = useState({
    machineId: '',
    pillTypeCode: '',
    quantity: '',
    lotNo: '',
    expiryDate: '',
    location: '',
    operatorId: ''
  });
  const [jobForm, setJobForm] = useState({
    machineId: '',
    pillTypeCode: '',
    targetQuantity: '',
    lotNo: '',
    operatorId: ''
  });
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [machineQuery, setMachineQuery] = useState('');
  const [recordQuery, setRecordQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toasts, setToasts] = useState([]);
  const toastCounter = useRef(0);

  useEffect(() => {
    const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', normalizedTheme);
    localStorage.setItem(THEME_KEY, normalizedTheme);
  }, [theme]);

  useEffect(() => {
    if (savedView === 'online' && statusFilter !== 'online') {
      setStatusFilter('online');
      return;
    }
    if (savedView === 'offline' && statusFilter !== 'offline') {
      setStatusFilter('offline');
      return;
    }
    if (savedView === 'default' && statusFilter !== 'all') {
      setStatusFilter('all');
    }
  }, [savedView, statusFilter]);

  const pushToast = (type, message) => {
    const normalized = String(message || '').trim();
    if (!normalized) return;

    toastCounter.current += 1;
    const nextToast = { id: toastCounter.current, type, message: normalized };
    setToasts((prev) => [nextToast, ...prev].slice(0, 4));

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== nextToast.id));
    }, 4200);
  };

  useEffect(() => {
    if (actionError) {
      pushToast('error', actionError);
    }
  }, [actionError]);

  useEffect(() => {
    if (actionSuccess) {
      pushToast('success', actionSuccess);
    }
  }, [actionSuccess]);

  const runAction = async (fn, successMessage) => {
    setActionError('');
    setActionSuccess('');
    setIsSubmitting(true);
    try {
      await fn();
      if (successMessage) {
        setActionSuccess(successMessage);
      }
    } catch (nextError) {
      setActionError(nextError.message || 'Action failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveApiKey = () => {
    setActionError('');
    setActionSuccess('');
    if (apiKey.trim()) {
      localStorage.setItem('pillcountApiKey', apiKey.trim());
      setActionSuccess('API key saved.');
    } else {
      localStorage.removeItem('pillcountApiKey');
      setActionSuccess('API key removed.');
    }
  };

  const saveStoreTitle = (nextTitle) => {
    setStoreTitle(nextTitle);
    const normalized = nextTitle.trim();
    if (normalized) {
      localStorage.setItem(STORE_TITLE_KEY, normalized);
    } else {
      localStorage.removeItem(STORE_TITLE_KEY);
    }
  };

  const saveStoreLogoUrl = (nextLogoUrl) => {
    setStoreLogoUrl(nextLogoUrl);
    const normalized = nextLogoUrl.trim();
    if (normalized) {
      localStorage.setItem(STORE_LOGO_KEY, normalized);
    } else {
      localStorage.removeItem(STORE_LOGO_KEY);
    }
  };

  const sendCode = async () => runAction(async () => {
    if (!email.trim()) {
      throw new Error('Email is required');
    }
    await request('/api/auth/request-code', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() })
    });
  }, 'Verification code sent.');

  const verifyCode = async (intent) => runAction(async () => {
    if (!email.trim() || !code.trim()) {
      throw new Error('Email and code are required');
    }
    const result = await request('/api/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), code: code.trim() })
    });

    saveToken(result.token || '');
    setCode('');
    await refresh();
  }, intent === 'signup' ? 'Sign up successful.' : 'Sign in successful.');

  const quickLogin = async () => runAction(async () => {
    if (!quickRole || !quickCode.trim()) {
      throw new Error('Role and quick login code are required');
    }

    const result = await request('/api/auth/quick-login', {
      method: 'POST',
      body: JSON.stringify({ role: quickRole, code: quickCode.trim() })
    });

    if (!result.token) {
      throw new Error('Quick login failed.');
    }

    saveToken(result.token);
    setQuickCode('');
    await refresh();
  }, 'Quick login successful.');

  const providerState = useMemo(() => ({
    google: {
      enabled: Boolean(health?.security?.googleAuthEnabled),
      clientId: health?.security?.googleClientId || ''
    },
    microsoft: {
      enabled: Boolean(health?.security?.microsoftAuthEnabled),
      clientId: health?.security?.microsoftClientId || ''
    },
    apple: {
      enabled: Boolean(health?.security?.appleAuthEnabled),
      clientId: health?.security?.appleClientId || ''
    },
    quickEnabled: Boolean(health?.security?.quickLoginEnabled),
    quickRoles: {
      admin: Boolean(health?.security?.quickLoginRoles?.admin),
      developer: Boolean(health?.security?.quickLoginRoles?.developer),
      operator: Boolean(health?.security?.quickLoginRoles?.operator)
    },
    googleEnabled: Boolean(health?.security?.googleAuthEnabled),
    microsoftEnabled: Boolean(health?.security?.microsoftAuthEnabled),
    appleEnabled: Boolean(health?.security?.appleAuthEnabled)
  }), [health]);

  const providerLogin = async (provider) => runAction(async () => {
    const providerConfig = providerState[provider];
    if (!providerConfig?.enabled) {
      throw new Error(`${provider[0].toUpperCase()}${provider.slice(1)} login is not enabled on backend.`);
    }

    const idToken = await getProviderIdToken(provider, {
      clientId: providerConfig.clientId
    });

    const result = await request(`/api/auth/${provider}`, {
      method: 'POST',
      body: JSON.stringify({ idToken })
    });

    if (!result.token) {
      throw new Error('Provider login failed.');
    }

    saveToken(result.token);
    await refresh();
  }, 'Login successful.');
  const createPillType = async (event) => {
    event.preventDefault();
    await runAction(async () => {
      if (!pillForm.code.trim() || !pillForm.name.trim()) {
        throw new Error('Code and name are required');
      }

      await request('/api/pill-types', {
        method: 'POST',
        body: JSON.stringify({
          ...pillForm,
          code: pillForm.code.trim().toUpperCase(),
          name: pillForm.name.trim(),
          dosageMg: pillForm.dosageMg ? Number(pillForm.dosageMg) : null,
          manufacturer: pillForm.manufacturer.trim() || null
        })
      });
      setPillForm({ code: '', name: '', dosageMg: '', manufacturer: '' });
      await refresh();
    }, 'Pill type created.');
  };

  const createRecord = async (event) => {
    event.preventDefault();
    await runAction(async () => {
      const quantity = Number(recordForm.quantity);
      if (!recordForm.machineId.trim() || !recordForm.pillTypeCode.trim()) {
        throw new Error('Machine ID and pill type are required');
      }
      if (!Number.isInteger(quantity) || quantity < 0) {
        throw new Error('Quantity must be a non-negative integer');
      }

      await request('/api/records', {
        method: 'POST',
        body: JSON.stringify({
          machineId: recordForm.machineId.trim(),
          pillTypeCode: recordForm.pillTypeCode.trim().toUpperCase(),
          quantity,
          status: 'normal',
          countMode: 'manual',
          lotNo: recordForm.lotNo.trim() || null,
          expiryDate: recordForm.expiryDate || null,
          location: recordForm.location.trim() || null,
          operatorId: recordForm.operatorId.trim() || null,
          idempotencyKey: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        })
      });

      setRecordForm({
        machineId: '',
        pillTypeCode: '',
        quantity: '',
        lotNo: '',
        expiryDate: '',
        location: '',
        operatorId: ''
      });
      await refresh();
    }, 'Record saved.');
  };

  const createJob = async (event) => {
    event.preventDefault();
    await runAction(async () => {
      const targetQuantity = Number(jobForm.targetQuantity);
      if (!jobForm.machineId.trim() || !jobForm.pillTypeCode.trim()) {
        throw new Error('Machine ID and pill type are required');
      }
      if (!Number.isInteger(targetQuantity) || targetQuantity < 0) {
        throw new Error('Target quantity must be a non-negative integer');
      }

      await request('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          machineId: jobForm.machineId.trim(),
          pillTypeCode: jobForm.pillTypeCode.trim().toUpperCase(),
          targetQuantity,
          lotNo: jobForm.lotNo.trim() || null,
          operatorId: jobForm.operatorId.trim() || null
        })
      });

      setJobForm({
        machineId: '',
        pillTypeCode: '',
        targetQuantity: '',
        lotNo: '',
        operatorId: ''
      });
      await refresh();
    }, 'Job created.');
  };

  const startJob = async (job) => runAction(async () => {
    await request(`/api/jobs/${encodeURIComponent(job.jobId)}/start`, {
      method: 'POST',
      body: JSON.stringify({
        operatorId: recordForm.operatorId.trim() || job.operatorId || null
      })
    });
    await refresh();
  }, `Job ${job.jobId} started.`);

  const finishJob = async (job) => runAction(async () => {
    const fallbackActual = Number(job.targetQuantity || 0);
    await request(`/api/jobs/${encodeURIComponent(job.jobId)}/finish`, {
      method: 'POST',
      body: JSON.stringify({
        actualQuantity: Number.isFinite(fallbackActual) ? fallbackActual : 0,
        operatorId: recordForm.operatorId.trim() || job.operatorId || null
      })
    });
    await refresh();
  }, `Job ${job.jobId} completed.`);

  const machineSearchText = normalizeSearchText(machineQuery, globalSearch);
  const recordSearchText = normalizeSearchText(recordQuery, globalSearch);

  const filteredMachines = useMemo(() => {
    return machines.filter((machine) => {
      const matchesQuery =
        !machineSearchText ||
        String(machine.machine_id || '').toLowerCase().includes(machineSearchText) ||
        String(machine.location || '').toLowerCase().includes(machineSearchText);
      const matchesStatus = statusFilter === 'all' || machine.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [machines, machineSearchText, statusFilter]);

  const filteredRecords = useMemo(() => {
    const base = records.filter((record) => (
      !recordSearchText ||
      String(record.machineId || '').toLowerCase().includes(recordSearchText) ||
      String(record.pillName || '').toLowerCase().includes(recordSearchText) ||
      String(record.pillTypeCode || '').toLowerCase().includes(recordSearchText) ||
      String(record.lotNo || '').toLowerCase().includes(recordSearchText) ||
      String(record.operatorId || '').toLowerCase().includes(recordSearchText)
    ));

    if (savedView === 'highVolume') {
      return base.filter((record) => Number(record.quantity || 0) >= 100);
    }

    return base;
  }, [records, recordSearchText, savedView]);

  const filteredJobs = useMemo(() => {
    const query = String(globalSearch || '').trim().toLowerCase();
    return jobs.filter((job) => (
      !query ||
      String(job.jobId || '').toLowerCase().includes(query) ||
      String(job.machineId || '').toLowerCase().includes(query) ||
      String(job.pillTypeCode || '').toLowerCase().includes(query) ||
      String(job.operatorId || '').toLowerCase().includes(query)
    ));
  }, [jobs, globalSearch]);

  const notifications = useMemo(() => {
    const items = [];
    if (error) {
      items.push({
        id: 'api-error',
        severity: 'danger',
        title: 'API Refresh Failure',
        detail: error
      });
    }

    if (health && !health.ok) {
      items.push({
        id: 'backend-offline',
        severity: 'danger',
        title: 'Backend Unavailable',
        detail: 'Operations console cannot refresh backend status.'
      });
    }

    if (health && !health.mqtt?.connected) {
      items.push({
        id: 'mqtt-offline',
        severity: 'warn',
        title: 'MQTT Disconnected',
        detail: 'Machine event ingestion is not currently live.'
      });
    }

    const offlineCount = machines.filter((machine) => machine.status === 'offline').length;
    if (offlineCount > 0) {
      items.push({
        id: 'machines-offline',
        severity: 'warn',
        title: `${offlineCount} machine(s) offline`,
        detail: 'Check Fleet page for heartbeat and maintenance actions.'
      });
    }

    if ((stats.activeJobs || 0) > 0) {
      items.push({
        id: 'jobs-active',
        severity: 'info',
        title: `${stats.activeJobs} active job(s)`,
        detail: 'Open Jobs/Sessions to monitor in-progress counts.'
      });
    }

    return items;
  }, [error, health, machines, stats.activeJobs]);

  const activeNav = NAV_ITEMS.find((item) => item.id === activePage) || NAV_ITEMS[0];
  const lastSyncText = lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : 'Waiting for first sync';
  const livePillText = autoRefresh
    ? (isRefreshing ? 'Syncing live data...' : `Live updates active • Last sync ${lastSyncText}`)
    : 'Live updates paused';

  if (authRequired && isLocked) {
    return (
      <div className="layout">
        <StatusCard
          isLocked={isLocked}
          statusText={statusText}
          error={error || actionError}
          lastUpdatedAt={lastUpdatedAt}
          storeTitle={storeTitle}
          storeLogoUrl={storeLogoUrl}
          onStoreTitleChange={saveStoreTitle}
          onStoreLogoUrlChange={saveStoreLogoUrl}
          showLogout={Boolean(authToken)}
          onLogout={() => {
            saveToken('');
            setActionSuccess('Logged out.');
          }}
        />
        {actionSuccess ? <p className="alert alert-success">{actionSuccess}</p> : null}
        <LoginPage
          email={email}
          setEmail={setEmail}
          code={code}
          setCode={setCode}
          quickRole={quickRole}
          setQuickRole={setQuickRole}
          quickCode={quickCode}
          setQuickCode={setQuickCode}
          onSendCode={sendCode}
          onSignIn={() => verifyCode('signin')}
          onSignUp={() => verifyCode('signup')}
          onQuickLogin={quickLogin}
          onProviderLogin={providerLogin}
          isSubmitting={isSubmitting || isLoading}
          providers={providerState}
        />
      </div>
    );
  }

  const renderOverviewPage = () => (
    <>
      <StatusCard
        isLocked={isLocked}
        statusText={statusText}
        error={error}
        lastUpdatedAt={lastUpdatedAt}
        storeTitle={storeTitle}
        storeLogoUrl={storeLogoUrl}
        onStoreTitleChange={saveStoreTitle}
        onStoreLogoUrlChange={saveStoreLogoUrl}
        showLogout={false}
        onLogout={() => {}}
      />

      <DashboardToolbar
        isRefreshing={isRefreshing}
        autoRefresh={autoRefresh}
        setAutoRefresh={setAutoRefresh}
        onRefresh={refresh}
        globalSearch={globalSearch}
        setGlobalSearch={setGlobalSearch}
        machineQuery={machineQuery}
        setMachineQuery={setMachineQuery}
        recordQuery={recordQuery}
        setRecordQuery={setRecordQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        savedView={savedView}
        setSavedView={setSavedView}
        onExportRecords={() => exportRecordsCsv(filteredRecords)}
      />

      <StatsGrid stats={stats} />

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Session</h3>
          <p className="muted small">Authenticated operator session. Actions are audited with request IDs.</p>
          <div className="row">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                saveToken('');
                setActionSuccess('Logged out.');
              }}
            >
              Logout
            </button>
            <button type="button" className="ghost" onClick={refresh} disabled={isRefreshing}>
              {isRefreshing ? 'Refreshing' : 'Sync Now'}
            </button>
          </div>
        </div>
        <ApiKeyCard apiKey={apiKey} setApiKey={setApiKey} onSaveApiKey={saveApiKey} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <PillTypeForm
          pillForm={pillForm}
          setPillForm={setPillForm}
          onSubmit={createPillType}
          isLocked={isLocked || isSubmitting}
        />
        <RecordForm
          recordForm={recordForm}
          setRecordForm={setRecordForm}
          pillTypes={pillTypes}
          onSubmit={createRecord}
          isLocked={isLocked || isSubmitting}
        />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <MachinesTable machines={filteredMachines} />
        <RecordsTable records={filteredRecords} />
      </div>

      <EventsTable events={events} />
    </>
  );

  const renderJobsPage = () => (
    <>
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <form className="card" onSubmit={createJob}>
          <h3>Create Job Session</h3>
          <input
            required
            placeholder="Machine ID"
            value={jobForm.machineId}
            onChange={(event) => setJobForm((prev) => ({ ...prev, machineId: event.target.value }))}
          />
          <select
            required
            value={jobForm.pillTypeCode}
            onChange={(event) => setJobForm((prev) => ({ ...prev, pillTypeCode: event.target.value }))}
          >
            <option value="">Select pill type</option>
            {pillTypes.map((pillType) => (
              <option key={pillType.code} value={pillType.code}>{pillType.code} - {pillType.name}</option>
            ))}
          </select>
          <div className="row">
            <input
              required
              type="number"
              min="0"
              placeholder="Target quantity"
              value={jobForm.targetQuantity}
              onChange={(event) => setJobForm((prev) => ({ ...prev, targetQuantity: event.target.value }))}
            />
            <input
              placeholder="Lot no (optional)"
              value={jobForm.lotNo}
              onChange={(event) => setJobForm((prev) => ({ ...prev, lotNo: event.target.value }))}
            />
          </div>
          <input
            placeholder="Operator ID (optional)"
            value={jobForm.operatorId}
            onChange={(event) => setJobForm((prev) => ({ ...prev, operatorId: event.target.value }))}
          />
          <button disabled={isSubmitting}>Create Job</button>
        </form>
        <div className="card">
          <h3>Live Session Guidance</h3>
          <p className="muted small">
            Start jobs to lock machine context, then complete with final actual quantity. Each completion is traceable
            to machine, operator, lot, and inventory transaction.
          </p>
          <ul className="compact-list">
            <li>Planned: created and awaiting start.</li>
            <li>In Progress: machine is actively counting.</li>
            <li>Completed: finalized and recorded.</li>
          </ul>
        </div>
      </div>
      <JobsTable jobs={filteredJobs} onStartJob={startJob} onFinishJob={finishJob} isBusy={isSubmitting} />
    </>
  );

  const renderInventoryPage = () => (
    <>
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Inventory Operations</h3>
          <p className="muted small">
            Phase 1 includes append-only inventory transactions from count records and event ingestion.
            Reserve/release and FEFO automation are planned next.
          </p>
          <ul className="compact-list">
            <li>Current projection source: `count_recorded` transactions.</li>
            <li>Use global search to find product, lot, or location.</li>
            <li>Export overview records for reconciliation.</li>
          </ul>
        </div>
        <div className="card">
          <h3>Traceability Snapshot</h3>
          <p className="muted small">Every count links machine -&gt; operator -&gt; lot -&gt; inventory transaction.</p>
          <p className="small muted">Latest sync: {lastSyncText}</p>
          <button type="button" className="secondary" onClick={refresh} disabled={isRefreshing}>
            {isRefreshing ? 'Refreshing...' : 'Refresh Inventory Projection'}
          </button>
        </div>
      </div>
      <InventoryTable balances={inventoryBalances} searchText={globalSearch} />
    </>
  );

  const renderMachinesPage = () => (
    <div className="grid grid-2" style={{ marginBottom: 16 }}>
      <MachinesTable machines={filteredMachines} />
      <EventsTable events={events} />
    </div>
  );

  const renderPlaceholderPage = (title, description) => (
    <div className="card placeholder-card">
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      <p className="small muted">
        This section is scaffolded in the enterprise app shell and ready for the next phase implementation.
      </p>
    </div>
  );

  const renderPage = () => {
    if (isLoading) {
      return (
        <div className="grid grid-4">
          <div className="card skeleton-card" />
          <div className="card skeleton-card" />
          <div className="card skeleton-card" />
          <div className="card skeleton-card" />
        </div>
      );
    }

    if (activePage === 'overview') return renderOverviewPage();
    if (activePage === 'jobs') return renderJobsPage();
    if (activePage === 'inventory') return renderInventoryPage();
    if (activePage === 'machines') return renderMachinesPage();
    if (activePage === 'settings') {
      return (
        <div className="grid grid-2">
          <ApiKeyCard apiKey={apiKey} setApiKey={setApiKey} onSaveApiKey={saveApiKey} />
          <StatusCard
            isLocked={isLocked}
            statusText={statusText}
            error={error}
            lastUpdatedAt={lastUpdatedAt}
            storeTitle={storeTitle}
            storeLogoUrl={storeLogoUrl}
            onStoreTitleChange={saveStoreTitle}
            onStoreLogoUrlChange={saveStoreLogoUrl}
            showLogout={false}
            onLogout={() => {}}
          />
        </div>
      );
    }
    if (activePage === 'audit') return <EventsTable events={events} />;
    if (activePage === 'notifications') {
      return (
        <div className="card">
          <h3>Notification Center</h3>
          {notifications.length ? (
            <ul className="notification-list">
              {notifications.map((item) => (
                <li key={item.id} className={`notification-item ${item.severity}`}>
                  <p>{item.title}</p>
                  <p className="small muted">{item.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No active alerts.</p>
          )}
        </div>
      );
    }

    return renderPlaceholderPage(
      activeNav.label,
      'Enterprise section scaffold is in place with navigation, permissions boundary, and page container patterns.'
    );
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="small muted">PillCount Pro</p>
          <h2>Operations Console</h2>
        </div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-link ${activePage === item.id ? 'active' : ''}`}
              onClick={() => setActivePage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="breadcrumbs">Operations Console / {activeNav.label}</p>
            <h1 className="workspace-title">{activeNav.label}</h1>
          </div>
          <div className="topbar-actions">
            <input
              className="top-search"
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              placeholder="Global search..."
              aria-label="Global search"
            />
            <p className={`live-pill ${autoRefresh ? 'live-on' : 'live-off'}`}>{livePillText}</p>
            <button type="button" className="ghost" onClick={() => setShowNotificationsDrawer((prev) => !prev)}>
              Alerts ({notifications.length})
            </button>
            <button type="button" className="ghost" onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}>
              {theme === 'dark' ? 'Light' : 'Dark'} Theme
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                saveToken('');
                setActionSuccess('Logged out.');
              }}
            >
              Logout
            </button>
          </div>
        </header>

        {error ? (
          <div className="offline-banner" role="alert">
            <strong>Connection degraded.</strong> {error}
          </div>
        ) : null}

        <main className="workspace-content">
          {renderPage()}
        </main>
      </div>

      {showNotificationsDrawer ? (
        <aside className="notifications-drawer" aria-label="Notifications drawer">
          <div className="section-title">
            <h3>Active Notifications</h3>
            <button type="button" className="ghost small-btn" onClick={() => setShowNotificationsDrawer(false)}>
              Close
            </button>
          </div>
          {notifications.length ? (
            <ul className="notification-list">
              {notifications.map((item) => (
                <li key={item.id} className={`notification-item ${item.severity}`}>
                  <p>{item.title}</p>
                  <p className="small muted">{item.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No active alerts.</p>
          )}
        </aside>
      ) : null}

      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
