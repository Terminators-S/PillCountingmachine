'use client';

import { Suspense, SVGProps, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, MailCheck, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, registerSchema } from '@pillcount/shared';
import { z } from 'zod';
import {
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { ApiError, apiRequest, clearStoredApiBaseUrl, getStoredApiBaseUrl, setStoredApiBaseUrl } from '../../../lib/api';
import { getAccessToken, getRefreshToken, setTokens, syncAuthCookiesFromStorage } from '../../../lib/auth';
import { firebaseAuth, googleProvider, isFirebaseAuthEnabled, hasFirebaseConfig } from '../../../lib/firebase';
import { cn } from '../../../lib/utils';
import { useAppSession } from '../../../components/app-session-provider';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { AppBrandingSettings } from '../../../types/api';

type AuthMode = 'login' | 'register';
type LoginFormValues = z.infer<typeof loginSchema>;
const productionRegisterSchema = registerSchema
  .extend({
    confirmPassword: z.string().min(8, 'Confirm your password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });
type RegisterFormValues = z.infer<typeof productionRegisterSchema>;
type AuthHeroPanelProps = {
  logoUrl: string;
  brandInitials: string;
  organizationName: string;
  productName: string;
  className?: string;
  centered?: boolean;
  interactive?: boolean;
  onClick?: () => void;
};

function GoogleMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' focusable='false' {...props}>
      <path
        fill='#4285F4'
        d='M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.29h6.48a5.53 5.53 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.56-5.16 3.56-8.66Z'
      />
      <path
        fill='#34A853'
        d='M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3.01c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.26v3.11A12 12 0 0 0 12 24Z'
      />
      <path
        fill='#FBBC05'
        d='M5.27 14.28A7.18 7.18 0 0 1 4.9 12c0-.79.14-1.56.37-2.28V6.61H1.26A12 12 0 0 0 0 12c0 1.94.46 3.78 1.26 5.39l4.01-3.11Z'
      />
      <path
        fill='#EA4335'
        d='M12 4.77c1.76 0 3.34.61 4.58 1.79l3.43-3.43C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.26 6.61l4.01 3.11c.95-2.84 3.6-4.95 6.73-4.95Z'
      />
    </svg>
  );
}

function resolveAuthMode(mode: string | null | undefined, fallback: AuthMode): AuthMode {
  return mode === 'register' ? 'register' : fallback;
}

function isHostedUiSession() {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname.toLowerCase();
  return !['localhost', '127.0.0.1'].includes(hostname);
}

function AuthHeroPanel({
  logoUrl,
  brandInitials,
  organizationName,
  productName,
  className,
  centered = false,
  interactive = false,
  onClick,
}: AuthHeroPanelProps) {
  const content = (
    <>
      <div className='absolute -left-16 top-20 h-52 w-52 rounded-full bg-white/10 blur-3xl' />
      <div className='absolute bottom-0 right-0 h-64 w-64 rounded-full bg-emerald-300/10 blur-3xl' />

      <div className={cn('relative flex h-full flex-col', centered && 'items-center justify-center text-center')}>
        <div className={cn('flex items-center gap-4', centered && 'justify-center')}>
          {logoUrl ? (
            <img src={logoUrl} alt='Brand logo' className='h-16 w-16 rounded-2xl border border-white/16 bg-white/10 object-cover' />
          ) : (
            <div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-white/12 text-2xl font-bold tracking-[0.08em]'>{brandInitials}</div>
          )}
          <div className={cn(centered && 'text-left')}>
            <h1 className='text-4xl font-semibold tracking-tight'>{organizationName}</h1>
            <p className='mt-1 text-sm text-white/72'>{productName}</p>
          </div>
        </div>

        <div className={cn('flex flex-1 flex-col items-center text-center', centered ? 'mt-12 max-w-2xl justify-center' : 'mx-auto mt-10 max-w-xl')}>
          <span className='inline-flex rounded-full border border-white/16 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/78'>
            Staff access
          </span>
          <h2 className='mt-4 text-5xl font-semibold leading-[1.04] tracking-tight'>Sign in and start.</h2>
          <p className='mt-3 max-w-sm text-base leading-7 text-white/76'>Live, inventory, and reports in one place.</p>
        </div>
      </div>
    </>
  );

  const baseClassName = cn(
    'relative overflow-hidden rounded-[2rem] border border-white/60 bg-[linear-gradient(145deg,rgba(15,23,42,0.98),rgba(8,145,178,0.90)_58%,rgba(52,211,153,0.74))] text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]',
    interactive &&
      'group w-full cursor-pointer transition-[transform,box-shadow,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:shadow-[0_30px_90px_rgba(15,23,42,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-4 focus-visible:ring-offset-slate-100',
    className
  );

  if (interactive) {
    return (
      <button type='button' onClick={onClick} className={baseClassName} aria-label='Open sign-in'>
        {content}
      </button>
    );
  }

  return <section className={baseClassName}>{content}</section>;
}

function LoginPageContent({ initialMode = 'login' }: { initialMode?: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, firebaseEnabled } = useAppSession();
  const requestedMode = useMemo(() => resolveAuthMode(searchParams.get('mode'), initialMode), [initialMode, searchParams]);
  const [mode, setMode] = useState<AuthMode>(requestedMode);
  const [introActive, setIntroActive] = useState(() => requestedMode === 'login');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const firebaseReady = firebaseEnabled && hasFirebaseConfig() && Boolean(firebaseAuth);

  const branding = useQuery({
    queryKey: ['app-settings', 'public', 'login'],
    queryFn: () => apiRequest<AppBrandingSettings>('/app-settings/public'),
    staleTime: 60_000
  });

  useEffect(() => {
    const apiFromQuery = searchParams.get('apiBaseUrl') || '';

    if (status === 'authenticated') {
      router.replace('/overview');
      return;
    }

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

    const storedApiBaseUrl = getStoredApiBaseUrl();
    setApiBaseUrl(storedApiBaseUrl);
    if (!storedApiBaseUrl && isHostedUiSession()) {
      setConnectionMessage('Enter your public API URL below, then test the connection before signing in.');
    }
  }, [router, searchParams, status]);

  useEffect(() => {
    setMode(requestedMode);
    if (requestedMode === 'register') {
      setIntroActive(false);
    }
  }, [requestedMode]);

  function clearUiState() {
    setError('');
    setNotice('');
  }

  function switchMode(nextMode: AuthMode) {
    clearUiState();
    setMode(nextMode);
    setIntroActive(false);
    setShowLoginPassword(false);
    setShowRegisterPassword(false);
    setShowConfirmPassword(false);

    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', nextMode === 'register' ? '/register' : '/login');
    }
  }

  function normalizeFirebaseError(err: unknown, fallback: string) {
    if (err instanceof Error) {
      if (err.message.includes('auth/invalid-credential')) return 'Invalid email or password.';
      if (err.message.includes('auth/email-already-in-use')) return 'That email is already registered.';
      if (err.message.includes('auth/user-not-found')) return 'No account was found for that email.';
      if (err.message.includes('auth/invalid-email')) return 'Enter a valid email address.';
      if (err.message.includes('auth/popup-closed-by-user')) return 'The Google sign-in popup was closed before login completed.';
      if (err.message.includes('auth/popup-blocked')) return 'The browser blocked the popup. Allow popups and try again.';
      if (err.message.includes('auth/cancelled-popup-request')) return 'The previous Google sign-in popup was interrupted. Try again.';
      return err.message;
    }
    return fallback;
  }

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(productionRegisterSchema),
    defaultValues: { email: '', password: '', fullName: '', confirmPassword: '' }
  });

  async function handleLogin(values: LoginFormValues) {
    clearUiState();
    setCredentialBusy(true);
    try {
      const payload = await apiRequest<{ accessToken: string; refreshToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      setTokens(payload.accessToken, payload.refreshToken);
      router.replace('/overview');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setCredentialBusy(false);
    }
  }

  async function handleRegister(values: RegisterFormValues) {
    clearUiState();
    setCredentialBusy(true);
    try {
      const payload = await apiRequest<{ accessToken: string; refreshToken: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      setTokens(payload.accessToken, payload.refreshToken);
      router.replace('/overview');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setCredentialBusy(false);
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

  async function handleGoogleLogin() {
    clearUiState();
    if (!firebaseEnabled || !firebaseReady || !firebaseAuth || !googleProvider) {
      setError(
        isFirebaseAuthEnabled() && !hasFirebaseConfig()
          ? 'Firebase Auth is enabled but the Firebase web config is incomplete.'
          : 'Google sign-in is not configured for this build.'
      );
      return;
    }

    setGoogleBusy(true);
    if (typeof window !== 'undefined') {
      window.addEventListener(
        'focus',
        () => {
          window.setTimeout(() => {
            setGoogleBusy(false);
          }, 500);
        },
        { once: true }
      );
    }
    try {
      const credential = await signInWithPopup(firebaseAuth, googleProvider);
      const idToken = await credential.user.getIdToken();

      if (!idToken) {
        throw new Error('Google did not return a usable ID token.');
      }

      const payload = await apiRequest<{ accessToken: string; refreshToken: string }>('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken })
      });
      setTokens(payload.accessToken, payload.refreshToken);
      await signOut(firebaseAuth).catch(() => undefined);
      router.replace('/overview');
    } catch (err) {
      await signOut(firebaseAuth).catch(() => undefined);
      setError(normalizeFirebaseError(err, 'Google sign-in failed.'));
    } finally {
      setGoogleBusy(false);
    }
  }

  useEffect(() => {
    clearUiState();
    setShowLoginPassword(false);
    setShowRegisterPassword(false);
    setShowConfirmPassword(false);
  }, [mode]);

  const brand = branding.data;
  const organizationName = brand?.organizationName || 'Pharmacy Operations';
  const productName = brand?.productName || 'PillCount Operations Console';
  const logoUrl = brand?.logoUrl || '';
  const brandInitials =
    organizationName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment[0]?.toUpperCase() || '')
      .join('') || 'PC';
  const authHeadline = mode === 'login' ? 'Operator sign in' : 'Create your staff account';
  const authSubheadline =
    mode === 'login'
      ? 'Use your verified work email to access the live operations workspace.'
      : 'Register with your name, work email, and password. New accounts must verify email before access is granted.';
  const googleLabel = mode === 'login' ? 'Continue with Google' : 'Sign up with Google';
  const submitLabel = mode === 'login' ? 'Sign in' : 'Create account';
  const submitBusyLabel = mode === 'login' ? 'Signing in...' : 'Creating account...';

  return (
    <div className='min-h-screen p-4 md:p-5'>
      <div className='mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-6xl items-center justify-center'>
        <div className='relative w-full'>
          <div
            className={cn(
              'flex min-h-[calc(100vh-2.5rem)] w-full items-center justify-center transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
              introActive ? 'pointer-events-none translate-y-10 scale-[0.985] opacity-0 blur-[3px]' : 'translate-y-0 scale-100 opacity-100 blur-0'
            )}
          >
            <Card className='relative w-full max-w-[580px] overflow-hidden rounded-[2rem] border border-white/72 bg-white/94 shadow-[0_30px_110px_rgba(15,23,42,0.15)] backdrop-blur-xl'>
              <div className='absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-sky-300 to-transparent' />

              <CardHeader className='space-y-6 px-7 pt-7 md:px-8 md:pt-8'>
                <div className='flex items-center gap-3'>
                  {logoUrl ? (
                    <img src={logoUrl} alt='Brand logo' className='h-12 w-12 rounded-2xl border border-border/60 bg-muted/30 object-cover' />
                  ) : (
                    <div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground'>{brandInitials}</div>
                  )}
                  <div>
                    <p className='text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground'>Secure access</p>
                    <CardTitle className='text-xl text-slate-950'>{productName}</CardTitle>
                  </div>
                </div>

                <div className='rounded-2xl border border-slate-200 bg-slate-50/90 p-1'>
                  <div className='grid grid-cols-2 gap-1'>
                    <button
                      type='button'
                      onClick={() => switchMode('login')}
                      className={cn(
                        'rounded-[1rem] px-4 py-3 text-sm font-semibold transition-all',
                        mode === 'login' ? 'bg-white text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.10)]' : 'text-slate-500 hover:text-slate-800'
                      )}
                    >
                      Sign in
                    </button>
                    <button
                      type='button'
                      onClick={() => switchMode('register')}
                      className={cn(
                        'rounded-[1rem] px-4 py-3 text-sm font-semibold transition-all',
                        mode === 'register' ? 'bg-white text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.10)]' : 'text-slate-500 hover:text-slate-800'
                      )}
                    >
                      Create account
                    </button>
                  </div>
                </div>

                <div className='space-y-3'>
                  <p className='text-[2.15rem] font-semibold tracking-tight text-slate-950'>{authHeadline}</p>
                  <p className='max-w-md text-[15px] leading-7 text-slate-500'>{authSubheadline}</p>
                </div>
              </CardHeader>

              <CardContent className='space-y-6 px-7 pb-7 md:px-8 md:pb-8'>
                <div className='rounded-2xl border border-slate-200 bg-slate-50/80 p-4'>
                  <div className='flex items-start gap-3'>
                    <div className='mt-0.5 rounded-xl bg-emerald-50 p-2 text-emerald-600'>
                      {mode === 'login' ? <ShieldCheck className='h-4 w-4' /> : <MailCheck className='h-4 w-4' />}
                    </div>
                    <div>
                      <p className='text-sm font-semibold text-slate-950'>
                        {mode === 'login' ? 'Staff account access' : 'Create a staff account'}
                      </p>
                      <p className='mt-1 text-sm leading-6 text-slate-500'>
                        {mode === 'login'
                          ? 'Sign in with your work account or Google to open the operations console.'
                          : 'Create a staff account here. Roles can be adjusted later in Users & Roles.'}
                      </p>
                    </div>
                  </div>
                </div>

                {error ? <p className='rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700'>{error}</p> : null}
                {notice ? <p className='rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700'>{notice}</p> : null}

                {mode === 'login' ? (
                  <form className='space-y-5' onSubmit={loginForm.handleSubmit(handleLogin)}>
                    <div className='space-y-2'>
                      <label className='block text-[15px] font-medium text-slate-950'>Work email</label>
                      <Input id='login-email' type='email' placeholder='name@company.com' className='h-14 rounded-2xl px-4 text-base' {...loginForm.register('email')} />
                      {loginForm.formState.errors.email ? <p className='mt-1 text-xs text-red-600'>{loginForm.formState.errors.email.message}</p> : null}
                    </div>
                    <div className='space-y-2'>
                      <label className='block text-[15px] font-medium text-slate-950'>Password</label>
                      <div className='relative'>
                        <Input
                          id='login-password'
                          type={showLoginPassword ? 'text' : 'password'}
                          placeholder='Enter your password'
                          className='h-14 rounded-2xl px-4 pr-14 text-base'
                          {...loginForm.register('password')}
                        />
                        <button
                          type='button'
                          onClick={() => setShowLoginPassword((value) => !value)}
                          className='absolute inset-y-0 right-4 flex items-center text-slate-400 transition-colors hover:text-slate-700'
                          aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                        >
                          {showLoginPassword ? <EyeOff className='h-5 w-5' /> : <Eye className='h-5 w-5' />}
                        </button>
                      </div>
                      {loginForm.formState.errors.password ? <p className='mt-1 text-xs text-red-600'>{loginForm.formState.errors.password.message}</p> : null}
                    </div>

                    <Button className='h-14 w-full rounded-2xl text-lg' type='submit' disabled={loginForm.formState.isSubmitting || credentialBusy}>
                      {loginForm.formState.isSubmitting || credentialBusy ? submitBusyLabel : submitLabel}
                    </Button>

                    <p className='text-center text-sm text-slate-500'>
                      New here?{' '}
                      <button type='button' onClick={() => switchMode('register')} className='font-medium text-blue-600 transition-colors hover:text-blue-700'>
                        Create your account
                      </button>
                    </p>
                  </form>
                ) : (
                  <form className='space-y-5' onSubmit={registerForm.handleSubmit(handleRegister)}>
                    <div className='grid gap-5 sm:grid-cols-2'>
                      <div className='space-y-2 sm:col-span-2'>
                        <label className='block text-[15px] font-medium text-slate-950'>Full name</label>
                        <Input id='register-full-name' placeholder='Enter your full name' className='h-14 rounded-2xl px-4 text-base' {...registerForm.register('fullName')} />
                        <p className='text-sm text-slate-500'>We use your name to identify staff access across the console.</p>
                        {registerForm.formState.errors.fullName ? <p className='mt-1 text-xs text-red-600'>{registerForm.formState.errors.fullName.message}</p> : null}
                      </div>
                      <div className='space-y-2 sm:col-span-2'>
                        <label className='block text-[15px] font-medium text-slate-950'>Work email</label>
                        <Input id='register-email' type='email' placeholder='name@company.com' className='h-14 rounded-2xl px-4 text-base' {...registerForm.register('email')} />
                        {registerForm.formState.errors.email ? <p className='mt-1 text-xs text-red-600'>{registerForm.formState.errors.email.message}</p> : null}
                      </div>
                      <div className='space-y-2'>
                        <label className='block text-[15px] font-medium text-slate-950'>Password</label>
                        <div className='relative'>
                          <Input
                            id='register-password'
                            type={showRegisterPassword ? 'text' : 'password'}
                            placeholder='Create a password'
                            className='h-14 rounded-2xl px-4 pr-14 text-base'
                            {...registerForm.register('password')}
                          />
                          <button
                            type='button'
                            onClick={() => setShowRegisterPassword((value) => !value)}
                            className='absolute inset-y-0 right-4 flex items-center text-slate-400 transition-colors hover:text-slate-700'
                            aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}
                          >
                            {showRegisterPassword ? <EyeOff className='h-5 w-5' /> : <Eye className='h-5 w-5' />}
                          </button>
                        </div>
                        {registerForm.formState.errors.password ? <p className='mt-1 text-xs text-red-600'>{registerForm.formState.errors.password.message}</p> : null}
                      </div>
                      <div className='space-y-2'>
                        <label className='block text-[15px] font-medium text-slate-950'>Confirm password</label>
                        <div className='relative'>
                          <Input
                            id='register-confirm-password'
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder='Re-enter your password'
                            className='h-14 rounded-2xl px-4 pr-14 text-base'
                            {...registerForm.register('confirmPassword')}
                          />
                          <button
                            type='button'
                            onClick={() => setShowConfirmPassword((value) => !value)}
                            className='absolute inset-y-0 right-4 flex items-center text-slate-400 transition-colors hover:text-slate-700'
                            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                          >
                            {showConfirmPassword ? <EyeOff className='h-5 w-5' /> : <Eye className='h-5 w-5' />}
                          </button>
                        </div>
                        {registerForm.formState.errors.confirmPassword ? (
                          <p className='mt-1 text-xs text-red-600'>{registerForm.formState.errors.confirmPassword.message}</p>
                        ) : null}
                      </div>
                    </div>
                    <Button className='h-14 w-full rounded-2xl text-lg' type='submit' disabled={registerForm.formState.isSubmitting || credentialBusy}>
                      {registerForm.formState.isSubmitting || credentialBusy ? submitBusyLabel : submitLabel}
                    </Button>

                    <p className='text-center text-sm text-slate-500'>
                      Already have an account?{' '}
                      <button type='button' onClick={() => switchMode('login')} className='font-medium text-blue-600 transition-colors hover:text-blue-700'>
                        Sign in
                      </button>
                    </p>
                  </form>
                )}

                {firebaseEnabled ? (
                  <div className='space-y-4'>
                    <div className='flex items-center gap-4'>
                      <div className='h-px flex-1 bg-slate-200' />
                      <span className='text-xs font-medium uppercase tracking-[0.26em] text-slate-400'>
                        {mode === 'login' ? 'Or continue with' : 'Or continue with'}
                      </span>
                      <div className='h-px flex-1 bg-slate-200' />
                    </div>

                    <Button
                      type='button'
                      variant='secondary'
                      className='h-14 w-full rounded-2xl border-slate-200 text-base font-semibold'
                      onClick={() => handleGoogleLogin()}
                      disabled={googleBusy}
                    >
                      <GoogleMark className='mr-3 h-5 w-5 shrink-0' />
                      {googleBusy ? 'Opening Google...' : googleLabel}
                    </Button>
                  </div>
                ) : null}

                {isHostedUiSession() || apiBaseUrl || connectionMessage ? (
                  <details
                    className='rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4'
                    open={Boolean(apiBaseUrl || connectionMessage)}
                  >
                    <summary className='flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-900'>
                      <SlidersHorizontal className='h-4 w-4 text-muted-foreground' />
                      Advanced connection
                    </summary>
                    <div className='mt-3 space-y-3'>
                      <p className='text-xs text-muted-foreground'>
                        Hosted UI needs the real support API URL to reach login, Pi remote control, and live runtime data.
                      </p>
                      <Input
                        value={apiBaseUrl}
                        onChange={(event) => setApiBaseUrl(event.target.value)}
                        placeholder='https://your-public-api.example.com/api'
                      />
                      <div className='flex flex-wrap gap-2'>
                        <Button type='button' variant='secondary' size='sm' disabled={testingConnection} onClick={() => testApiConnection()}>
                          {testingConnection ? 'Testing...' : 'Test'}
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
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center px-4 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
              introActive ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
          >
            <AuthHeroPanel
              logoUrl={logoUrl}
              brandInitials={brandInitials}
              organizationName={organizationName}
              productName={productName}
              centered
              interactive
              onClick={() => setIntroActive(false)}
              className={cn(
                'max-w-[980px] px-10 py-12 sm:px-14 sm:py-16',
                introActive ? 'translate-y-0 scale-100 opacity-100' : 'scale-[0.92] -translate-y-10 opacity-0'
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className='min-h-screen bg-background' />}>
      <LoginPageContent />
    </Suspense>
  );
}
