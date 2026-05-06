'use client';

import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp, 
  Firestore 
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export interface AppSettings {
  currency: string;
  paymentMethods: string[];
  lowStockThreshold: number;
  companyName: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  currency: 'GNF',
  paymentMethods: ['cash', 'mobile_money', 'credit'],
  lowStockThreshold: 5,
  companyName: 'Hoolo Service',
};

/** Fusionne un document Firestore partiel avec les valeurs par défaut (évite champs vides à l'écran). */
export function normalizeAppSettings(raw: Record<string, unknown> | null | undefined): AppSettings {
  const paymentRaw = raw?.paymentMethods;
  const paymentMethods = Array.isArray(paymentRaw)
    ? paymentRaw.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    : DEFAULT_SETTINGS.paymentMethods;

  const low = Number(raw?.lowStockThreshold);
  const lowStockThreshold =
    Number.isFinite(low) && low >= 0 ? Math.floor(low) : DEFAULT_SETTINGS.lowStockThreshold;

  const company =
    typeof raw?.companyName === 'string' && raw.companyName.trim()
      ? raw.companyName.trim()
      : DEFAULT_SETTINGS.companyName;

  const currency =
    typeof raw?.currency === 'string' && raw.currency.trim()
      ? raw.currency.trim()
      : DEFAULT_SETTINGS.currency;

  return {
    companyName: company,
    currency,
    lowStockThreshold,
    paymentMethods: paymentMethods.length ? paymentMethods : [...DEFAULT_SETTINGS.paymentMethods],
  };
}

/**
 * Récupère les paramètres globaux de l'application.
 */
export async function getAppSettings(db: Firestore): Promise<AppSettings> {
  const settingsRef = doc(db, 'settings', 'global');
  try {
    const snap = await getDoc(settingsRef);
    if (snap.exists()) {
      return normalizeAppSettings(snap.data() as Record<string, unknown>);
    }
    return { ...DEFAULT_SETTINGS };
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Sauvegarde les paramètres globaux.
 */
export async function saveAppSettings(db: Firestore, settings: AppSettings) {
  const settingsRef = doc(db, 'settings', 'global');
  try {
    await setDoc(settingsRef, {
      ...settings,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error: any) {
    const permissionError = new FirestorePermissionError({
      path: settingsRef.path,
      operation: 'update',
      requestResourceData: settings
    });
    errorEmitter.emit('permission-error', permissionError);
    throw error;
  }
}
