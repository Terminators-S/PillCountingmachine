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
import { AUTH_STATE_EVENT, clearTokens, getAccessToken } from '../lib/auth';
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
    const syncSessionFromStorage = () => {
      const hasStoredSession = Boolean(getAccessToken());
      setStatus(hasStoredSession ? 'authenticated' : 'unauthenticated');
      if (!hasStoredSession) {
        setUser(null);
      }
    };

    syncSessionFromStorage();

    const handleStorage = () => syncSessionFromStorage();
    window.addEventListener(AUTH_STATE_EVENT, handleStorage);
    window.addEventListener('storage', handleStorage);

    let unsubscribe: (() => void) | undefined;
    if (firebaseReady && firebaseAuth) {
      unsubscribe = onAuthStateChanged(firebaseAuth, () => {
        syncSessionFromStorage();
      });
    }

    return () => {
      window.removeEventListener(AUTH_STATE_EVENT, handleStorage);
      window.removeEventListener('storage', handleStorage);
      unsubscribe?.();
    };
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
