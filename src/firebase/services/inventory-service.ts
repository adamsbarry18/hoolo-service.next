"use client";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { notifyStockLowCrossing } from "@/firebase/services/notification-service";

export type ProductInput = {
  name: string;
  category: string;
  /** Référence fournisseur / SKU (optionnel). */
  reference?: string;
  purchasePrice: number;
  sellingPrice: number;
  isActive: boolean;
};

/**
 * Crée un produit catalogue et la ligne de stock associée pour la boutique (quantité initiale).
 */
export async function createProductWithInitialStock(
  db: Firestore,
  opts: {
    boutiqueId: string;
    product: ProductInput;
    initialQuantity: number;
    alertThreshold: number;
  }
) {
  const col = collection(db, "products");
  const productRef = doc(col);
  const p = opts.product;
  const qty = Math.max(0, Math.floor(opts.initialQuantity));
  const threshold = Math.max(0, Math.floor(opts.alertThreshold));

  await runTransaction(db, async (transaction) => {
    transaction.set(productRef, {
      name: p.name.trim(),
      category: p.category.trim() || "Général",
      reference: (p.reference ?? "").trim() || null,
      purchasePrice: Math.max(0, p.purchasePrice),
      sellingPrice: Math.max(0, p.sellingPrice),
      isActive: p.isActive,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const stockRef = doc(collection(db, "boutiques", opts.boutiqueId, "stocks"));
    transaction.set(stockRef, {
      productId: productRef.id,
      boutiqueId: opts.boutiqueId,
      quantity: qty,
      alertThreshold: threshold,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (qty > 0) {
      const movRef = doc(collection(db, "boutiques", opts.boutiqueId, "stockMovements"));
      transaction.set(movRef, {
        stockId: stockRef.id,
        productId: productRef.id,
        boutiqueId: opts.boutiqueId,
        type: "reception_initiale",
        quantityChange: qty,
        currentQuantityAfter: qty,
        note: "Création produit",
        timestamp: serverTimestamp(),
      });
    }
  });

  return productRef.id;
}

export async function updateCatalogProduct(
  db: Firestore,
  productId: string,
  product: ProductInput
) {
  const p = product;
  const ref = doc(db, "products", productId);
  await updateDoc(ref, {
    name: p.name.trim(),
    category: p.category.trim() || "Général",
    reference: (p.reference ?? "").trim() || null,
    purchasePrice: Math.max(0, p.purchasePrice),
    sellingPrice: Math.max(0, p.sellingPrice),
    isActive: p.isActive,
    updatedAt: serverTimestamp(),
  });
}

/** Crée une ligne stock si absente (ex. produit ancien sans boutique). */
export async function ensureStockLine(
  db: Firestore,
  boutiqueId: string,
  productId: string,
  alertThreshold = 5
): Promise<string> {
  const q = query(
    collection(db, "boutiques", boutiqueId, "stocks"),
    where("productId", "==", productId)
  );
  const snap = await getDocs(q);
  if (!snap.empty) return snap.docs[0]!.id;

  const ref = await addDoc(collection(db, "boutiques", boutiqueId, "stocks"), {
    productId,
    boutiqueId,
    quantity: 0,
    alertThreshold: Math.max(0, Math.floor(alertThreshold)),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function adjustStockLevel(
  db: Firestore,
  opts: {
    boutiqueId: string;
    stockId: string;
    productId: string;
    newQuantity: number;
    newAlertThreshold: number;
    note?: string;
    userId?: string;
  }
) {
  const next = Math.max(0, Math.floor(opts.newQuantity));
  const threshold = Math.max(0, Math.floor(opts.newAlertThreshold));

  let previousQty = 0;

  await runTransaction(db, async (transaction) => {
    const ref = doc(db, "boutiques", opts.boutiqueId, "stocks", opts.stockId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Ligne de stock introuvable.");
    const prev = snap.data().quantity ?? 0;
    previousQty = prev;
    const delta = next - prev;
    transaction.update(ref, {
      quantity: next,
      alertThreshold: threshold,
      updatedAt: serverTimestamp(),
    });
    const movementRef = doc(collection(db, "boutiques", opts.boutiqueId, "stockMovements"));
    transaction.set(movementRef, {
      stockId: opts.stockId,
      productId: opts.productId,
      boutiqueId: opts.boutiqueId,
      type: "ajustement",
      quantityChange: delta,
      currentQuantityAfter: next,
      note: (opts.note ?? "").trim() || null,
      userId: opts.userId ?? null,
      timestamp: serverTimestamp(),
    });
  });

  notifyStockLowCrossing(opts.boutiqueId, opts.productId, previousQty, next, threshold);
}
