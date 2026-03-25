'use client';

import {
  Activity,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cog,
  Database,
  History,
  LayoutGrid,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Truck,
  Users,
  Wrench,
  type LucideIcon
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { cn } from '../lib/utils';
import { AppBrandingSettings, Lot, Machine, MachineRuntimeStateSummary, MeProfile } from '../types/api';
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

const navDetailCopy: Record<string, string> = {
  '/live': 'Start or stop the Pi, watch preview, and monitor pill counts.',
  '/machine-runs': 'Review completed runs, totals, and sync history.',
  '/handbook': 'Read setup notes, workflow steps, and machine guidance.',
  '/jobs': 'Run sessions, check stock, and watch expiry in one place.',
  '/inventory': 'This route now opens the merged sessions and stock workspace.',
  '/lots-expiry': 'Review expiring lots and stock that needs action.',
  '/machines': 'Monitor fleet health and open machine event logs.',
  '/maintenance': 'Maintenance tools for hardware checks and servicing.',
  '/users-roles': 'Manage platform access and role assignment.',
  '/admin': 'Inspect system data and platform records.',
  '/settings': 'Adjust configuration and open advanced platform tools.',
  '/notifications': 'See alerts, offline machines, and runtime issues.'
};

const SIDEBAR_STATE_KEY = 'pillcount.sidebarCollapsed';

const baseNavItems: NavItem[] = [
  { href: '/live', label: 'Machine Control', icon: Activity, group: 'workspace', tier: 'primary' },
  { href: '/machine-runs', label: 'Run History', icon: History, group: 'operations', tier: 'primary' },
  { href: '/handbook', label: 'Machine Handbook', icon: BookOpen, group: 'workspace', tier: 'secondary' },
  { href: '/jobs', label: 'Sessions & Stock', icon: ClipboardList, group: 'operations', tier: 'secondary' },
  { href: '/machines', label: 'Machines Fleet', icon: Truck, group: 'operations', tier: 'secondary' },
  { href: '/maintenance', label: 'Maintenance', icon: Wrench, group: 'operations', tier: 'secondary', disabled: true },
  { href: '/users-roles', label: 'Users & Roles', icon: Users, group: 'system', tier: 'secondary' },
  { href: '/admin', label: 'Admin', icon: Database, group: 'system', tier: 'secondary' },
  { href: '/settings', label: 'Settings', icon: Cog, group: 'system', tier: 'secondary' }
];

const notificationsNavItem: NavItem = {
  href: '/notifications',
  label: 'Notifications',
  icon: Bell,
  group: 'system',
  tier: 'secondary'
};

type ShellNotificationItem = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  href: string;
};

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

