
'use client';

/**
 * DEPRECATED: Use hooks from @/firebase instead.
 * This file is kept as a stub to avoid import errors but all initialization
 * is now handled centrally in @/firebase/index.ts to avoid configuration conflicts.
 */

import { initializeFirebase } from '@/firebase';

const services = typeof window !== 'undefined' ? initializeFirebase() : { auth: null, firestore: null, firebaseApp: null };

export const auth = services.auth as any;
export const db = services.firestore as any;
export const app = services.firebaseApp as any;
