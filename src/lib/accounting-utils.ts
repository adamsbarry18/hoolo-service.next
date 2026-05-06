/**
 * Agrégations comptables à partir des ventes (lignes + prix d’achat produits)
 * et des remboursements clients (sous-collection payments).
 */

export type AccountingSale = {
  id: string;
  totalAmount?: number;
  amountPaid?: number;
  paymentType?: string;
  status?: string;
  saleDate?: { toDate?: () => Date };
  lineItems?: Array<{
    productId: string;
    quantity?: number;
    unitPrice?: number;
    lineTotal?: number;
  }>;
};

export type AccountingPayment = {
  id?: string;
  amount?: number;
  paymentDate?: { toDate?: () => Date };
  paymentMethod?: string;
};

export function saleTime(s: AccountingSale): number | null {
  const d = s.saleDate?.toDate?.();
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

export function buildPurchasePriceMap(
  products: Array<{ id: string; purchasePrice?: number }>
): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of products) {
    m.set(p.id, Math.max(0, Number(p.purchasePrice) || 0));
  }
  return m;
}

/** Coût des biens vendus estimé (qté × prix d’achat catalogue). */
export function estimateSaleCogs(sale: AccountingSale, purchaseMap: Map<string, number>): number {
  let cogs = 0;
  for (const li of sale.lineItems ?? []) {
    const qty = Number(li.quantity) || 0;
    const unitCost = purchaseMap.get(li.productId) ?? 0;
    cogs += qty * unitCost;
  }
  return cogs;
}

export function sumRevenue(sales: AccountingSale[]): number {
  return sales.reduce((a, s) => a + (Number(s.totalAmount) || 0), 0);
}

export function sumSaleEncaissements(sales: AccountingSale[]): number {
  return sales.reduce((a, s) => a + (Number(s.amountPaid) || 0), 0);
}

export function profitForSales(sales: AccountingSale[], purchaseMap: Map<string, number>): number {
  return sales.reduce((acc, s) => {
    const rev = Number(s.totalAmount) || 0;
    return acc + rev - estimateSaleCogs(s, purchaseMap);
  }, 0);
}

/** Valorisation stocks : Σ qté × prix d’achat. */
export function inventoryCostValue(
  stocks: Array<{ productId?: string; quantity?: number }>,
  purchaseMap: Map<string, number>
): number {
  let v = 0;
  for (const row of stocks) {
    const pid = row.productId;
    if (!pid) continue;
    const q = Number(row.quantity) || 0;
    v += q * (purchaseMap.get(pid) ?? 0);
  }
  return v;
}

export function salesBetween(
  sales: AccountingSale[],
  start: Date,
  end: Date
): AccountingSale[] {
  const t0 = start.getTime();
  const t1 = end.getTime();
  return sales.filter((s) => {
    const t = saleTime(s);
    return t != null && t >= t0 && t <= t1;
  });
}

export function paymentsBetween(
  payments: AccountingPayment[],
  start: Date,
  end: Date
): AccountingPayment[] {
  const t0 = start.getTime();
  const t1 = end.getTime();
  return payments.filter((p) => {
    const t = p.paymentDate?.toDate?.()?.getTime();
    return t != null && t >= t0 && t <= t1;
  });
}

export function sumPaymentAmounts(payments: AccountingPayment[]): number {
  return payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);
}

export function monthlyYearSeries(
  sales: AccountingSale[],
  purchaseMap: Map<string, number>,
  year: number
): { month: string; revenue: number; profit: number }[] {
  const labels = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jui", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  const series = labels.map((month) => ({ month, revenue: 0, profit: 0 }));
  for (const s of sales) {
    const t = saleTime(s);
    if (t == null) continue;
    const d = new Date(t);
    if (d.getFullYear() !== year) continue;
    const m = d.getMonth();
    const rev = Number(s.totalAmount) || 0;
    const cogs = estimateSaleCogs(s, purchaseMap);
    series[m]!.revenue += rev;
    series[m]!.profit += rev - cogs;
  }
  return series;
}

export function paymentTypeBreakdown(
  sales: AccountingSale[],
  start: Date,
  end: Date
): { name: string; value: number }[] {
  const slice = salesBetween(sales, start, end);
  const buckets = new Map<string, number>();
  for (const s of slice) {
    const pt = s.paymentType || "autre";
    const v = Number(s.totalAmount) || 0;
    buckets.set(pt, (buckets.get(pt) ?? 0) + v);
  }
  const label = (k: string) => {
    switch (k) {
      case "cash":
        return "Espèces";
      case "mobile_money":
        return "Mobile money";
      case "credit":
        return "Crédit";
      default:
        return k;
    }
  };
  return Array.from(buckets.entries())
    .map(([k, value]) => ({ name: label(k), value }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function monthRangeUtc(year: number, month0: number): { start: Date; end: Date } {
  const start = new Date(year, month0, 1, 0, 0, 0, 0);
  const end = new Date(year, month0 + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export function ledgerCsvRows(sales: AccountingSale[]): string[][] {
  const rows: string[][] = [["date_iso", "vente_id", "total_ttc", "encaisse", "type_reglement", "statut"]];
  for (const s of [...sales].sort((a, b) => (saleTime(b) ?? 0) - (saleTime(a) ?? 0))) {
    const d = s.saleDate?.toDate?.();
    rows.push([
      d ? d.toISOString().slice(0, 10) : "",
      s.id,
      String(s.totalAmount ?? ""),
      String(s.amountPaid ?? ""),
      s.paymentType ?? "",
      s.status ?? "",
    ]);
  }
  return rows;
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const esc = (cell: string) => {
    if (cell.includes('"') || cell.includes(",") || cell.includes("\n")) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };
  const body = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
