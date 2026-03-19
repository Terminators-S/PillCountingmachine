import { ReactNode } from 'react';
import { Card, CardContent } from './ui/card';

export function StatCard({ label, value, hint, icon }: { label: string; value: string | number; hint?: string; icon?: ReactNode }) {
  return (
    <Card className='overflow-hidden'>
      <CardContent className='p-5'>
        <div className='flex items-center justify-between gap-3'>
          <p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground'>{label}</p>
          {icon ? <div className='rounded-2xl border border-border/70 bg-white/80 p-2.5 dark:bg-slate-950/50'>{icon}</div> : null}
        </div>
        <p className='mt-5 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50'>{value}</p>
        {hint ? <p className='mt-2 text-sm text-muted-foreground'>{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
