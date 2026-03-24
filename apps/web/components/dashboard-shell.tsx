'use client';

import { useLiveEvents } from '../hooks/use-live-events';
import { AppShell } from './app-shell';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { connectionState, events, lastSyncAt } = useLiveEvents();

  return (
    <AppShell connectionState={connectionState} lastSyncAt={lastSyncAt}>
      {connectionState === 'error' ? (
        <div className='rounded-xl border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'>
          Live updates connection lost. Retrying in background.
        </div>
      ) : null}
      {connectionState === 'open' && events.length > 0 ? (
        <div className='rounded-xl border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'>
          Live updates active. Latest event: <span className='font-medium'>{events[0]?.type}</span>
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}
