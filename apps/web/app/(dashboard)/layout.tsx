'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '../../components/dashboard-shell';
import { useAppSession } from '../../components/app-session-provider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status } = useAppSession();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [router, status]);

  if (status !== 'authenticated') {
    return <div className='min-h-screen bg-background' />;
  }

  return <DashboardShell>{children}</DashboardShell>;
}
