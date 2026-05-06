"use client";

import { doc, updateDoc, serverTimestamp, type Firestore } from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";

export type UpdateClientProfileInput = {
  name: string;
  email?: string;
  phoneNumber: string;
  creditLimit: number;
  notes?: string;
};

/**
 * Met à jour les informations principales d’un client (CRM).
 */
export async function updateClientProfile(
  db: Firestore,
  clientId: string,
  data: UpdateClientProfileInput
): Promise<void> {
  const name = data.name.trim();
  const phoneNumber = data.phoneNumber.trim();
  if (!name) throw new Error("Le nom est obligatoire.");
  if (!phoneNumber) throw new Error("Le téléphone est obligatoire.");

  const creditLimit = Math.max(0, Math.floor(Number(data.creditLimit) || 0));
  const clientRef = doc(db, "clients", clientId);

  try {
    await updateDoc(clientRef, {
      name,
      email: (data.email ?? "").trim(),
      phoneNumber,
      creditLimit,
      ...(data.notes !== undefined ? { notes: data.notes.trim() } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (error: unknown) {
    const permissionError = new FirestorePermissionError({
      path: clientRef.path,
      operation: "update",
    });
    errorEmitter.emit("permission-error", permissionError);
    throw error;
  }
}
