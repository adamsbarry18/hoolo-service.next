'use client';

import { 
  doc, 
  runTransaction, 
  serverTimestamp, 
  Firestore,
  collection,
  updateDoc,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export interface RepaymentData {
  clientId: string;
  amount: number;
  paymentMethod: string;
  userId: string;
  boutiqueId: string;
  description?: string;
}

/**
 * Met à jour le plafond de crédit autorisé pour un client.
 */
export async function updateClientCreditLimit(
  db: Firestore,
  clientId: string,
  creditLimit: number
): Promise<void> {
  if (!Number.isFinite(creditLimit) || creditLimit < 0) {
    throw new Error("Plafond de crédit invalide.");
  }
  const clientRef = doc(db, "clients", clientId);
  try {
    await updateDoc(clientRef, {
      creditLimit: Math.floor(creditLimit),
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

/**
 * Enregistre un remboursement client et met à jour sa dette en une transaction.
 */
export async function processRepayment(db: Firestore, data: RepaymentData) {
  if (!data.boutiqueId?.trim()) {
    throw new Error("Aucune boutique rattachée : impossible d’enregistrer le versement.");
  }
  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    throw new Error("Montant de remboursement invalide.");
  }

  const clientRef = doc(db, 'clients', data.clientId);
  
  try {
    await runTransaction(db, async (transaction) => {
      const clientSnap = await transaction.get(clientRef);
      if (!clientSnap.exists()) throw new Error("Client introuvable.");
      
      const clientData = clientSnap.data();
      const current = clientData.currentDebt || 0;
      if (current <= 0) throw new Error("Ce client n'a pas d'encours à rembourser.");
      const pay = Math.min(data.amount, current);
      const newDebt = Math.max(0, current - pay);

      // 1. Créer le reçu de paiement
      const paymentRef = doc(collection(db, 'boutiques', data.boutiqueId, 'payments'));
      transaction.set(paymentRef, {
        clientId: data.clientId,
        amount: pay,
        paymentDate: serverTimestamp(),
        paymentMethod: data.paymentMethod,
        description: data.description || 'Remboursement crédit',
        userId: data.userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 2. Mettre à jour la dette du client
      transaction.update(clientRef, {
        currentDebt: newDebt,
        updatedAt: serverTimestamp()
      });
    });
  } catch (error: any) {
    const permissionError = new FirestorePermissionError({
      path: clientRef.path,
      operation: 'update',
    });
    errorEmitter.emit('permission-error', permissionError);
    throw error;
  }
}

/**
 * Ratio d'utilisation du plafond (0–100+). Même logique que sur l'écran Crédits.
 */
export function creditUsagePercent(c: { currentDebt?: number; creditLimit?: number }): number {
  const debt = c.currentDebt || 0;
  const limit = c.creditLimit || 0;
  if (limit <= 0) return debt > 0 ? 100 : 0;
  return (debt / limit) * 100;
}

/**
 * Calcule un score de fiabilité (0-100) basé sur l'utilisation du crédit.
 */
export function calculateReliabilityScore(debt: number, limit: number): number {
  if (limit <= 0) return 100;
  const usageRatio = debt / limit;
  // Plus le ratio est élevé, plus le score baisse. 
  // On pourrait ajouter la date du dernier paiement pour plus de précision.
  return Math.max(0, Math.min(100, Math.round(100 * (1 - usageRatio))));
}
