'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { clearTokens, getAccessToken, setTokens } from '../lib/auth';
import { provisionDemoSessionForExternalUser } from '../lib/demo-api';
import { firebaseAuth, isFirebaseAuthEnabled, hasFirebaseConfig } from '../lib/firebase';

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

type SessionUser = {
  id: string;
  email: string;
  fullName: string;
};

type AppSessionContextValue = {
  status: SessionStatus;
  firebaseEnabled: boolean;
  user: SessionUser | null;
  logout: () => Promise<void>;
};

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const firebaseEnabled = isFirebaseAuthEnabled();
  const firebaseReady = firebaseEnabled && hasFirebaseConfig();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    if (!firebaseReady || !firebaseAuth) {
      const hasStoredSession = Boolean(getAccessToken());
      setStatus(hasStoredSession ? 'authenticated' : 'unauthenticated');
      return;
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      if (!firebaseUser?.email) {
        clearTokens();
        setUser(null);
        setStatus('unauthenticated');
        return;
      }

      if (!firebaseUser.emailVerified) {
        clearTokens();
        setUser(null);
        setStatus('unauthenticated');
        return;
      }

      const session = provisionDemoSessionForExternalUser({
        firebaseUid: firebaseUser.uid,
        email: firebaseUser.email,
        fullName: firebaseUser.displayName || firebaseUser.email.split('@')[0] || 'Firebase User',
      });

      setTokens(session.accessToken, session.refreshToken);
      setUser({
        id: session.profile.id,
        email: session.profile.email,
        fullName: session.profile.fullName,
      });
      setStatus('authenticated');
    });

    return unsubscribe;
  }, [firebaseReady]);

  async function logout() {
    if (firebaseReady && firebaseAuth) {
      await signOut(firebaseAuth);
    }
    clearTokens();
    setUser(null);
    setStatus('unauthenticated');
  }

  const value = useMemo<AppSessionContextValue>(
    () => ({
      status,
      firebaseEnabled,
      user,
      logout,
    }),
    [status, firebaseEnabled, user]
  );

  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>;
}

export function useAppSession() {
  const context = useContext(AppSessionContext);
  if (!context) {
    throw new Error('useAppSession must be used within AppSessionProvider');
  }
  return context;
}
