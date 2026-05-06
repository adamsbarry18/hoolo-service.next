/** Profil Firestore minimal pour l’affichage du prénom. */
export type ProfileFirstNameInput = {
  firstName?: unknown;
  displayName?: unknown;
} | null | undefined;

/** Utilisateur Auth (displayName / email). */
export type UserFirstNameInput = {
  displayName?: string | null;
  email?: string | null;
} | null | undefined;

function firstWord(s: string): string {
  const w = s.trim().split(/\s+/).filter(Boolean)[0];
  return w ?? "";
}

/**
 * Prénom ou équivalent pour salutation / en-tête : `firstName` si renseigné,
 * sinon premier mot du nom d’affichage, sinon partie locale de l’e-mail.
 */
export function getUserFirstNameLabel(
  profile: ProfileFirstNameInput,
  user: UserFirstNameInput
): string | null {
  const fn = typeof profile?.firstName === "string" ? profile.firstName.trim() : "";
  if (fn) return fn;

  if (typeof profile?.displayName === "string" && profile.displayName.trim()) {
    const w = firstWord(profile.displayName);
    if (w) return w;
  }

  if (user?.displayName?.trim()) {
    const w = firstWord(user.displayName);
    if (w) return w;
  }

  const local = user?.email?.split("@")[0]?.trim();
  return local || null;
}
