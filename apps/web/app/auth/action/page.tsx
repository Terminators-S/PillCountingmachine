'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, MailCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { firebaseAuth } from '../../../lib/firebase';

type ActionState = 'loading' | 'reset' | 'success' | 'error';

function resolveContinueUrl(rawUrl: string | null) {
  const fallback = '/login';
  if (!rawUrl || typeof window === 'undefined') {
    return fallback;
  }

  try {
    const targetUrl = new URL(rawUrl, window.location.origin);
    if (targetUrl.origin === window.location.origin) {
      return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function AuthActionPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || '';
  const oobCode = searchParams.get('oobCode') || '';
  const continueUrl = useMemo(() => resolveContinueUrl(searchParams.get('continueUrl')), [searchParams]);
  const [state, setState] = useState<ActionState>('loading');
  const [message, setMessage] = useState('Preparing secure action...');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function runAction() {
      if (!firebaseAuth) {
        if (!cancelled) {
          setState('error');
          setMessage('Firebase Authentication is not configured for this build.');
        }
        return;
      }

      if (!mode || !oobCode) {
        if (!cancelled) {
          setState('error');
          setMessage('This email action link is incomplete or invalid.');
        }
        return;
      }

      if (typeof navigator !== 'undefined') {
        firebaseAuth.languageCode = navigator.language || 'en';
      }

      try {
        if (mode === 'verifyEmail') {
          await applyActionCode(firebaseAuth, oobCode);
          if (!cancelled) {
            setState('success');
            setMessage('Your email has been verified. You can sign in to the operations console now.');
          }
          return;
        }

        if (mode === 'resetPassword') {
          const verifiedEmail = await verifyPasswordResetCode(firebaseAuth, oobCode);
          if (!cancelled) {
            setEmail(verifiedEmail);
            setState('reset');
            setMessage('Create a new password for your account.');
          }
          return;
        }

        if (mode === 'recoverEmail') {
          await checkActionCode(firebaseAuth, oobCode);
          await applyActionCode(firebaseAuth, oobCode);
          if (!cancelled) {
            setState('success');
            setMessage('Your email address change has been reverted successfully.');
          }
          return;
        }

        if (!cancelled) {
          setState('error');
          setMessage('This email action is not supported by the current web flow.');
        }
      } catch (error) {
        if (!cancelled) {
          setState('error');
          setMessage(error instanceof Error ? error.message : 'The action link is expired or invalid.');
        }
      }
    }

    runAction();
    return () => {
      cancelled = true;
    };
  }, [mode, oobCode]);

  async function handlePasswordResetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firebaseAuth) {
      setState('error');
      setMessage('Firebase Authentication is not configured for this build.');
      return;
    }

    if (password.length < 8) {
      setMessage('Use at least 8 characters for your new password.');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(firebaseAuth, oobCode, password);
      setState('success');
      setMessage('Your password has been updated. You can sign in with the new password now.');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Password reset failed.');
    } finally {
      setSubmitting(false);
    }
  }

  const heading =
    state === 'reset'
      ? 'Reset your password'
      : state === 'success'
        ? 'Action completed'
        : state === 'error'
          ? 'Action unavailable'
          : 'Secure email action';

  return (
    <div className='min-h-screen bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.15),transparent_35%),linear-gradient(180deg,#f8fbff_0%,#eef5fb_100%)] px-4 py-8'>
      <div className='mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center'>
        <Card className='w-full max-w-[640px] rounded-[2rem] border border-white/80 bg-white/94 shadow-[0_28px_120px_rgba(15,23,42,0.14)] backdrop-blur-xl'>
          <CardHeader className='space-y-5 px-7 pt-7 md:px-9 md:pt-9'>
            <div className='flex items-center gap-4'>
              <div className='flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f172a,#0891b2_62%,#34d399)] text-lg font-bold tracking-[0.08em] text-white'>
                PO
              </div>
              <div>
                <p className='text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400'>PillCount Operations</p>
                <CardTitle className='text-2xl text-slate-950'>{heading}</CardTitle>
              </div>
            </div>

            <div className='rounded-2xl border border-slate-200 bg-slate-50/80 p-4'>
              <div className='flex items-start gap-3'>
                <div className='mt-0.5 rounded-xl bg-sky-50 p-2 text-sky-600'>
                  {state === 'success' ? (
                    <CheckCircle2 className='h-5 w-5' />
                  ) : state === 'error' ? (
                    <AlertTriangle className='h-5 w-5' />
                  ) : state === 'reset' ? (
                    <KeyRound className='h-5 w-5' />
                  ) : (
                    <MailCheck className='h-5 w-5' />
                  )}
                </div>
                <div>
                  <p className='text-sm font-semibold text-slate-950'>Protected account flow</p>
                  <p className='mt-1 text-sm leading-6 text-slate-500'>{message}</p>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className='space-y-6 px-7 pb-7 md:px-9 md:pb-9'>
            {state === 'loading' ? (
              <div className='flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-slate-600'>
                <Loader2 className='h-5 w-5 animate-spin text-sky-600' />
                <span>Validating your secure email link...</span>
              </div>
            ) : null}

            {state === 'reset' ? (
              <form className='space-y-5' onSubmit={handlePasswordResetSubmit}>
                <div className='space-y-2'>
                  <label className='block text-[15px] font-medium text-slate-950'>Account</label>
                  <Input value={email} readOnly className='h-14 rounded-2xl bg-slate-50 px-4 text-base text-slate-500' />
                </div>

                <div className='space-y-2'>
                  <label className='block text-[15px] font-medium text-slate-950'>New password</label>
                  <Input
                    type='password'
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder='Create a new password'
                    className='h-14 rounded-2xl px-4 text-base'
                  />
                </div>

                <div className='space-y-2'>
                  <label className='block text-[15px] font-medium text-slate-950'>Confirm password</label>
                  <Input
                    type='password'
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder='Re-enter your new password'
                    className='h-14 rounded-2xl px-4 text-base'
                  />
                </div>

                <div className='flex gap-3'>
                  <Button type='submit' className='h-14 flex-1 rounded-2xl text-base' disabled={submitting}>
                    {submitting ? 'Updating password...' : 'Save new password'}
                  </Button>
                  <Button type='button' variant='secondary' className='h-14 rounded-2xl px-6' onClick={() => router.replace('/login')}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}

            {state === 'success' || state === 'error' ? (
              <div className='flex flex-col gap-3 sm:flex-row'>
                <Button className='h-14 flex-1 rounded-2xl text-base' onClick={() => router.replace(continueUrl || '/login')}>
                  Continue to sign in
                </Button>
                {state === 'error' ? (
                  <Button type='button' variant='secondary' className='h-14 rounded-2xl px-6' onClick={() => router.replace('/login')}>
                    Return to login
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense fallback={<div className='min-h-screen bg-background' />}>
      <AuthActionPageContent />
    </Suspense>
  );
}
