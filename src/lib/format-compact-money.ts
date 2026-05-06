/**
 * Montants lisibles sur cartes / en-têtes (k = milliers, M = millions, Md = milliards).
 * Évite les débordements liés à « 600 000 GNF » en card étroite.
 */
function trimCompactDecimal(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  if (Number.isInteger(rounded)) return String(Math.round(rounded));
  return String(rounded).replace(".", ",");
}

function formatCompactCore(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs < 1000) return `${sign}${Math.round(abs)}`;
  if (abs < 1_000_000) {
    return `${sign}${trimCompactDecimal(abs / 1000)}k`;
  }
  if (abs < 1_000_000_000) {
    return `${sign}${trimCompactDecimal(abs / 1_000_000)}M`;
  }
  return `${sign}${trimCompactDecimal(abs / 1_000_000_000)}Md`;
}

/** Ex. 600000 → « 600k GNF », 1_200_000 → « 1,2M GNF » */
export function formatCompactGNF(n: number): string {
  return `${formatCompactCore(n)} GNF`;
}