function NotificationPopupButton({
  count,
  countLabel,
  items,
  placement = 'bottom',
  align = 'end'
}: {
  count: number;
  countLabel: string;
  items: ShellNotificationItem[];
  placement?: 'top' | 'bottom';
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className='relative'>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        aria-label={count ? `${count} notifications` : 'Notifications'}
        aria-expanded={open}
        className='relative h-10 w-10 overflow-visible rounded-full p-0'
        onClick={() => setOpen((current) => !current)}
      >
        <Bell className='h-4 w-4' />
        {count ? (
          <span className='absolute -right-1.5 -top-1.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-[linear-gradient(135deg,#fb7185,#e11d48)] px-1 text-[11px] font-bold leading-none text-white shadow-[0_6px_14px_rgba(225,29,72,0.35)] dark:border-slate-950'>
            {countLabel}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          className={cn(
            'absolute z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,250,255,0.96))] shadow-[0_18px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95',
            placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            align === 'start' ? 'left-0' : 'right-0'
          )}
        >
          <div className='flex items-center justify-between border-b border-border/70 px-4 py-3'>
            <div>
              <p className='text-sm font-semibold text-slate-950 dark:text-white'>Notifications</p>
              <p className='text-xs text-muted-foreground'>{count ? `${count} item${count === 1 ? '' : 's'} need attention` : 'No urgent alerts right now'}</p>
            </div>
            <Link
              href='/notifications'
              className='text-xs font-semibold text-cyan-700 hover:text-cyan-800 dark:text-cyan-300'
              onClick={() => setOpen(false)}
            >
              Open page
            </Link>
          </div>

          <div className='max-h-[22rem] space-y-2 overflow-y-auto p-3'>
            {items.length ? (
              items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className='block rounded-2xl border border-border/70 bg-white/80 px-3 py-3 transition-colors hover:border-cyan-200 hover:bg-cyan-50/60 dark:bg-slate-950/55 dark:hover:bg-slate-900'
                >
                  <div className='flex items-center gap-2'>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
                        item.severity === 'critical'
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200'
                          : item.severity === 'warning'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      )}
                    >
                      {item.severity}
                    </span>
                    <p className='truncate text-sm font-semibold text-slate-900 dark:text-white'>{item.title}</p>
                  </div>
                  <p className='mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300'>{item.message}</p>
                </Link>
              ))
            ) : (
              <div className='rounded-2xl border border-border/70 bg-white/80 px-3 py-4 text-sm text-slate-600 dark:bg-slate-950/55 dark:text-slate-300'>
                Everything looks stable right now.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
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
  const { data: machines } = useQuery({
    queryKey: ['machines', 'header-alerts'],
    queryFn: () => apiRequest<Machine[]>('/machines'),
    refetchInterval: 15_000,
    staleTime: 10_000
  });
  const { data: runtimeList } = useQuery({
    queryKey: ['machine-runtime', 'list', 'header-alerts'],
    queryFn: () => apiRequest<MachineRuntimeStateSummary[]>('/machine-runtime'),
    refetchInterval: 5_000,
    staleTime: 2_000
  });
  const { data: expiringLots } = useQuery({
    queryKey: ['lots', 'header-alerts', 'expiring'],
    queryFn: () => apiRequest<Lot[]>('/lots?expiringDays=30'),
    refetchInterval: 60_000,
    staleTime: 30_000
  });

  const visibleNavItems = useMemo<NavItem[]>(() => [...baseNavItems], []);
  const routeNavItems = useMemo<NavItem[]>(() => [...visibleNavItems, notificationsNavItem], [visibleNavItems]);
  const activeItem = useMemo(
    () => routeNavItems.find((item) => pathname.startsWith(item.href)) || routeNavItems[0],
    [routeNavItems, pathname]
  );
  const primaryNavItems = useMemo(() => visibleNavItems.filter((item) => item.tier === 'primary'), [visibleNavItems]);
  const secondaryNavItems = useMemo(() => visibleNavItems.filter((item) => item.tier === 'secondary'), [visibleNavItems]);
  const activeSecondaryItem = useMemo(
    () => secondaryNavItems.find((item) => pathname.startsWith(item.href)) || null,
    [pathname, secondaryNavItems]
  );
  const directToolHrefs = useMemo(() => ['/jobs', '/machines', '/maintenance'], []);
  const settingsChildHrefs = useMemo(() => ['/handbook', '/users-roles', '/admin'], []);
  const settingsItem = useMemo(() => secondaryNavItems.find((item) => item.href === '/settings') || null, [secondaryNavItems]);
  const directToolItems = useMemo(
    () => secondaryNavItems.filter((item) => directToolHrefs.includes(item.href)),
    [secondaryNavItems, directToolHrefs]
  );
  const settingsChildItems = useMemo(
    () => secondaryNavItems.filter((item) => settingsChildHrefs.includes(item.href)),
    [secondaryNavItems, settingsChildHrefs]
  );
  const toolNavItems = useMemo(
    () =>
      secondaryNavItems.filter(
        (item) => item.href !== '/settings' && !settingsChildHrefs.includes(item.href) && !directToolHrefs.includes(item.href)
      ),
    [secondaryNavItems, settingsChildHrefs, directToolHrefs]
  );
  const settingsSectionActive = Boolean(pathname.startsWith('/settings') || settingsChildItems.some((item) => pathname.startsWith(item.href)));

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
  const ActiveIcon = activeItem.icon;
  const activeItemDetail = navDetailCopy[activeItem.href] || 'Open this workspace to continue the current task.';
  const userDisplayName = me?.fullName || 'Authenticated user';
  const userEmail = me?.email || 'No profile loaded';
  const primaryRole = me?.roles?.[0] || 'ADMIN';
  const userInitials = buildInitials(userDisplayName);
  const liveStatusLabel =
    connectionState === 'error'
      ? 'Retrying live updates'
      : connectionState === 'connecting'
        ? 'Syncing feed'
          : '';
  const unreadNotificationCount = useMemo(() => {
    const offlineCount = (machines || []).filter((machine) => (machine.displayStatus || machine.status) === 'OFFLINE').length;
    const runtimeIssueCount = (runtimeList || []).filter((runtime) => {
      if (runtime.controlState === 'ERROR' || runtime.latestError) return true;
      return runtime.controlState === 'STARTING' && !runtime.lastTelemetryAt;
    }).length;
    const expiringCount = (expiringLots || []).length;
    return offlineCount + runtimeIssueCount + expiringCount;
  }, [expiringLots, machines, runtimeList]);
  const unreadNotificationLabel = unreadNotificationCount > 9 ? '9+' : String(unreadNotificationCount);
  const popupNotifications = useMemo<ShellNotificationItem[]>(() => {
    const runtimeByCode = new Map((runtimeList || []).map((entry) => [entry.machineCode, entry]));
    const rows: ShellNotificationItem[] = [];

    for (const machine of machines || []) {
      const displayStatus = machine.displayStatus || machine.status;
      const runtime = runtimeByCode.get(machine.machineCode);

      if (displayStatus === 'OFFLINE') {
        rows.push({
          id: `offline:${machine.machineCode}`,
          severity: 'critical',
          title: `${machine.machineCode} offline`,
          message: machine.lastSeen ? `Last heartbeat ${new Date(machine.lastSeen).toLocaleString()}.` : 'No heartbeat from this machine.',
          href: '/machines'
        });
      }

      if (runtime?.controlState === 'ERROR' || runtime?.latestError) {
        rows.push({
          id: `runtime:${machine.machineCode}`,
          severity: 'critical',
          title: `${machine.machineCode} runtime error`,
          message: runtime.latestError || runtime.latestMessage || 'The Pi runtime reported an error state.',
          href: '/live'
        });
      } else if (runtime?.controlState === 'STARTING' && !runtime.lastTelemetryAt) {
        rows.push({
          id: `starting:${machine.machineCode}`,
          severity: 'warning',
          title: `${machine.machineCode} starting`,
          message: 'Waiting for the first frame from the Pi.',
          href: '/live'
        });
      }
    }

    for (const lot of expiringLots || []) {
      rows.push({
        id: `expiry:${lot.id}`,
        severity: 'warning',
        title: `Lot ${lot.lotNumber} expiring`,
        message: `${lot.pillType?.code || lot.pillType?.name || 'Medication'} at ${lot.location}.`,
        href: '/jobs'
      });
    }

    return rows.slice(0, 6);
  }, [expiringLots, machines, runtimeList]);

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.disabled ? '#' : item.href}
        title={item.label}
        className={cn(
          'sidebar-nav-link group flex items-center rounded-xl text-sm transition-all duration-200',
          sidebarCollapsed ? 'justify-center px-2 py-2' : 'gap-3 px-2.5 py-2',
          item.disabled ? 'pointer-events-none opacity-35' : 'hover:bg-slate-950/5 dark:hover:bg-white/5',
          active
            ? 'border border-emerald-200 bg-[linear-gradient(135deg,rgba(13,148,136,0.12),rgba(37,99,235,0.08))] text-slate-950 shadow-sm dark:border-emerald-500/20 dark:text-white'
            : 'border border-transparent text-slate-600 dark:text-slate-300'
        )}
      >
        <span
          className={cn(
            'sidebar-nav-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
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

  const renderCompactNavItem = (item: NavItem, labelOverride?: string) => {
    const Icon = item.icon;
    const active = pathname.startsWith(item.href);
    return (
      <Link
        key={`compact-${item.href}`}
        href={item.disabled ? '#' : item.href}
        title={labelOverride || item.label}
        className={cn(
          'sidebar-nav-link group flex items-center rounded-xl transition-all duration-200',
          sidebarCollapsed ? 'justify-center p-2' : 'gap-3 px-2 py-1.5',
          item.disabled ? 'pointer-events-none opacity-35' : 'hover:bg-slate-950/5 dark:hover:bg-white/5',
          active
            ? 'border border-emerald-200/90 bg-[linear-gradient(135deg,rgba(13,148,136,0.1),rgba(37,99,235,0.06))] text-slate-950 shadow-sm dark:border-emerald-500/20 dark:text-white'
            : 'border border-transparent text-slate-600 dark:text-slate-300'
        )}
      >
        <span
          className={cn(
            'sidebar-nav-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors',
            active
              ? 'border-emerald-200 bg-white text-emerald-700 dark:border-emerald-500/20 dark:bg-slate-900 dark:text-emerald-300'
              : 'border-border/70 bg-white/80 text-slate-500 group-hover:text-slate-900 dark:bg-slate-950/50 dark:text-slate-300'
          )}
        >
          <Icon className='h-3.5 w-3.5' />
        </span>
        {!sidebarCollapsed ? <p className='truncate text-[13px] font-semibold'>{labelOverride || item.label}</p> : null}
      </Link>
    );
  };

  return (
    <div className='min-h-screen'>
      <div className='mx-auto flex w-full max-w-[1620px] gap-3 px-3 py-3 lg:px-4'>
        <aside className={cn('relative z-40 hidden shrink-0 transition-all duration-300 lg:flex', sidebarCollapsed ? 'w-[86px]' : 'w-[248px]')}>
          <div className='surface-card sticky top-3 flex h-[calc(100vh-1.5rem)] w-full flex-col overflow-visible p-2.5'>
            <div className='mb-2 flex items-center justify-between gap-2 px-1'>
              {!sidebarCollapsed ? <span className='text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground'>Navigation</span> : <span />}
              <Button variant='ghost' size='sm' className='h-8 w-8 rounded-lg p-0' onClick={() => setSidebarCollapsed((current) => !current)}>
                {sidebarCollapsed ? <PanelLeftOpen className='h-4 w-4' /> : <PanelLeftClose className='h-4 w-4' />}
              </Button>
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

              {directToolItems.length ? (
                <div className='space-y-1'>
                  {!sidebarCollapsed ? (
                    <div className='flex items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
                      <ClipboardList className='h-3.5 w-3.5' />
                      <span>Operations</span>
                    </div>
                  ) : null}
                  {directToolItems.map((item) => renderNavItem(item))}
                </div>
              ) : null}

              {secondaryNavItems.length ? (
                toolNavItems.length ? (
                <details
                  className='sidebar-accordion group space-y-2 rounded-2xl border border-border/70 bg-white/55 p-2 dark:bg-slate-950/35'
                  open={Boolean(activeSecondaryItem)}
                >
                  <summary
                    className={cn(
                      'sidebar-accordion-summary flex cursor-pointer list-none items-center justify-between rounded-xl px-2 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200',
                      sidebarCollapsed && 'justify-center'
                    )}
                  >
                    {sidebarCollapsed ? (
                      <Cog className='h-4 w-4' />
                    ) : (
                      <>
                        <span>More tools</span>
                        <ChevronDown className='h-4 w-4 transition-transform group-open:rotate-180' />
                      </>
                    )}
                  </summary>

                  <div className='sidebar-accordion-panel space-y-1'>
                    {toolNavItems.map((item) => renderNavItem(item))}
                  </div>
                </details>
                ) : null
              ) : null}

              {settingsItem ? (
                <details
                  className='sidebar-accordion group space-y-2 rounded-2xl border border-border/70 bg-white/55 p-2 dark:bg-slate-950/35'
                  open={settingsSectionActive}
                >
                  <summary
                    className={cn(
                      'sidebar-accordion-summary flex cursor-pointer list-none items-center justify-between rounded-xl px-2 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200',
                      sidebarCollapsed && 'justify-center'
                    )}
                  >
                    {sidebarCollapsed ? (
                      <Cog className='h-4 w-4' />
                    ) : (
                      <>
                        <span>Settings</span>
                        <ChevronDown className='h-4 w-4 transition-transform group-open:rotate-180' />
                      </>
                    )}
                  </summary>

                  <div className='sidebar-accordion-panel space-y-1'>
                    {renderCompactNavItem(settingsItem, 'General')}
                    {!sidebarCollapsed ? settingsChildItems.map((item) => renderCompactNavItem(item)) : null}
                  </div>
                </details>
              ) : null}
            </nav>

            {!sidebarCollapsed ? (
              <div className='mt-2 border-t border-border/70 pt-2'>
                <div className='space-y-2 rounded-2xl border border-border/70 bg-white/55 p-2 dark:bg-slate-950/35'>
                  <div className='flex items-center gap-2 rounded-[16px] border border-border/70 bg-white/84 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:bg-slate-950/45'>
                    <Search className='h-4 w-4 text-muted-foreground' />
                    <Input className='h-5 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0' placeholder='Search' />
                  </div>

                  <div className='flex items-center gap-2'>
                    <div className='flex items-center gap-1 rounded-[16px] border border-border/70 bg-white/84 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:bg-slate-950/45'>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='h-8 w-8 rounded-full p-0'
                        aria-label='Go back'
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            window.history.back();
                          }
                        }}
                      >
                        <ChevronLeft className='h-4 w-4' />
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='h-8 w-8 rounded-full p-0'
                        aria-label='Go forward'
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            window.history.forward();
                          }
                        }}
                      >
                        <ChevronRight className='h-4 w-4' />
                      </Button>
                    </div>

                    <ThemeToggle />
                    <NotificationPopupButton
                      count={unreadNotificationCount}
                      countLabel={unreadNotificationLabel}
                      items={popupNotifications}
                      placement='top'
                      align='start'
                    />

                    <Button
                      variant='secondary'
                      size='sm'
                      className='ml-auto h-9 w-9 rounded-full p-0'
                      aria-label='Logout'
                      title='Logout'
                      onClick={async () => {
                        await logout();
                        router.replace('/login');
                      }}
                    >
                      <LogOut className='h-4 w-4' />
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

          </div>
        </aside>

        <div className='relative z-10 flex min-h-[calc(100vh-1.5rem)] flex-1 flex-col rounded-[24px] border border-white/70 bg-white/74 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/55'>
          <header className='sticky top-3 z-20 px-3 pt-3 lg:px-4'>
            <div className='surface-panel px-4 py-2.5'>
              <div className='flex flex-col gap-2.5 xl:flex-row xl:items-start xl:justify-between'>
                <div className='flex min-w-0 items-start gap-2.5'>
                  <div className='hidden h-8 w-8 items-center justify-center rounded-[12px] border border-cyan-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(236,253,245,0.9),rgba(239,246,255,0.92))] text-cyan-700 shadow-[0_8px_18px_rgba(8,145,178,0.08)] md:flex dark:border-cyan-500/20 dark:bg-slate-900/60 dark:text-cyan-300'>
                    <ActiveIcon className='h-4 w-4' />
                  </div>
                  <div className='min-w-0 space-y-1'>
                    <AppBreadcrumbs />
                    <div className='flex flex-wrap items-center gap-2'>
                      <p className='text-[1.28rem] font-semibold tracking-tight text-slate-950 dark:text-slate-50'>{activeItem.label}</p>
                      <span className='rounded-full border border-cyan-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(240,249,255,0.9))] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:border-cyan-500/20 dark:bg-slate-950/35 dark:text-slate-300'>
                        {storeName}
                      </span>
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <p className='max-w-[460px] text-sm text-slate-600 dark:text-slate-300'>{activeItemDetail}</p>
                      <LiveConnectionBadge state={connectionState} lastSyncAt={lastSyncAt} />
                      {liveStatusLabel ? (
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium shadow-sm',
                            connectionState === 'error'
                              ? 'border-rose-200 bg-[linear-gradient(135deg,rgba(255,241,242,0.98),rgba(255,255,255,0.92))] text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200'
                              : 'border-amber-200 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(255,255,255,0.92))] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200'
                          )}
                        >
                          <span
                            className={cn(
                              'mr-1.5 h-1.5 w-1.5 rounded-full',
                              connectionState === 'error' ? 'bg-rose-500' : 'bg-amber-500'
                            )}
                          />
                          {liveStatusLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className='flex w-full flex-col gap-2 xl:max-w-[520px] xl:items-end'>
                  <div className={cn('flex w-full flex-col gap-2 lg:flex-row lg:items-center lg:justify-end', !sidebarCollapsed && 'lg:hidden')}>
                    <div className='flex flex-1 items-center gap-2'>
                      <div className='flex items-center gap-1 rounded-[16px] border border-border/70 bg-white/84 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:bg-slate-950/45'>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='h-8 w-8 rounded-full p-0'
                          aria-label='Go back'
                          onClick={() => {
                            if (typeof window !== 'undefined') {
                              window.history.back();
                            }
                          }}
                        >
                          <ChevronLeft className='h-4 w-4' />
                        </Button>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='h-8 w-8 rounded-full p-0'
                          aria-label='Go forward'
                          onClick={() => {
                            if (typeof window !== 'undefined') {
                              window.history.forward();
                            }
                          }}
                        >
                          <ChevronRight className='h-4 w-4' />
                        </Button>
                      </div>

                      <div className='flex flex-1 items-center gap-2 rounded-[16px] border border-border/70 bg-white/84 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:bg-slate-950/45'>
                        <Search className='h-4 w-4 text-muted-foreground' />
                        <Input className='h-5 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0' placeholder='Search machines, jobs, lots, or operators' />
                      </div>
                    </div>

                    <div className='flex flex-wrap items-center gap-2'>
                      <ThemeToggle />
                      <NotificationPopupButton
                        count={unreadNotificationCount}
                        countLabel={unreadNotificationLabel}
                        items={popupNotifications}
                      />
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

                  {!sidebarCollapsed ? (
                    <div className='flex justify-end'>
                      <div
                        className='flex items-center gap-2 rounded-full border border-cyan-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(240,249,255,0.88))] px-2.5 py-1.5 shadow-[0_8px_18px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-slate-950/45'
                        title={`${userDisplayName} • ${userEmail}`}
                      >
                        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-200/80 bg-[linear-gradient(145deg,rgba(236,253,245,1),rgba(219,234,254,0.96))] text-[11px] font-bold tracking-[0.16em] text-cyan-700 shadow-sm dark:border-cyan-500/20 dark:bg-[linear-gradient(145deg,rgba(16,185,129,0.14),rgba(59,130,246,0.1))] dark:text-cyan-200'>
                          {userInitials}
                        </div>
                        <p className='max-w-[180px] truncate text-sm font-semibold text-slate-950 dark:text-white'>{userDisplayName}</p>
                        <span className='rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'>
                          {primaryRole}
                        </span>
                      </div>
                    </div>
                  ) : null}
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
