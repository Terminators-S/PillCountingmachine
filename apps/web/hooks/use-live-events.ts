'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_STATE_EVENT, getDemoLiveEvents, isDemoMode } from '../lib/demo-api';
import { getApiBaseUrl, refreshAccessToken } from '../lib/api';
import { getAccessToken } from '../lib/auth';

export interface LiveEvent {
  type: string;
  payload: Record<string, unknown>;
  emittedAt: string;
}

export function useLiveEvents() {
  const [connectionState, setConnectionState] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const [lastSyncAt, setLastSyncAt] = useState<string>('');
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    let disposed = false;

    const closeSource = () => {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    if (isDemoMode()) {
      const syncDemoEvents = () => {
        const demoEvents = getDemoLiveEvents().map((event) => ({
          type: event.type,
          payload: event.payload,
          emittedAt: event.emittedAt
        }));
        setEvents(demoEvents);
        setConnectionState('open');
        setLastSyncAt(demoEvents[0]?.emittedAt || new Date().toISOString());
      };

      syncDemoEvents();
      window.addEventListener(DEMO_STATE_EVENT, syncDemoEvents);

      return () => {
        disposed = true;
        window.removeEventListener(DEMO_STATE_EVENT, syncDemoEvents);
        clearReconnectTimeout();
        closeSource();
        setConnectionState('closed');
      };
    }

    const scheduleReconnect = () => {
      if (disposed || reconnectTimeoutRef.current !== null) {
        return;
      }

      const retryDelayMs = Math.min(1000 * 2 ** Math.min(reconnectAttemptsRef.current, 3), 8000);
      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectTimeoutRef.current = null;
        void connect(true);
      }, retryDelayMs);
    };

    const connect = async (forceRefresh = false) => {
      clearReconnectTimeout();
      closeSource();

      let token = getAccessToken();
      if (forceRefresh) {
        token = (await refreshAccessToken()) || getAccessToken() || token;
      } else if (!token) {
        token = await refreshAccessToken();
      }

      if (disposed) {
        return;
      }

      if (!token) {
        setConnectionState('closed');
        return;
      }

      setConnectionState('connecting');

      const source = new EventSource(`${getApiBaseUrl()}/live/events?token=${encodeURIComponent(token)}`);
      sourceRef.current = source;

      source.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setConnectionState('open');
        setLastSyncAt(new Date().toISOString());
      };

      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const normalized: LiveEvent = {
            type: data.type || 'message',
            payload: data.payload || {},
            emittedAt: data.emittedAt || new Date().toISOString()
          };
          setEvents((prev) => [normalized, ...prev].slice(0, 30));
          setLastSyncAt(new Date().toISOString());
        } catch (_error) {
          // Ignore malformed SSE payloads
        }
      };

      source.onerror = () => {
        closeSource();
        reconnectAttemptsRef.current += 1;
        setConnectionState('error');
        scheduleReconnect();
      };
    };

    void connect();

    return () => {
      disposed = true;
      clearReconnectTimeout();
      closeSource();
      setConnectionState('closed');
    };
  }, []);

  return useMemo(
    () => ({
      connectionState,
      lastSyncAt,
      events
    }),
    [connectionState, lastSyncAt, events]
  );
}


