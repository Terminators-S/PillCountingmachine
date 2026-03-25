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
  if (!actions) {
    return null;
  }

  return (
    <div className='flex justify-end'>
      <div
        className='surface-panel inline-flex max-w-full flex-wrap items-center justify-end gap-2 p-2'
        aria-label={`${title} actions`}
        title={description || eyebrow}
      >
        {actions}
      </div>
    </div>
  );
}
