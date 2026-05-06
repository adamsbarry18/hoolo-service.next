/**
 * Normalise une chaîne pour recherche : insensible à la casse et aux accents (fr).
 */
export function normalizeSearchText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Garde chiffres pour rapprocher téléphone / ID saisis avec ou sans espaces. */
export function normalizeSearchDigits(raw: string | undefined | null): string {
  if (raw == null) return "";
  return String(raw).replace(/\D/g, "");
}

/**
 * Indique si au moins un des champs contient la requête (après normalisation).
 * `query` vide matche tout.
 */
export function rowMatchesSearch(
  query: string,
  fields: (string | number | undefined | null)[]
): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;

  const textBlob = fields
    .filter((v) => v != null && v !== "")
    .map((v) => normalizeSearchText(String(v)))
    .join("\n");
  if (textBlob.includes(q)) return true;

  const qDigits = normalizeSearchDigits(query);
  if (qDigits.length >= 2) {
    const digitBlob = fields.map((v) => normalizeSearchDigits(v == null ? "" : String(v))).join("");
    if (digitBlob.includes(qDigits)) return true;
  }

  return false;
}
