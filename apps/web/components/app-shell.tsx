'use client';

import {
  Activity,
  Bell,
  BookOpen,
  ClipboardList,
  Cog,
  Database,
  FileBarChart2,
  FileSearch,
  History,
  Home,
  LayoutGrid,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Shield,
  Truck,
  Users,
  Wrench,
  type LucideIcon
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { cn } from '../lib/utils';
import { AppBrandingSettings, MeProfile } from '../types/api';
import { useAppSession } from './app-session-provider';
import { AppBreadcrumbs } from './app-breadcrumbs';
import { LiveConnectionBadge } from './live-connection-badge';
import { ThemeToggle } from './theme-toggle';
import { Button } from './ui/button';
import { Input } from './ui/input';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  group: 'workspace' | 'operations' | 'system';
  tier: 'primary' | 'secondary';
  disabled?: boolean;
};

const SIDEBAR_STATE_KEY = 'pillcount.sidebarCollapsed';

const baseNavItems: NavItem[] = [
  { href: '/live', label: 'Machine Control', icon: Activity, group: 'workspace', tier: 'primary' },
  { href: '/machine-runs', label: 'Run History', icon: History, group: 'operations', tier: 'primary' },
  { href: '/overview', label: 'Overview', icon: Home, group: 'workspace', tier: 'secondary' },
  { href: '/handbook', label: 'Machine Handbook', icon: BookOpen, group: 'workspace', tier: 'secondary' },
  { href: '/jobs', label: 'Jobs / Sessions', icon: ClipboardList, group: 'operations', tier: 'secondary' },
  { href: '/inventory', label: 'Inventory', icon: Package, group: 'operations', tier: 'secondary' },
  { href: '/lots-expiry', label: 'Lots & Expiry', icon: FileSearch, group: 'operations', tier: 'secondary' },
  { href: '/machines', label: 'Machines Fleet', icon: Truck, group: 'operations', tier: 'secondary' },
  { href: '/maintenance', label: 'Maintenance', icon: Wrench, group: 'operations', tier: 'secondary', disabled: true },
  { href: '/reports', label: 'Reports', icon: FileBarChart2, group: 'operations', tier: 'secondary' },
  { href: '/users-roles', label: 'Users & Roles', icon: Users, group: 'system', tier: 'secondary' },
  { href: '/admin', label: 'Admin', icon: Database, group: 'system', tier: 'secondary' },
  { href: '/settings', label: 'Settings', icon: Cog, group: 'system', tier: 'secondary' },
  { href: '/audit-log', label: 'Audit Log', icon: Shield, group: 'system', tier: 'secondary' },
  { href: '/notifications', label: 'Notifications', icon: Bell, group: 'system', tier: 'secondary', disabled: true }
];

function buildInitials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment[0]?.toUpperCase() || '')
      .join('') || 'PC'
  );
}

