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
  LucideIcon
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clearTokens } from '../lib/auth';
import { apiRequest } from '../lib/api';
import { cn } from '../lib/utils';
import { AppBreadcrumbs } from './app-breadcrumbs';
import { LiveConnectionBadge } from './live-connection-badge';
import { ThemeToggle } from './theme-toggle';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { AppBrandingSettings, MeProfile } from '../types/api';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  group: 'workspace' | 'operations' | 'system';
  disabled?: boolean;
};

const SIDEBAR_STATE_KEY = 'pillcount.sidebarCollapsed';

const baseNavItems: NavItem[] = [
  { href: '/overview', label: 'Overview', icon: Home, group: 'workspace' },
  { href: '/live', label: 'Live Dashboard', icon: Activity, group: 'workspace' },
  { href: '/handbook', label: 'Machine Handbook', icon: BookOpen, group: 'workspace' },
  { href: '/jobs', label: 'Jobs / Sessions', icon: ClipboardList, group: 'operations' },
  { href: '/inventory', label: 'Inventory', icon: Package, group: 'operations' },
  { href: '/lots-expiry', label: 'Lots & Expiry', icon: FileSearch, group: 'operations' },
  { href: '/machines', label: 'Machines Fleet', icon: Truck, group: 'operations' },
  { href: '/maintenance', label: 'Maintenance', icon: Wrench, group: 'operations', disabled: true },
  { href: '/reports', label: 'Reports', icon: FileBarChart2, group: 'operations' },
  { href: '/users-roles', label: 'Users & Roles', icon: Users, group: 'system' },
  { href: '/admin', label: 'Admin', icon: Database, group: 'system' },
  { href: '/settings', label: 'Settings', icon: Cog, group: 'system' },
  { href: '/audit-log', label: 'Audit Log', icon: Shield, group: 'system' },
  { href: '/notifications', label: 'Notifications', icon: Bell, group: 'system', disabled: true }
] as const;

