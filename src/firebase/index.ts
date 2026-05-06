
'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

/** Réutilise la même instance Firestore par app (évite un 2ᵉ `initializeFirestore` en dev / HMR). */
const firestoreByApp = new WeakMap<FirebaseApp, Firestore>();

// IMPORTANT: DO NOT MODIFY THE SIGNATURE OF THIS FUNCTION
export function initializeFirebase() {
  const apps = getApps();
  let firebaseApp: FirebaseApp;

  if (!apps.length) {
    try {
      firebaseApp = initializeApp(firebaseConfig);
    } catch (e) {
      firebaseApp = getApp();
    }
  } else {
    firebaseApp = getApp();
  }

  return getSdks(firebaseApp);
}

export function getSdks(firebaseApp: FirebaseApp) {
  const cached = firestoreByApp.get(firebaseApp);
  if (cached) {
    return {
      firebaseApp,
      auth: getAuth(firebaseApp),
      firestore: cached,
    };
  }

  let firestore: Firestore;
  try {
    firestore = initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (e: unknown) {
    // Déjà initialisé (Strict Mode, autre bundle, ou `getFirestore` appelé avant).
    firestore = getFirestore(firebaseApp);
    if (process.env.NODE_ENV === "development") {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("already been called")) {
        console.warn(
          "[Firebase] Initialisation Firestore avec cache persistant impossible - utilisation de l’instance existante (hors ligne peut être limité).",
          e
        );
      }
    }
  }

  firestoreByApp.set(firebaseApp, firestore);

  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore,
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
export * from './persistence';
