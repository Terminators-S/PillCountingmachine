import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '../../lib/auth';
import { DashboardShell } from '../../components/dashboard-shell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const hasSession = Boolean(cookieStore.get(ACCESS_TOKEN_KEY)?.value || cookieStore.get(REFRESH_TOKEN_KEY)?.value);

  if (!hasSession) {
    redirect('/login');
  }

  return <DashboardShell>{children}</DashboardShell>;
}
