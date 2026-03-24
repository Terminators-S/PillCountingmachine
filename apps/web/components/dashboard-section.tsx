import { ReactNode } from 'react';
import { AlertCircle, LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export function SectionHeader({
  title,
  description,
  actions,
  eyebrow,
  className
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className='min-w-0 space-y-1'>
        {eyebrow ? <p className='text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground'>{eyebrow}</p> : null}
        <div>
          <h2 className='text-base font-semibold tracking-tight text-slate-950 dark:text-slate-50'>{title}</h2>
          {description ? <p className='mt-1 text-sm text-muted-foreground'>{description}</p> : null}
        </div>
      </div>
      {actions ? <div className='flex shrink-0 flex-wrap items-center gap-2'>{actions}</div> : null}
    </div>
  );
}

export function CompactEmptyState({
  title,
  message,
  action,
  icon: Icon = AlertCircle,
  className
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-dashed border-border/80 bg-muted/15 px-4 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]',
        className
      )}
    >
      <div className='mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-white/85 text-slate-500 shadow-sm dark:bg-slate-900/70 dark:text-slate-300'>
        <Icon className='h-5 w-5' />
      </div>
      <p className='mt-3 text-sm font-semibold text-slate-900 dark:text-slate-50'>{title}</p>
      {message ? <p className='mt-1 text-sm text-muted-foreground'>{message}</p> : null}
      {action ? <div className='mt-3 flex justify-center'>{action}</div> : null}
    </div>
  );
}
