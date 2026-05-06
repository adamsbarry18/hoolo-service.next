"use client";

import type { Firestore } from "firebase/firestore";
import { waitForPendingWrites } from "firebase/firestore";

/**
 * Attend que toutes les écritures locales soient traitées par le backend Firestore
 * (utile après une action critique une fois le réseau revenu).
 */
export function flushLocalFirestoreWrites(firestore: Firestore): Promise<void> {
  return waitForPendingWrites(firestore);
}
