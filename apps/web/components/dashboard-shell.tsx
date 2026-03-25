'use client';

import { useLiveEvents } from '../hooks/use-live-events';
import { AppShell } from './app-shell';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { connectionState, lastSyncAt } = useLiveEvents();

  return (
    <AppShell connectionState={connectionState} lastSyncAt={lastSyncAt}>
      {children}
    </AppShell>
  );
}
