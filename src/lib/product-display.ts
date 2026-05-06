/** Libellé principal pour sélections (ventes, transferts, pièces réparation…). */
export function productListLabel(p: { name?: string; reference?: string | null }): string {
  const name = (p.name ?? "").trim() || "Sans nom";
  const ref = (p.reference ?? "").trim();
  return ref ? `${name} · ${ref}` : name;
}