export function AppShell({
  children,
  connectionState,
  lastSyncAt
}: {
  children: ReactNode;
  connectionState: 'connecting' | 'open' | 'closed' | 'error';
  lastSyncAt?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { logout } = useAppSession();

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiRequest<MeProfile>('/auth/me'),
    refetchInterval: false
  });
  const { data: branding } = useQuery({
    queryKey: ['app-settings', 'public', 'app-shell'],
    queryFn: () => apiRequest<AppBrandingSettings>('/app-settings/public'),
    staleTime: 60_000
  });

  const navItems = useMemo<NavItem[]>(() => [...baseNavItems], []);
  const activeItem = useMemo(() => navItems.find((item) => pathname.startsWith(item.href)) || navItems[0], [navItems, pathname]);
  const primaryNavItems = useMemo(() => navItems.filter((item) => item.tier === 'primary'), [navItems]);
  const secondaryNavItems = useMemo(() => navItems.filter((item) => item.tier === 'secondary'), [navItems]);
  const activeSecondaryItem = useMemo(
    () => secondaryNavItems.find((item) => pathname.startsWith(item.href)) || null,
    [pathname, secondaryNavItems]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(SIDEBAR_STATE_KEY);
    setSidebarCollapsed(stored === 'true');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_STATE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const storeName = branding?.organizationName || process.env.NEXT_PUBLIC_STORE_NAME || 'Pharmacy Operations';
  const storeLogo = branding?.logoUrl || process.env.NEXT_PUBLIC_STORE_LOGO_URL || '';
  const productName = branding?.productName || 'PillCount Operations Console';
  const supportLabel = branding?.supportLabel || 'Operations Console';
  const accentNote = branding?.accentNote || 'Monitor live runs, track jobs, and keep counts export-ready.';
  const headerEyebrow = branding?.headerEyebrow || 'Operations command layer';
  const headerSummary =
    branding?.headerSummary || 'Move between machine control, reporting, and operator workflows without losing the current session context.';
  const brandInitials = buildInitials(storeName);
  const ActiveIcon = activeItem.icon;
  const roleSummary = me?.roles?.join(' • ') || 'Operator workspace';

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.disabled ? '#' : item.href}
        title={item.label}
        className={cn(
          'group flex items-center rounded-xl text-sm transition-all duration-200',
          sidebarCollapsed ? 'justify-center px-2 py-2' : 'gap-3 px-2.5 py-2',
          item.disabled ? 'pointer-events-none opacity-35' : 'hover:bg-slate-950/5 dark:hover:bg-white/5',
          active
            ? 'border border-emerald-200 bg-[linear-gradient(135deg,rgba(13,148,136,0.12),rgba(37,99,235,0.08))] text-slate-950 shadow-sm dark:border-emerald-500/20 dark:text-white'
            : 'border border-transparent text-slate-600 dark:text-slate-300'
        )}
      >
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
            active
              ? 'border-emerald-200 bg-white text-emerald-700 dark:border-emerald-500/20 dark:bg-slate-900 dark:text-emerald-300'
              : 'border-border/70 bg-white/75 text-slate-500 group-hover:text-slate-900 dark:bg-slate-950/50 dark:text-slate-300'
          )}
        >
          <Icon className='h-4 w-4' />
        </span>
        {!sidebarCollapsed ? <p className='truncate font-semibold'>{item.label}</p> : null}
      </Link>
    );
  };

  return (
    <div className='min-h-screen'>
      <div className='mx-auto flex w-full max-w-[1620px] gap-3 px-3 py-3 lg:px-4'>
        <aside className={cn('hidden shrink-0 transition-all duration-300 lg:flex', sidebarCollapsed ? 'w-[86px]' : 'w-[248px]')}>
          <div className='surface-card sticky top-3 flex h-[calc(100vh-1.5rem)] w-full flex-col overflow-hidden p-2.5'>
            <div className='mb-2 flex items-center justify-between gap-2 px-1'>
              {!sidebarCollapsed ? <span className='text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground'>Navigation</span> : <span />}
              <Button variant='ghost' size='sm' className='h-8 w-8 rounded-lg p-0' onClick={() => setSidebarCollapsed((current) => !current)}>
                {sidebarCollapsed ? <PanelLeftOpen className='h-4 w-4' /> : <PanelLeftClose className='h-4 w-4' />}
              </Button>
            </div>

            <div
              className={cn(
                'rounded-[20px] bg-[linear-gradient(155deg,rgba(15,23,42,0.98),rgba(8,145,178,0.9)_58%,rgba(16,185,129,0.82))] text-white shadow-[0_18px_40px_rgba(15,23,42,0.28)]',
                sidebarCollapsed ? 'p-3' : 'p-3.5'
              )}
            >
              <div className={cn('flex items-center', sidebarCollapsed ? 'justify-center' : 'gap-3')}>
                {storeLogo ? (
                  <img src={storeLogo} alt='Store logo' className='h-11 w-11 rounded-[16px] border border-white/15 bg-white/10 object-cover' />
                ) : (
                  <div className='flex h-11 w-11 items-center justify-center rounded-[16px] bg-white/12 text-sm font-bold tracking-[0.18em] text-white'>
                    {brandInitials}
                  </div>
                )}
                {!sidebarCollapsed ? (
                  <div className='min-w-0'>
                    <p className='text-[10px] uppercase tracking-[0.2em] text-white/66'>{supportLabel}</p>
                    <p className='mt-1 truncate text-base font-semibold tracking-tight'>{storeName}</p>
                    <p className='truncate text-xs text-white/72'>{productName}</p>
                  </div>
                ) : null}
              </div>

              {!sidebarCollapsed ? (
                <div className='mt-3 rounded-[16px] border border-white/12 bg-white/10 p-3 backdrop-blur'>
                  <div className='flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/72'>
                    <ActiveIcon className='h-4 w-4' />
                    <span>{activeItem.label}</span>
                  </div>
                  <p className='mt-2 text-xs leading-5 text-white/76'>{accentNote}</p>
                </div>
              ) : null}
            </div>

            <nav className='mt-3 flex-1 space-y-3 overflow-y-auto pr-1'>
              <div className='space-y-1'>
                {!sidebarCollapsed ? (
                  <div className='flex items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
                    <LayoutGrid className='h-3.5 w-3.5' />
                    <span>Machine</span>
                  </div>
                ) : null}
                {primaryNavItems.map((item) => renderNavItem(item))}
              </div>

              {secondaryNavItems.length ? (
                <details
                  className='space-y-2 rounded-2xl border border-border/70 bg-white/55 p-2 dark:bg-slate-950/35'
                  open={Boolean(activeSecondaryItem)}
                >
                  <summary className={cn('cursor-pointer list-none rounded-xl px-2 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200', sidebarCollapsed && 'text-center')}>
                    {sidebarCollapsed ? <Cog className='mx-auto h-4 w-4' /> : 'More tools'}
                  </summary>

                  <div className='space-y-1'>
                    {!sidebarCollapsed ? (
                      <p className='px-2 text-xs text-muted-foreground'>
                        Everything else stays here so the main machine controls stay easy to reach.
                      </p>
                    ) : null}
                    {secondaryNavItems.map((item) => renderNavItem(item))}
                  </div>
                </details>
              ) : null}
            </nav>

            <div className={cn('surface-subtle mt-2', sidebarCollapsed ? 'p-2.5 text-center' : 'p-3')}>
              <p className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>{sidebarCollapsed ? 'User' : 'Signed in'}</p>
              <p className={cn('mt-1.5 font-semibold text-slate-950 dark:text-white', sidebarCollapsed ? 'truncate text-sm' : 'text-sm')}>
                {sidebarCollapsed ? buildInitials(me?.fullName || 'Platform Admin') : me?.fullName || 'Authenticated user'}
              </p>
              {!sidebarCollapsed ? (
                <>
                  <p className='mt-1 truncate text-xs text-muted-foreground'>{me?.email || 'No profile loaded'}</p>
                  <p className='mt-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground'>{roleSummary}</p>
                </>
              ) : null}
            </div>
          </div>
        </aside>

        <div className='flex min-h-[calc(100vh-1.5rem)] flex-1 flex-col rounded-[24px] border border-white/70 bg-white/74 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/55'>
          <header className='sticky top-3 z-20 px-3 pt-3 lg:px-4'>
            <div className='surface-panel p-3'>
              <div className='flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
                <div className='flex min-w-0 items-start gap-3'>
                  <div className='hidden h-10 w-10 items-center justify-center rounded-[14px] border border-emerald-200 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(236,253,245,0.98))] text-emerald-700 shadow-sm md:flex dark:border-emerald-500/20 dark:bg-slate-900/70 dark:text-emerald-300'>
                    <ActiveIcon className='h-[18px] w-[18px]' />
                  </div>
                  <div className='min-w-0 space-y-1'>
                    <AppBreadcrumbs />
                    <div className='flex flex-wrap items-center gap-2'>
                      <p className='text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50'>{activeItem.label}</p>
                      <span className='rounded-full border border-border/70 bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground dark:bg-slate-950/45'>
                        {storeName}
                      </span>
                    </div>
                    <p className='hidden text-sm text-muted-foreground xl:block'>{headerSummary}</p>
                  </div>
                </div>

                <div className='flex w-full flex-col gap-2.5 xl:max-w-[620px] xl:items-end'>
                  <div className='flex w-full flex-col gap-2 lg:flex-row lg:items-center lg:justify-end'>
                    <div className='flex flex-1 items-center gap-2 rounded-[16px] border border-border/70 bg-white/84 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:bg-slate-950/45'>
                      <Search className='h-4 w-4 text-muted-foreground' />
                      <Input className='h-5 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0' placeholder='Search machines, jobs, lots, or operators' />
                    </div>

                    <div className='flex flex-wrap items-center gap-2'>
                      <LiveConnectionBadge state={connectionState} lastSyncAt={lastSyncAt} />
                      <ThemeToggle />
                      <Button variant='ghost' size='sm' aria-label='Notifications'>
                        <Bell className='h-4 w-4' />
                      </Button>
                      <Button
                        variant='secondary'
                        size='sm'
                        onClick={async () => {
                          await logout();
                          router.replace('/login');
                        }}
                      >
                        <LogOut className='mr-2 h-4 w-4' />
                        Logout
                      </Button>
                    </div>
                  </div>

                  <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                    <span className='rounded-full border border-border/70 bg-white/80 px-2.5 py-1 dark:bg-slate-950/45'>{roleSummary}</span>
                    <span className='rounded-full border border-border/70 bg-white/80 px-2.5 py-1 dark:bg-slate-950/45'>{headerEyebrow}</span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className='px-3 pt-3 lg:hidden lg:px-6'>
            <div className='surface-panel overflow-x-auto p-1.5'>
              <div className='flex gap-2'>
                {[...primaryNavItems, ...(activeSecondaryItem ? [activeSecondaryItem] : [])]
                  .filter((item, index, items) => !item.disabled && items.findIndex((entry) => entry.href === item.href) === index)
                  .map((item) => {
                    const Icon = item.icon;
                    const active = pathname.startsWith(item.href);
                    return (
                      <Link
                        key={`mobile-${item.href}`}
                        href={item.href}
                        className={cn(
                          'inline-flex items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                          active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                            : 'border-border/70 bg-white/80 text-slate-700 dark:bg-slate-950/45 dark:text-slate-200'
                        )}
                      >
                        <Icon className='h-3.5 w-3.5' />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
              </div>
            </div>
          </div>

          <main className='flex-1 space-y-4 p-3 pt-3 lg:p-4 lg:pt-4'>{children}</main>
        </div>
      </div>
    </div>
  );
}