const navGroups = [
  { key: 'workspace', label: 'Workspace', icon: LayoutGrid },
  { key: 'operations', label: 'Operations', icon: Activity },
  { key: 'system', label: 'System', icon: Shield }
] as const;

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
  const groupedNavItems = useMemo(
    () =>
      navGroups
        .map((group) => ({
          ...group,
          items: navItems.filter((item) => item.group === group.key)
        }))
        .filter((group) => group.items.length > 0),
    [navItems]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem(SIDEBAR_STATE_KEY);
    setSidebarCollapsed(stored === 'true');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

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

  return (
    <div className='min-h-screen'>
      <div className='mx-auto flex w-full max-w-[1680px] gap-4 px-4 py-4 lg:px-5'>
        <aside className={cn('hidden shrink-0 transition-all duration-300 lg:flex', sidebarCollapsed ? 'w-[94px]' : 'w-[272px]')}>
          <div className='surface-card sticky top-4 flex h-[calc(100vh-2rem)] w-full flex-col overflow-hidden p-3'>
            <div className='mb-3 flex items-center justify-between gap-2'>
              {!sidebarCollapsed ? <span className='text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground'>Navigation</span> : <span />}
              <Button variant='ghost' size='sm' className='h-9 w-9 rounded-xl p-0' onClick={() => setSidebarCollapsed((current) => !current)}>
                {sidebarCollapsed ? <PanelLeftOpen className='h-4 w-4' /> : <PanelLeftClose className='h-4 w-4' />}
              </Button>
            </div>

            <div className={cn('rounded-[26px] bg-[linear-gradient(155deg,rgba(15,23,42,0.98),rgba(8,145,178,0.92)_58%,rgba(16,185,129,0.85))] text-white shadow-[0_24px_60px_rgba(15,23,42,0.35)]', sidebarCollapsed ? 'p-3' : 'p-4')}>
              <div className={cn('flex items-center', sidebarCollapsed ? 'justify-center' : 'gap-3')}>
                {storeLogo ? (
                  <img src={storeLogo} alt='Store logo' className='h-12 w-12 rounded-[18px] border border-white/15 bg-white/10 object-cover' />
                ) : (
                  <div className='flex h-12 w-12 items-center justify-center rounded-[18px] bg-white/12 text-sm font-bold tracking-[0.24em] text-white'>
                    {brandInitials}
                  </div>
                )}
                {!sidebarCollapsed ? (
                  <div className='min-w-0'>
                    <p className='text-[10px] uppercase tracking-[0.28em] text-white/68'>{supportLabel}</p>
                    <p className='mt-1.5 truncate text-lg font-semibold tracking-tight'>{storeName}</p>
                    <p className='truncate text-xs text-white/72'>{productName}</p>
                  </div>
                ) : null}
              </div>

              {!sidebarCollapsed ? (
                <div className='mt-4 rounded-[22px] border border-white/12 bg-white/10 p-3.5 backdrop-blur'>
                  <div className='flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/72'>
                    <ActiveIcon className='h-4 w-4' />
                    <span>{activeItem.label}</span>
                  </div>
                  <p className='mt-2.5 text-sm leading-6 text-white/80'>{accentNote}</p>
                </div>
              ) : null}
            </div>

            <nav className='mt-3 flex-1 space-y-4 overflow-y-auto pr-1'>
              {groupedNavItems.map((group) => {
                const GroupIcon = group.icon;
                return (
                  <div key={group.key} className='space-y-1.5'>
                    {!sidebarCollapsed ? (
                      <div className='flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground'>
                        <GroupIcon className='h-3.5 w-3.5' />
                        <span>{group.label}</span>
                      </div>
                    ) : null}
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.disabled ? '#' : item.href}
                          title={item.label}
                          className={cn(
                            'group flex items-center rounded-2xl text-sm transition-all duration-200',
                            sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                            item.disabled ? 'pointer-events-none opacity-35' : 'hover:bg-slate-950/5 dark:hover:bg-white/5',
                            active
                              ? 'border border-emerald-200 bg-[linear-gradient(135deg,rgba(13,148,136,0.12),rgba(37,99,235,0.08))] text-slate-950 shadow-sm dark:border-emerald-500/20 dark:text-white'
                              : 'border border-transparent text-slate-600 dark:text-slate-300'
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors',
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
                    })}
                  </div>
                );
              })}
            </nav>

            <div className={cn('mt-3 rounded-[22px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(240,249,255,0.82))] dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.6),rgba(15,23,42,0.75))]', sidebarCollapsed ? 'p-3 text-center' : 'p-4')}>
              <p className='text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground'>{sidebarCollapsed ? 'User' : 'Signed in'}</p>
              <p className={cn('mt-2 font-semibold text-slate-950 dark:text-white', sidebarCollapsed ? 'truncate text-sm' : 'text-base')}>
                {sidebarCollapsed ? buildInitials(me?.fullName || 'Platform Admin') : me?.fullName || 'Authenticated user'}
              </p>
              {!sidebarCollapsed ? (
                <>
                  <p className='mt-1 text-sm text-muted-foreground'>{me?.email || 'No profile loaded'}</p>
                  <p className='mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground'>{roleSummary}</p>
                </>
              ) : null}
            </div>
          </div>
        </aside>

        <div className='flex min-h-[calc(100vh-2rem)] flex-1 flex-col rounded-[30px] border border-white/70 bg-white/70 shadow-[0_24px_90px_rgba(15,23,42,0.10)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/55'>
          <header className='sticky top-3 z-20 px-4 pt-3 lg:px-5 lg:pt-4'>
            <div className='surface-panel p-3.5 md:p-4'>
              <div className='flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
                <div className='flex items-start gap-4'>
                  <div className='hidden h-12 w-12 items-center justify-center rounded-[18px] border border-emerald-200 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(236,253,245,0.98))] text-emerald-700 shadow-sm md:flex dark:border-emerald-500/20 dark:bg-slate-900/70 dark:text-emerald-300'>
                    <ActiveIcon className='h-5 w-5' />
                  </div>
                  <div className='min-w-0 space-y-1.5'>
                    <AppBreadcrumbs />
                    <span className='section-kicker'>{headerEyebrow}</span>
                    <div>
                      <p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground'>{activeItem.label}</p>
                      <p className='mt-1 text-[1.75rem] font-semibold tracking-tight text-slate-950 dark:text-slate-50'>{productName}</p>
                      <p className='mt-1 hidden max-w-2xl text-sm leading-6 text-muted-foreground 2xl:block'>{headerSummary}</p>
                    </div>
                  </div>
                </div>

                <div className='flex w-full flex-col gap-2.5 xl:max-w-[680px] xl:items-end'>
                  <div className='flex w-full flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-end'>
                    <div className='flex flex-1 items-center gap-3 rounded-[20px] border border-border/70 bg-white/80 px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:bg-slate-950/45'>
                      <Search className='h-4 w-4 text-muted-foreground' />
                      <Input
                        className='h-6 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0'
                        placeholder='Search machines, lots, jobs, reports, or operators'
                      />
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
                        onClick={() => {
                          clearTokens();
                          router.replace('/login');
                        }}
                      >
                        <LogOut className='mr-2 h-4 w-4' />
                        Logout
                      </Button>
                    </div>
                  </div>

                  <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                    <span className='rounded-full border border-border/70 bg-white/70 px-3 py-1.5 dark:bg-slate-950/45'>{storeName}</span>
                    <span className='rounded-full border border-border/70 bg-white/70 px-3 py-1.5 dark:bg-slate-950/45'>{roleSummary}</span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className='px-4 pt-4 lg:hidden lg:px-6'>
            <div className='surface-panel overflow-x-auto p-2'>
              <div className='flex gap-2'>
                {navItems
                  .filter((item) => !item.disabled)
                  .map((item) => {
                    const Icon = item.icon;
                    const active = pathname.startsWith(item.href);
                    return (
                      <Link
                        key={`mobile-${item.href}`}
                        href={item.href}
                        className={cn(
                          'inline-flex items-center gap-2 whitespace-nowrap rounded-2xl border px-3 py-2 text-xs font-semibold transition-colors',
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

          <main className='flex-1 space-y-5 p-4 pt-4 lg:p-5 lg:pt-5'>{children}</main>
        </div>
      </div>
    </div>
  );
}
