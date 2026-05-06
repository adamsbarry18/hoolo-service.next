import type { CSSProperties } from "react";

function stringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** Première lettre « utile » (support unicode basique). */
function firstLetter(s: string): string {
  const t = s.trim();
  if (!t) return "";
  const m = t.match(/\p{L}/u);
  return (m ? m[0] : t[0]!).toUpperCase();
}

/** Initiales à partir des champs prénom / nom (aperçu formulaire profil). */
export function userInitialsFromNames(
  firstName: string,
  lastName: string,
  fallback: { displayName?: unknown; email?: string | null }
): string {
  const fn = firstName.trim();
  const ln = lastName.trim();
  if (fn && ln) return `${firstLetter(fn)}${firstLetter(ln)}`.slice(0, 2);
  if (fn.length >= 2) return fn.slice(0, 2).toUpperCase();
  if (fn.length === 1) return `${fn[0]!.toUpperCase()}${fn[0]!.toUpperCase()}`;
  if (ln.length >= 2) return ln.slice(0, 2).toUpperCase();
  if (ln.length === 1) return `${ln[0]!.toUpperCase()}${ln[0]!.toUpperCase()}`;

  const dn = typeof fallback.displayName === "string" ? fallback.displayName.trim() : "";
  if (dn) {
    const parts = dn.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${firstLetter(parts[0]!)}${firstLetter(parts[1]!)}`;
    return dn.substring(0, 2).toUpperCase() || "?";
  }
  const local = fallback.email?.split("@")[0]?.trim();
  if (local && local.length >= 2) return local.substring(0, 2).toUpperCase();
  if (local) return `${local[0]!.toUpperCase()}?`;
  return "?";
}

type ProfileLike = {
  firstName?: unknown;
  lastName?: unknown;
  displayName?: unknown;
} | null | undefined;

/** Initiales depuis le profil Firestore + e-mail auth. */
export function userInitialsFromProfile(
  profile: ProfileLike,
  user: { email?: string | null } | null | undefined
): string {
  const fn = typeof profile?.firstName === "string" ? profile.firstName : "";
  const ln = typeof profile?.lastName === "string" ? profile.lastName : "";
  return userInitialsFromNames(fn, ln, {
    displayName: profile?.displayName,
    email: user?.email,
  });
}

/**
 * Couleur de fond « aléatoire » mais stable pour un utilisateur (seed = uid).
 * Contraste texte clair sur fond hsl.
 */
export function userAvatarInlineStyle(seed: string | undefined): CSSProperties {
  const key = seed?.trim() || "anonymous";
  const h = ((stringHash(key) % 360) + 360) % 360;
  return {
    backgroundColor: `hsl(${h} 52% 44%)`,
    color: "hsl(0 0% 98%)",
  };
}
