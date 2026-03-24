'use client';

import { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export type WorkspaceTabItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
};

export function WorkspaceTabs({
  items,
  value,
  onValueChange,
  className
}: {
  items: WorkspaceTabItem[];
  value: string;
  onValueChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('surface-panel overflow-x-auto p-1.5', className)}>
      <div className='flex min-w-max gap-1.5'>
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.key === value;

          return (
            <button
              key={item.key}
              type='button'
              onClick={() => onValueChange(item.key)}
              className={cn(
                'group flex min-w-[138px] items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all',
                active
                  ? 'border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(239,246,255,0.92))] text-slate-950 shadow-sm dark:border-emerald-500/30 dark:bg-[linear-gradient(135deg,rgba(6,78,59,0.22),rgba(15,23,42,0.82))] dark:text-slate-50'
                  : 'border-border/70 bg-white/82 text-slate-600 hover:border-slate-300 hover:bg-white dark:bg-slate-950/35 dark:text-slate-300'
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
                  active
                    ? 'border-emerald-200 bg-white text-emerald-700 dark:border-emerald-500/20 dark:bg-slate-900 dark:text-emerald-300'
                    : 'border-border/70 bg-background/80 text-slate-500 group-hover:text-slate-900 dark:bg-slate-900/70 dark:text-slate-300'
                )}
              >
                <Icon className='h-4 w-4' />
              </span>
              <span className='min-w-0'>
                <span className='block text-sm font-semibold'>{item.label}</span>
                {item.hint ? <span className='hidden truncate text-xs text-muted-foreground xl:block'>{item.hint}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
