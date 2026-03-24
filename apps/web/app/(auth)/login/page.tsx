'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, SlidersHorizontal, Workflow } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, registerSchema } from '@pillcount/shared';
import { z } from 'zod';
import { ApiError, apiRequest, clearStoredApiBaseUrl, getStoredApiBaseUrl, setStoredApiBaseUrl } from '../../../lib/api';
import { getAccessToken, getRefreshToken, setTokens, syncAuthCookiesFromStorage } from '../../../lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { AppBrandingSettings } from '../../../types/api';

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);

  const branding = useQuery({
    queryKey: ['app-settings', 'public', 'login'],
    queryFn: () => apiRequest<AppBrandingSettings>('/app-settings/public'),
    staleTime: 60_000
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setMode(params.get('mode') === 'register' ? 'register' : 'login');
    const apiFromQuery = params.get('apiBaseUrl') || '';

    const storedAccessToken = getAccessToken();
    const storedRefreshToken = getRefreshToken();
    if (storedAccessToken || storedRefreshToken) {
      syncAuthCookiesFromStorage();
      router.replace('/overview');
      return;
    }

    if (apiFromQuery) {
      const normalized = setStoredApiBaseUrl(apiFromQuery);
      setApiBaseUrl(normalized);
      setConnectionMessage(normalized ? `Connected to ${normalized}` : '');
      return;
    }

    setApiBaseUrl(getStoredApiBaseUrl());
  }, [router]);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', fullName: '' }
  });

  async function handleLogin(values: LoginFormValues) {
    setError('');
    try {
      const payload = await apiRequest<{ accessToken: string; refreshToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      setTokens(payload.accessToken, payload.refreshToken);
      router.replace('/overview');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    }
  }

  async function handleRegister(values: RegisterFormValues) {
    setError('');
    try {
      const payload = await apiRequest<{ accessToken: string; refreshToken: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      setTokens(payload.accessToken, payload.refreshToken);
      router.replace('/overview');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    }
  }

  async function testApiConnection() {
    setTestingConnection(true);
    setConnectionMessage('');

    try {
      const normalized = setStoredApiBaseUrl(apiBaseUrl);
      if (!normalized) {
        throw new Error('Enter the full API URL, for example https://your-public-api.example.com/api');
      }

      const response = await fetch(`${normalized}/app-settings/public`);
      if (!response.ok) {
        throw new Error(`API responded with ${response.status}.`);
      }

      setConnectionMessage(`Connected to ${normalized}`);
    } catch (err) {
      setConnectionMessage(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTestingConnection(false);
    }
  }

  const brand = branding.data;
  const organizationName = brand?.organizationName || 'Pharmacy Operations';
  const productName = brand?.productName || 'PillCount Operations Console';
  const authHeadline = brand?.authHeadline || 'Secure operator sign-in';
  const authSubheadline = brand?.authSubheadline || 'Access the pharmacy and warehouse workflow with your staff account.';
  const supportLabel = brand?.supportLabel || 'Real-time machine control';
  const logoUrl = brand?.logoUrl || '';
  const brandInitials =
    organizationName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment[0]?.toUpperCase() || '')
      .join('') || 'PC';

  return (
    <div className='min-h-screen p-4 md:p-5'>
      <div className='mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-6xl items-center gap-5 lg:grid-cols-[minmax(0,0.95fr)_440px]'>
        <section className='hidden overflow-hidden rounded-[2rem] border border-white/60 bg-[linear-gradient(150deg,rgba(15,23,42,0.98),rgba(8,145,178,0.92)_56%,rgba(16,185,129,0.84))] p-8 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)] lg:block'>
          <div className='flex items-center gap-3'>
            {logoUrl ? (
              <img src={logoUrl} alt='Brand logo' className='h-14 w-14 rounded-2xl border border-white/20 bg-white/10 object-cover' />
            ) : (
              <div className='flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 text-lg font-bold tracking-wide'>{brandInitials}</div>
            )}
            <div>
              <p className='text-[11px] uppercase tracking-[0.22em] text-white/70'>{supportLabel}</p>
              <h1 className='mt-1 text-2xl font-semibold tracking-tight'>{organizationName}</h1>
              <p className='text-sm text-white/72'>{productName}</p>
            </div>
          </div>

          <div className='mt-10 max-w-xl space-y-4'>
            <span className='inline-flex rounded-full border border-white/16 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/76'>
              Staff access
            </span>
            <h2 className='text-4xl font-semibold leading-tight tracking-tight'>{authHeadline}</h2>
            <p className='text-base leading-7 text-white/82'>{authSubheadline}</p>
          </div>

          <div className='mt-8 grid gap-3'>
            <div className='rounded-[20px] border border-white/12 bg-white/10 p-4 backdrop-blur'>
              <div className='flex items-start gap-3'>
                <ShieldCheck className='mt-0.5 h-5 w-5 text-white/82' />
                <div>
                  <p className='text-sm font-semibold'>Secure staff entry</p>
                  <p className='mt-1 text-sm text-white/72'>Role-based access keeps operator, admin, and audit workflows separated.</p>
                </div>
              </div>
            </div>
            <div className='rounded-[20px] border border-white/12 bg-white/10 p-4 backdrop-blur'>
              <div className='flex items-start gap-3'>
                <Workflow className='mt-0.5 h-5 w-5 text-white/82' />
                <div>
                  <p className='text-sm font-semibold'>Daily operations first</p>
                  <p className='mt-1 text-sm text-white/72'>Jump from sign-in to overview, live control, and recent work without extra setup screens.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Card className='w-full'>
          <CardHeader className='space-y-3'>
            <div className='flex items-center gap-3'>
              {logoUrl ? (
                <img src={logoUrl} alt='Brand logo' className='h-11 w-11 rounded-xl border border-border/60 bg-muted/30 object-cover' />
              ) : (
                <div className='flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground'>{brandInitials}</div>
              )}
              <div>
                <p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground'>Secure access</p>
                <CardTitle>{productName}</CardTitle>
              </div>
            </div>

            <div className='space-y-2'>
              <p className='text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50'>{authHeadline}</p>
              <p className='text-sm text-muted-foreground'>{authSubheadline}</p>
            </div>
          </CardHeader>

          <CardContent className='space-y-4'>
            <div className='flex items-center gap-2 rounded-xl border border-border/70 bg-muted/35 p-1.5'>
              <Button
                variant={mode === 'login' ? 'default' : 'ghost'}
                className='flex-1'
                type='button'
                onClick={() => {
                  setMode('login');
                  router.replace('/login');
                }}
              >
                Login
              </Button>
              <Button
                variant={mode === 'register' ? 'default' : 'ghost'}
                className='flex-1'
                type='button'
                onClick={() => {
                  setMode('register');
                  router.replace('/login?mode=register');
                }}
              >
                Register
              </Button>
            </div>

            {error ? <p className='rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700'>{error}</p> : null}

            {mode === 'login' ? (
              <form className='space-y-3' onSubmit={loginForm.handleSubmit(handleLogin)}>
                <div>
                  <label className='mb-1.5 block text-sm font-medium text-slate-900 dark:text-slate-100'>Email</label>
                  <Input type='email' {...loginForm.register('email')} />
                  {loginForm.formState.errors.email ? <p className='mt-1 text-xs text-red-600'>{loginForm.formState.errors.email.message}</p> : null}
                </div>
                <div>
                  <label className='mb-1.5 block text-sm font-medium text-slate-900 dark:text-slate-100'>Password</label>
                  <Input type='password' {...loginForm.register('password')} />
                  {loginForm.formState.errors.password ? <p className='mt-1 text-xs text-red-600'>{loginForm.formState.errors.password.message}</p> : null}
                </div>
                <Button className='w-full' type='submit' disabled={loginForm.formState.isSubmitting}>
                  {loginForm.formState.isSubmitting ? 'Signing in...' : 'Sign in'}
                </Button>
              </form>
            ) : (
              <form className='space-y-3' onSubmit={registerForm.handleSubmit(handleRegister)}>
                <div>
                  <label className='mb-1.5 block text-sm font-medium text-slate-900 dark:text-slate-100'>Full name</label>
                  <Input {...registerForm.register('fullName')} />
                  {registerForm.formState.errors.fullName ? <p className='mt-1 text-xs text-red-600'>{registerForm.formState.errors.fullName.message}</p> : null}
                </div>
                <div>
                  <label className='mb-1.5 block text-sm font-medium text-slate-900 dark:text-slate-100'>Email</label>
                  <Input type='email' {...registerForm.register('email')} />
                  {registerForm.formState.errors.email ? <p className='mt-1 text-xs text-red-600'>{registerForm.formState.errors.email.message}</p> : null}
                </div>
                <div>
                  <label className='mb-1.5 block text-sm font-medium text-slate-900 dark:text-slate-100'>Password</label>
                  <Input type='password' {...registerForm.register('password')} />
                  {registerForm.formState.errors.password ? <p className='mt-1 text-xs text-red-600'>{registerForm.formState.errors.password.message}</p> : null}
                </div>
                <Button className='w-full' type='submit' disabled={registerForm.formState.isSubmitting}>
                  {registerForm.formState.isSubmitting ? 'Creating account...' : 'Create account'}
                </Button>
              </form>
            )}

            <details className='surface-subtle rounded-2xl p-3' open={Boolean(apiBaseUrl || connectionMessage)}>
              <summary className='flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50'>
                <SlidersHorizontal className='h-4 w-4 text-muted-foreground' />
                Advanced connection settings
              </summary>
              <div className='mt-3 space-y-3'>
                <p className='text-sm text-muted-foreground'>
                  Use this only when the frontend needs to point at a different public API endpoint.
                </p>
                <Input
                  value={apiBaseUrl}
                  onChange={(event) => setApiBaseUrl(event.target.value)}
                  placeholder='https://your-public-api.example.com/api'
                />
                <div className='flex flex-wrap gap-2'>
                  <Button type='button' variant='secondary' size='sm' disabled={testingConnection} onClick={() => testApiConnection()}>
                    {testingConnection ? 'Testing...' : 'Test connection'}
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => {
                      clearStoredApiBaseUrl();
                      setApiBaseUrl('');
                      setConnectionMessage('Using the default same-origin API again.');
                    }}
                  >
                    Reset
                  </Button>
                </div>
                {connectionMessage ? <p className='text-xs text-muted-foreground'>{connectionMessage}</p> : null}
              </div>
            </details>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
