import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, request } from '../lib/api';

const initialStats = {
  totalPills: 0,
  totalRecords: 0,
  totalTypes: 0,
  machinesOnline: 0,
  activeJobs: 0
};

export function useDashboardData() {
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(initialStats);
  const [pillTypes, setPillTypes] = useState([]);
  const [machines, setMachines] = useState([]);
  const [records, setRecords] = useState([]);
  const [events, setEvents] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [inventoryBalances, setInventoryBalances] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [authToken, setAuthToken] = useState(localStorage.getItem('pillcountAuthToken') || '');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const isRefreshingRef = useRef(false);

  const authRequired = health?.security?.authEnabled === true;
  const isLocked = authRequired && !authToken;

  const saveToken = useCallback((token) => {
    setAuthToken(token || '');
    if (token) {
      localStorage.setItem('pillcountAuthToken', token);
    } else {
      localStorage.removeItem('pillcountAuthToken');
    }
  }, []);

  const getHealth = useCallback(async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await request('/api/health', { timeoutMs: 4000 });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new ApiError('Health check failed', 503);
  }, []);

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      setError('');
      const nextHealth = await getHealth();
      setHealth(nextHealth);

      if (nextHealth?.security?.authEnabled && !localStorage.getItem('pillcountAuthToken')) {
        setLastUpdatedAt(Date.now());
        return;
      }

      const [nextStats, nextTypes, nextMachines, nextRecords, nextEvents, nextJobs, nextInventory] = await Promise.all([
        request('/api/stats'),
        request('/api/pill-types'),
        request('/api/machines'),
        request('/api/records?limit=50'),
        request('/api/events?limit=30'),
        request('/api/jobs?limit=50'),
        request('/api/inventory/balances?limit=200')
      ]);

      setStats(nextStats || initialStats);
      setPillTypes(nextTypes || []);
      setMachines(nextMachines || []);
      setRecords(nextRecords || []);
      setEvents(nextEvents || []);
      setJobs(nextJobs || []);
      setInventoryBalances(nextInventory || []);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      if (err instanceof ApiError && err.message === 'UNAUTHORIZED') {
        saveToken('');
      }
      setHealth((prev) => prev || { ok: false, mqtt: { connected: false }, security: { authEnabled: true } });
      setError(err.message || 'Failed to refresh dashboard');
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [getHealth, saveToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }

    const timer = setInterval(refresh, 7000);
    return () => clearInterval(timer);
  }, [autoRefresh, refresh]);

  const statusText = useMemo(() => {
    if (!health && !error) return 'Checking backend...';
    if (!health && error) return 'Backend unavailable';
    if (!health.ok) return 'Backend unavailable';
    if (isLocked) return 'Sign in required';
    return health.mqtt?.connected ? 'API Connected • MQTT Connected' : 'API Connected • MQTT Disabled/Disconnected';
  }, [error, health, isLocked]);

  return {
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
  };
}
