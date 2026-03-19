'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, registerSchema } from '@pillcount/shared';
import { z } from 'zod';
import { ApiError, apiRequest, clearStoredApiBaseUrl, getStoredApiBaseUrl, setStoredApiBaseUrl } from '../../../lib/api';
import { setTokens } from '../../../lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
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
    if (apiFromQuery) {
      const normalized = setStoredApiBaseUrl(apiFromQuery);
      setApiBaseUrl(normalized);
      setConnectionMessage(normalized ? `Connected to ${normalized}` : '');
      return;
    }

    setApiBaseUrl(getStoredApiBaseUrl());
  }, []);

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
  const welcomeMessage = brand?.welcomeMessage || 'Live pill counting, machine monitoring, exports, and audit-ready operations in one place.';
  const supportLabel = brand?.supportLabel || 'Real-time machine control';
  const liveTagline = brand?.liveTagline || 'Monitor your machine, model, and count stream in real time.';
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
      <div className='mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-7xl items-center gap-6 lg:grid-cols-[minmax(0,1.15fr)_460px]'>
        <section className='hidden overflow-hidden rounded-[2.4rem] border border-white/60 bg-[linear-gradient(150deg,rgba(15,23,42,0.98),rgba(8,145,178,0.92)_56%,rgba(16,185,129,0.86))] p-10 text-white shadow-[0_28px_90px_rgba(15,23,42,0.26)] lg:block'>
          <div className='flex items-center gap-4'>
            {logoUrl ? (
              <img src={logoUrl} alt='Brand logo' className='h-16 w-16 rounded-2xl border border-white/20 bg-white/10 object-cover' />
            ) : (
              <div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-white/12 text-xl font-bold tracking-wide'>{brandInitials}</div>
            )}
            <div>
              <p className='text-xs uppercase tracking-[0.28em] text-white/70'>{supportLabel}</p>
              <h1 className='mt-2 text-3xl font-semibold tracking-tight'>{organizationName}</h1>
              <p className='mt-1 text-base text-white/72'>{productName}</p>
            </div>
          </div>

          <div className='mt-14 max-w-2xl space-y-6'>
            <span className='inline-flex rounded-full border border-white/16 bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/76'>
              Secure operator entry
            </span>
            <h2 className='text-5xl font-semibold leading-[1.02] tracking-tight'>{authHeadline}</h2>
            <p className='max-w-xl text-lg leading-8 text-white/82'>{authSubheadline}</p>
            <div className='grid gap-4 pt-4 md:grid-cols-2'>
              <div className='rounded-[24px] border border-white/12 bg-white/10 p-5 backdrop-blur'>
                <p className='text-[11px] uppercase tracking-[0.22em] text-white/65'>What you manage</p>
                <p className='mt-4 text-sm leading-7 text-white/84'>{welcomeMessage}</p>
              </div>
              <div className='rounded-[24px] border border-white/12 bg-white/10 p-5 backdrop-blur'>
                <p className='text-[11px] uppercase tracking-[0.22em] text-white/65'>Live control</p>
                <p className='mt-4 text-sm leading-7 text-white/84'>{liveTagline}</p>
              </div>
            </div>
          </div>
        </section>

        <Card className='w-full'>
          <CardHeader className='space-y-3'>
            <div className='flex items-center gap-3'>
              {logoUrl ? (
                <img src={logoUrl} alt='Brand logo' className='h-12 w-12 rounded-xl border border-border/60 bg-muted/30 object-cover' />
              ) : (
                <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground'>{brandInitials}</div>
              )}
              <div>
                <CardTitle>{productName}</CardTitle>
                <CardDescription>{organizationName}</CardDescription>
              </div>
            </div>
            <div>
              <p className='text-sm font-medium text-slate-900'>{authHeadline}</p>
              <p className='mt-1 text-sm text-muted-foreground'>{authSubheadline}</p>
            </div>
          </CardHeader>

          <CardContent className='space-y-4'>
            <div className='rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(240,249,255,0.85))] p-4 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.5),rgba(15,23,42,0.7))]'>
              <p className='text-sm font-semibold text-slate-900'>API Connection</p>
              <p className='mt-1 text-sm text-muted-foreground'>
                On Vercel or any hosted frontend, paste the public API URL of the machine backend, including `/api`.
              </p>
              <div className='mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]'>
                <Input
                  value={apiBaseUrl}
                  onChange={(event) => setApiBaseUrl(event.target.value)}
                  placeholder='https://your-public-api.example.com/api'
                />
                <Button type='button' variant='secondary' disabled={testingConnection} onClick={() => testApiConnection()}>
                  {testingConnection ? 'Testing...' : 'Test'}
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  onClick={() => {
                    clearStoredApiBaseUrl();
                    setApiBaseUrl('');
                    setConnectionMessage('Using the default same-origin API again.');
                  }}
                >
                  Reset
                </Button>
              </div>
              {connectionMessage ? <p className='mt-2 text-xs text-muted-foreground'>{connectionMessage}</p> : null}
            </div>

            <div className='flex items-center gap-2 rounded-[20px] border border-border/70 bg-muted/40 p-1.5'>
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

            {error ? <p className='rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300'>{error}</p> : null}

            {mode === 'login' ? (
              <form className='space-y-3' onSubmit={loginForm.handleSubmit(handleLogin)}>
                <div>
                  <label className='mb-1 block text-sm font-medium text-slate-900 dark:text-slate-100'>Email</label>
                  <Input type='email' {...loginForm.register('email')} />
                  {loginForm.formState.errors.email ? <p className='mt-1 text-xs text-red-600'>{loginForm.formState.errors.email.message}</p> : null}
                </div>
                <div>
                  <label className='mb-1 block text-sm font-medium text-slate-900 dark:text-slate-100'>Password</label>
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
                  <label className='mb-1 block text-sm font-medium text-slate-900 dark:text-slate-100'>Full name</label>
                  <Input {...registerForm.register('fullName')} />
                  {registerForm.formState.errors.fullName ? <p className='mt-1 text-xs text-red-600'>{registerForm.formState.errors.fullName.message}</p> : null}
                </div>
                <div>
                  <label className='mb-1 block text-sm font-medium text-slate-900 dark:text-slate-100'>Email</label>
                  <Input type='email' {...registerForm.register('email')} />
                  {registerForm.formState.errors.email ? <p className='mt-1 text-xs text-red-600'>{registerForm.formState.errors.email.message}</p> : null}
                </div>
                <div>
                  <label className='mb-1 block text-sm font-medium text-slate-900 dark:text-slate-100'>Password</label>
                  <Input type='password' {...registerForm.register('password')} />
                  {registerForm.formState.errors.password ? <p className='mt-1 text-xs text-red-600'>{registerForm.formState.errors.password.message}</p> : null}
                </div>
                <Button className='w-full' type='submit' disabled={registerForm.formState.isSubmitting}>
                  {registerForm.formState.isSubmitting ? 'Creating account...' : 'Create account'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
