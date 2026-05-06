import {
  type Firestore,
  collection,
  query,
  where,
  limit,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  doc,
  writeBatch,
} from "firebase/firestore";

export const DEFAULT_BOUTIQUE_NAME = "Boutique A";

export type EnsureDefaultBoutiqueOptions = {
  /**
   * Si aucune boutique n’a `isDefault`, met à jour la première trouvée.
   * Réservé aux comptes Admin (règles Firestore).
   */
  promoteExistingWithoutFlag: boolean;
};

/**
 * Garantit une boutique utilisable comme magasin « principal ».
 * - Si `isDefault: true` existe → retourne son id.
 * - Sinon, si la collection n’est pas vide → promeut la première (si `promoteExistingWithoutFlag`) ou retourne son id.
 * - Sinon → crée « Boutique A » (`isDefault: true`, réservé aux rôles autorisés à créer).
 */
export async function ensureDefaultBoutique(
  firestore: Firestore,
  options: EnsureDefaultBoutiqueOptions = { promoteExistingWithoutFlag: false }
): Promise<string | null> {
  const col = collection(firestore, "boutiques");

  const defaultSnap = await getDocs(
    query(col, where("isDefault", "==", true), limit(1))
  );
  if (!defaultSnap.empty) {
    return defaultSnap.docs[0]!.id;
  }

  const anySnap = await getDocs(query(col, limit(1)));
  if (!anySnap.empty) {
    const d = anySnap.docs[0]!;
    if (options.promoteExistingWithoutFlag) {
      await updateDoc(d.ref, {
        isDefault: true,
        updatedAt: serverTimestamp(),
      });
    }
    return d.id;
  }

  const ref = await addDoc(col, {
    name: DEFAULT_BOUTIQUE_NAME,
    code: "HQ",
    isDefault: true,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Une seule boutique avec `isDefault: true` : désactive les autres puis active `boutiqueId`.
 * À appeler après création / mise à jour du document boutique (Admin + règles Firestore).
 */
export async function ensureSingleDefaultBoutique(
  firestore: Firestore,
  boutiqueId: string
): Promise<void> {
  const col = collection(firestore, "boutiques");
  const defaultSnap = await getDocs(query(col, where("isDefault", "==", true), limit(50)));
  const batch = writeBatch(firestore);
  for (const d of defaultSnap.docs) {
    if (d.id !== boutiqueId) {
      batch.update(d.ref, { isDefault: false, updatedAt: serverTimestamp() });
    }
  }
  batch.update(doc(firestore, "boutiques", boutiqueId), {
    isDefault: true,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}
