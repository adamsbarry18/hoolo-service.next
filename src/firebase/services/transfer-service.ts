'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  serverTimestamp,
  type Firestore,
  addDoc,
} from 'firebase/firestore';
import { notifyStockLowCrossing } from '@/firebase/services/notification-service';
export interface CreateTransferData {
  fromBoutiqueId: string;
  toBoutiqueId: string;
  productId: string;
  /** Snapshot pour l’historique / recherche sans jointure produit. */
  productName: string;
  quantity: number;
  userId: string;
  /** Commentaire optionnel (motif, référence colis…). */
  note?: string;
}

/**
 * Crée une demande de transfert en attente de validation (stock source vérifié à la volée, non réservé).
 */
export async function createTransfer(db: Firestore, data: CreateTransferData) {
  const transfersRef = collection(db, 'transfers');

  const sourceStockQuery = query(
    collection(db, 'boutiques', data.fromBoutiqueId, 'stocks'),
    where('productId', '==', data.productId)
  );
  const sourceStockSnap = await getDocs(sourceStockQuery);

  if (sourceStockSnap.empty) {
    throw new Error("Ce produit n’a pas de stock dans la boutique d’origine. Créez ou ajustez le stock d’abord.");
  }

  const stockData = sourceStockSnap.docs[0]!.data();
  const available = stockData.quantity ?? 0;
  if (available < data.quantity) {
    throw new Error(`Stock insuffisant à l’origine. Disponible : ${available} unité(s).`);
  }

  await addDoc(transfersRef, {
    fromBoutiqueId: data.fromBoutiqueId,
    toBoutiqueId: data.toBoutiqueId,
    productId: data.productId,
    productName: data.productName.trim() || data.productId,
    quantity: data.quantity,
    note: data.note?.trim() || null,
    status: 'pending',
    requestorUserId: data.userId,
    transferDate: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Valide un transfert : toutes les lectures passent par transaction.get (références résolues avant la transaction).
 */
export async function validateTransfer(db: Firestore, transferId: string, adminId: string) {
  const transferRef = doc(db, 'transfers', transferId);

  const transferSnap = await getDoc(transferRef);
  if (!transferSnap.exists()) throw new Error('Transfert introuvable.');
  const transfer = transferSnap.data() as {
    status?: string;
    fromBoutiqueId?: string;
    toBoutiqueId?: string;
    productId?: string;
    quantity?: number;
  };
  if (transfer.status !== 'pending') throw new Error('Ce transfert a déjà été traité.');
  if (!transfer.fromBoutiqueId || !transfer.toBoutiqueId || !transfer.productId || transfer.quantity == null) {
    throw new Error('Données de transfert incomplètes.');
  }

  const sourceStockQuery = query(
    collection(db, 'boutiques', transfer.fromBoutiqueId, 'stocks'),
    where('productId', '==', transfer.productId)
  );
  const sourceStockSnap = await getDocs(sourceStockQuery);
  if (sourceStockSnap.empty) throw new Error('Stock source introuvable.');
  const sourceStockRef = sourceStockSnap.docs[0]!.ref;

  const destStockQuery = query(
    collection(db, 'boutiques', transfer.toBoutiqueId, 'stocks'),
    where('productId', '==', transfer.productId)
  );
  const destStockSnap = await getDocs(destStockQuery);
  const existingDestRef = destStockSnap.empty ? null : destStockSnap.docs[0]!.ref;
  const newDestRef = existingDestRef ?? doc(collection(db, 'boutiques', transfer.toBoutiqueId, 'stocks'));

  const fromBoutiqueId = transfer.fromBoutiqueId;
  const productId = transfer.productId;

  const sourceLowCross = await runTransaction(db, async (transaction) => {
    const trLocal = await transaction.get(transferRef);
    if (!trLocal.exists()) throw new Error('Transfert introuvable.');
    const tr = trLocal.data() as typeof transfer;
    if (tr.status !== 'pending') throw new Error('Ce transfert a déjà été traité.');
    const qty = tr.quantity ?? 0;

    const srcSnap = await transaction.get(sourceStockRef);
    if (!srcSnap.exists()) throw new Error('Stock source introuvable.');
    const sourceQtyNow = srcSnap.data().quantity ?? 0;
    const srcThreshold = Math.max(
      0,
      Math.floor(Number(srcSnap.data().alertThreshold ?? 5))
    );
    if (sourceQtyNow < qty) throw new Error('Stock source devenu insuffisant entre-temps.');

    const sourceQtyAfter = sourceQtyNow - qty;

    let destStockId: string;
    let destQtyAfter: number;

    if (existingDestRef) {
      const dSnap = await transaction.get(existingDestRef);
      const dq = dSnap.data()?.quantity ?? 0;
      destQtyAfter = dq + qty;
      transaction.update(existingDestRef, {
        quantity: destQtyAfter,
        updatedAt: serverTimestamp(),
      });
      destStockId = existingDestRef.id;
    } else {
      destQtyAfter = qty;
      transaction.set(newDestRef, {
        productId: tr.productId,
        boutiqueId: tr.toBoutiqueId,
        quantity: qty,
        alertThreshold: 5,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      destStockId = newDestRef.id;
    }

    transaction.update(sourceStockRef, {
      quantity: sourceQtyAfter,
      updatedAt: serverTimestamp(),
    });

    const sourceMovementRef = doc(collection(db, 'boutiques', tr.fromBoutiqueId!, 'stockMovements'));
    transaction.set(sourceMovementRef, {
      stockId: sourceStockRef.id,
      productId: tr.productId,
      boutiqueId: tr.fromBoutiqueId,
      type: 'transfert_out',
      quantityChange: -qty,
      currentQuantityAfter: sourceQtyAfter,
      sourceDocumentId: transferId,
      sourceDocumentType: 'Transfer',
      userId: adminId,
      timestamp: serverTimestamp(),
    });

    const destMovementRef = doc(collection(db, 'boutiques', tr.toBoutiqueId!, 'stockMovements'));
    transaction.set(destMovementRef, {
      stockId: destStockId,
      productId: tr.productId,
      boutiqueId: tr.toBoutiqueId,
      type: 'transfert_in',
      quantityChange: qty,
      currentQuantityAfter: destQtyAfter,
      sourceDocumentId: transferId,
      sourceDocumentType: 'Transfer',
      userId: adminId,
      timestamp: serverTimestamp(),
    });

    transaction.update(transferRef, {
      status: 'completed',
      approverUserId: adminId,
      completionDate: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      previousQty: sourceQtyNow,
      newQty: sourceQtyAfter,
      threshold: srcThreshold,
    };
  });

  notifyStockLowCrossing(
    fromBoutiqueId,
    productId,
    sourceLowCross.previousQty,
    sourceLowCross.newQty,
    sourceLowCross.threshold
  );
}

/**
 * Annule un transfert encore en attente (aucun mouvement de stock).
 */
export async function cancelTransfer(db: Firestore, transferId: string) {
  const transferRef = doc(db, 'transfers', transferId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(transferRef);
    if (!snap.exists()) throw new Error('Transfert introuvable.');
    if (snap.data().status !== 'pending') {
      throw new Error('Seuls les transferts en attente peuvent être annulés.');
    }

    transaction.update(transferRef, {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}
