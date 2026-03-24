'use client';

import { Badge } from './ui/badge';

interface LiveConnectionBadgeProps {
  state: 'connecting' | 'open' | 'closed' | 'error';
  lastSyncAt?: string;
}

const labelMap: Record<LiveConnectionBadgeProps['state'], string> = {
  connecting: 'Connecting',
  open: 'Live',
  closed: 'Disconnected',
  error: 'Error'
};

const variantMap: Record<LiveConnectionBadgeProps['state'], 'default' | 'success' | 'warning' | 'danger'> = {
  connecting: 'warning',
  open: 'success',
  closed: 'default',
  error: 'danger'
};

export function LiveConnectionBadge({ state, lastSyncAt }: LiveConnectionBadgeProps) {
  return (
    <div className='flex items-center gap-2 rounded-full border border-border/70 bg-white/80 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm dark:bg-slate-950/45'>
      <Badge variant={variantMap[state]}>{labelMap[state]}</Badge>
      <span>{lastSyncAt ? `Last sync ${new Date(lastSyncAt).toLocaleTimeString()}` : 'No sync yet'}</span>
    </div>
  );
}
