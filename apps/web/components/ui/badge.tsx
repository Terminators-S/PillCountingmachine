import { cn } from '../../lib/utils';

export function Badge({
  children,
  variant = 'default'
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const styleMap: Record<string, string> = {
    default: 'border border-slate-200/90 bg-white/82 text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200',
    success: 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
    warning: 'border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    danger: 'border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200'
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
        styleMap[variant]
      )}
    >
      {children}
    </span>
  );
}
