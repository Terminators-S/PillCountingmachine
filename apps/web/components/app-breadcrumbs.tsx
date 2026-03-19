'use client';

import { ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';

function titleize(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function AppBreadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split('/').filter(Boolean);

  return (
    <nav aria-label='Breadcrumb' className='flex items-center gap-1 text-xs text-muted-foreground'>
      <span>Operations Console</span>
      {parts.map((part) => (
        <span key={part} className='inline-flex items-center gap-1'>
          <ChevronRight className='h-3 w-3' />
          <span>{titleize(part)}</span>
        </span>
      ))}
    </nav>
  );
}
