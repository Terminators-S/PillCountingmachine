import { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
  eyebrow
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className='surface-panel relative overflow-hidden p-4 md:p-5'>
      <div className='relative flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div className='max-w-3xl space-y-2'>
          <span className='section-kicker'>{eyebrow || 'Operations workspace'}</span>
          <div className='space-y-1'>
            <h1 className='text-[1.45rem] font-semibold tracking-tight text-slate-950 dark:text-slate-50 md:text-[1.65rem]'>{title}</h1>
            {description ? <p className='max-w-2xl text-sm text-muted-foreground'>{description}</p> : null}
          </div>
        </div>
        {actions ? <div className='flex flex-wrap items-center gap-2 lg:justify-end'>{actions}</div> : null}
      </div>
    </div>
  );
}
