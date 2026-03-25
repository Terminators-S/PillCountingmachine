'use client';

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

export function LiveConnectionBadge({ state, lastSyncAt }: LiveConnectionBadgeProps) {
  const compactTime = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      })
    : '';
  const stateStyles =
    state === 'error'
      ? {
          dot: 'bg-rose-500',
          shell: 'border-rose-200/90 bg-[linear-gradient(135deg,rgba(255,241,242,0.96),rgba(255,255,255,0.92))] text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100'
        }
      : state === 'open'
        ? {
            dot: 'bg-emerald-500',
            shell:
              'border-emerald-200/90 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(239,246,255,0.92))] text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100'
          }
        : state === 'connecting'
          ? {
              dot: 'bg-amber-500',
              shell:
                'border-amber-200/90 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(255,255,255,0.92))] text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100'
            }
          : {
              dot: 'bg-slate-400',
              shell: 'border-border/70 bg-white/78 text-slate-700 dark:bg-slate-950/45 dark:text-slate-100'
            };

  return (
    <div aria-live='polite' className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] shadow-sm ${stateStyles.shell}`}>
      <span className={`h-2 w-2 rounded-full ${stateStyles.dot}`} />
      <span className='font-semibold'>{labelMap[state]}</span>
      <span className='text-[11px] text-current/70'>{compactTime ? `• ${compactTime}` : '• No sync'}</span>
    </div>
  );
}
