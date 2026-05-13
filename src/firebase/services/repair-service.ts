'use client';

import {
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type DocumentData,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
} from 'firebase/firestore';
import { notifyStockLowCrossing, createNotification } from './notification-service';

export type RepairStatus =
  | 'reçu'
  | 'en_diagnostic'
  | 'devis_envoyé'
  | 'en_cours'
  | 'terminé'
  | 'prêt_à_retirer'
  | 'retiré'
  | 'annulé';

export interface RepairPartUsage {
  productId: string;
  quantity: number;
  unitCost: number;
}

export interface CreateRepairInput {
  boutiqueId: string;
  userId?: string;
  customerName: string;
  phoneNumber?: string;
  deviceBrand?: string;
  deviceModel: string;
  deviceType?: string;
  serialNumber?: string;
  issueDescription: string;
  laborCost?: number;
  internalNotes?: string;
}

/**
 * Crée une fiche de réparation (statut initial : reçu).
 */
export async function createRepair(db: Firestore, data: CreateRepairInput) {
  const labor = Math.max(0, Number(data.laborCost) || 0);
  await addDoc(collection(db, 'boutiques', data.boutiqueId, 'repairs'), {
    customerName: data.customerName.trim(),
    phoneNumber: (data.phoneNumber || '').trim(),
    deviceBrand: (data.deviceBrand || '').trim(),
    deviceModel: data.deviceModel.trim(),
    deviceType: (data.deviceType || 'Smartphone').trim(),
    serialNumber: (data.serialNumber || '').trim(),
    issueDescription: data.issueDescription.trim(),
    internalNotes: (data.internalNotes || '').trim() || null,
    laborCost: labor,
    partsCost: 0,
    totalCost: labor,
    createdByUserId: data.userId ?? null,
    status: 'reçu',
    startDate: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Met à jour main d’œuvre, notes internes ou description (recalcule total = main d’œuvre + pièces).
 */
export async function updateRepairLaborAndNotes(
  db: Firestore,
  boutiqueId: string,
  repairId: string,
  fields: {
    laborCost?: number;
    internalNotes?: string;
    issueDescription?: string;
  }
) {
  const repairRef = doc(db, 'boutiques', boutiqueId, 'repairs', repairId);
  const snap = await getDoc(repairRef);
  if (!snap.exists()) throw new Error('Fiche introuvable.');
  const d = snap.data();
  const partsCost = Number(d.partsCost) || 0;
  const labor =
    fields.laborCost != null ? Math.max(0, Number(fields.laborCost) || 0) : Number(d.laborCost) || 0;

  const patch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (fields.internalNotes !== undefined) {
    patch.internalNotes = fields.internalNotes.trim() || null;
  }
  if (fields.issueDescription !== undefined) {
    patch.issueDescription = fields.issueDescription.trim();
  }
  if (fields.laborCost !== undefined) {
    patch.laborCost = labor;
    patch.totalCost = labor + partsCost;
  }

  await updateDoc(repairRef, patch as DocumentData);
}

/**
 * Ajoute une pièce (sous-collection) et décrémente le stock - lectures via transaction.get uniquement.
 */
export async function addPartToRepair(db: Firestore, boutiqueId: string, repairId: string, part: RepairPartUsage) {
  const repairRef = doc(db, 'boutiques', boutiqueId, 'repairs', repairId);
  const qtyUse = Math.max(1, Math.floor(part.quantity));
  const unit = Math.max(0, Number(part.unitCost) || 0);

  const stockQuery = query(
    collection(db, 'boutiques', boutiqueId, 'stocks'),
    where('productId', '==', part.productId)
  );
  const stockPre = await getDocs(stockQuery);
  if (stockPre.empty) {
    throw new Error('Cette pièce n’est pas en stock dans votre boutique. Réceptionnez ou transférez d’abord.');
  }
  const stockRef = stockPre.docs[0]!.ref;

  const stockLowCrossing = await runTransaction(db, async (transaction) => {
    const repairSnap = await transaction.get(repairRef);
    if (!repairSnap.exists()) throw new Error('Réparation introuvable.');
    const stockSnap = await transaction.get(stockRef);
    if (!stockSnap.exists()) throw new Error('Stock introuvable.');
    const currentQty = stockSnap.data().quantity ?? 0;
    if (currentQty < qtyUse) throw new Error(`Stock insuffisant (${currentQty} disponible(s)).`);

    const laborCost = Number(repairSnap.data().laborCost) || 0;
    const prevParts = Number(repairSnap.data().partsCost) || 0;
    const linePrice = qtyUse * unit;
    const newParts = prevParts + linePrice;
    const newQty = currentQty - qtyUse;
    const threshold = Math.max(0, Math.floor(Number(stockSnap.data().alertThreshold ?? 5)));

    const partRef = doc(collection(db, 'boutiques', boutiqueId, 'repairs', repairId, 'repairParts'));
    transaction.set(partRef, {
      productId: part.productId,
      quantityUsed: qtyUse,
      unitCost: unit,
      totalPartCost: linePrice,
      createdAt: serverTimestamp(),
    });

    transaction.update(stockRef, {
      quantity: newQty,
      updatedAt: serverTimestamp(),
    });

    transaction.update(repairRef, {
      partsCost: newParts,
      totalCost: laborCost + newParts,
      updatedAt: serverTimestamp(),
    });

    const movementRef = doc(collection(db, 'boutiques', boutiqueId, 'stockMovements'));
    transaction.set(movementRef, {
      stockId: stockRef.id,
      productId: part.productId,
      boutiqueId,
      type: 'reparation',
      quantityChange: -qtyUse,
      currentQuantityAfter: newQty,
      sourceDocumentId: repairId,
      sourceDocumentType: 'Repair',
      note: `Pièce réparation ${repairId.substring(0, 8)}`,
      timestamp: serverTimestamp(),
    });

    if (currentQty > threshold && newQty <= threshold) {
      return { prev: currentQty, next: newQty, th: threshold, pid: part.productId };
    }
    return null;
  });

  if (stockLowCrossing) {
    notifyStockLowCrossing(
      boutiqueId,
      stockLowCrossing.pid,
      stockLowCrossing.prev,
      stockLowCrossing.next,
      stockLowCrossing.th
    );
  }
}

/**
 * Met à jour le statut d'une réparation.
 */
export async function updateRepairStatus(
  db: Firestore,
  boutiqueId: string,
  repairId: string,
  newStatus: RepairStatus
) {
  const repairRef = doc(db, 'boutiques', boutiqueId, 'repairs', repairId);
  const before = await getDoc(repairRef);
  if (!before.exists()) throw new Error('Fiche introuvable.');
  const repairData = before.data();

  const updateData: Record<string, unknown> = {
    status: newStatus,
    updatedAt: serverTimestamp(),
  };
  if (newStatus === 'terminé') updateData.completionDate = serverTimestamp();
  if (newStatus === 'retiré') updateData.pickupDate = serverTimestamp();

  await updateDoc(repairRef, updateData as DocumentData);

  if (newStatus === 'prêt_à_retirer') {
    createNotification({
      title: 'Réparation prête',
      message: `L’appareil ${repairData.deviceBrand || ''} ${repairData.deviceModel || ''} de ${
        repairData.customerName || 'client'
      } est prêt à être récupéré.`,
      type: 'repair_ready',
      boutiqueId,
      link: `/repairs/${encodeURIComponent(repairId)}`,
    });
  }
}
