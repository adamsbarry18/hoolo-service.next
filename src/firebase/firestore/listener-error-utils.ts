import { getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import type { FirestoreError } from "firebase/firestore";

/**
 * Après déconnexion, Firestore peut encore notifier `permission-denied` sur les listeners
 * (token retiré, règles exigent auth). Ce n’est pas une erreur à surfacer à l’utilisateur.
 */
export function isBenignPermissionErrorAfterSignOut(error: FirestoreError): boolean {
  if (error.code !== "permission-denied") return false;
  try {
    const apps = getApps();
    if (!apps.length) return true;
    return getAuth(apps[0]!).currentUser == null;
  } catch {
    return false;
  }
}
