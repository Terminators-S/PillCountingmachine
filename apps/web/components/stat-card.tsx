import { ReactNode } from 'react';
import { Card, CardContent } from './ui/card';

export function StatCard({ label, value, hint, icon }: { label: string; value: string | number; hint?: string; icon?: ReactNode }) {
  return (
    <Card className='overflow-hidden'>
      <CardContent className='p-4'>
        <div className='flex items-center justify-between gap-3'>
          <p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground'>{label}</p>
          {icon ? <div className='rounded-xl border border-border/70 bg-white/85 p-2 dark:bg-slate-950/50'>{icon}</div> : null}
        </div>
        <p className='mt-3 text-[1.8rem] font-semibold tracking-tight text-slate-950 dark:text-slate-50'>{value}</p>
        {hint ? <p className='mt-1 text-xs text-muted-foreground'>{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
