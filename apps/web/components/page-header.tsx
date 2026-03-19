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
    <div className='surface-panel relative overflow-hidden p-5 md:p-6'>
      <div className='relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between'>
        <div className='max-w-3xl space-y-2.5'>
          <span className='section-kicker'>{eyebrow || 'Operations workspace'}</span>
          <div className='space-y-1.5'>
            <h1 className='text-[1.9rem] font-semibold tracking-tight text-slate-950 dark:text-slate-50 md:text-[2.05rem]'>{title}</h1>
            {description ? <p className='max-w-2xl text-sm leading-6 text-muted-foreground md:text-[15px]'>{description}</p> : null}
          </div>
        </div>
        {actions ? <div className='flex flex-wrap items-center gap-3 xl:justify-end'>{actions}</div> : null}
      </div>
    </div>
  );
}
