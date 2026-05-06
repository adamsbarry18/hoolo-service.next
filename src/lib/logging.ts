'use client';

import { addDoc, collection, serverTimestamp, Firestore } from 'firebase/firestore';

export async function logAccessDenied(db: Firestore, userId: string, path: string, details?: string) {
  try {
    await addDoc(collection(db, 'logs'), {
      userId,
      action: 'access_denied',
      entityType: 'System',
      description: `Tentative d'accès non autorisée à : ${path}`,
      timestamp: serverTimestamp(),
      details: [details || 'Permissions insuffisantes'],
    });
  } catch (error) {
    console.error("Failed to log access denial:", error);
  }
}
