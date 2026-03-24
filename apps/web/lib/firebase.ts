'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

const publicEnv = {
  NEXT_PUBLIC_ENABLE_FIREBASE_AUTH: process.env.NEXT_PUBLIC_ENABLE_FIREBASE_AUTH,
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
} as const;

function readEnv(name: keyof typeof publicEnv) {
  return String(publicEnv[name] || '').trim();
}

export function isFirebaseAuthEnabled() {
  return readEnv('NEXT_PUBLIC_ENABLE_FIREBASE_AUTH') === 'true';
}

export const firebaseConfig = {
  apiKey: readEnv('NEXT_PUBLIC_FIREBASE_API_KEY'),
  authDomain: readEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: readEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnv('NEXT_PUBLIC_FIREBASE_APP_ID'),
};

export function hasFirebaseConfig() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (typeof window !== 'undefined' && isFirebaseAuthEnabled() && hasFirebaseConfig()) {
  firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  firebaseAuth = getAuth(firebaseApp);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
}

export { firebaseApp, firebaseAuth, googleProvider };
