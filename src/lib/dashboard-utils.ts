/** Bornes de la période sélectionnée (fin = maintenant, fuseau local). */
export function getDashboardPeriodBounds(period: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end);

  switch (period) {
    case "24h":
      start.setHours(start.getHours() - 24);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      break;
    case "year":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
  }
  return { start, end };
}

export type SaleLike = {
  id: string;
  boutiqueId?: string;
  totalAmount?: number;
  paymentType?: string;
  saleDate?: { toDate?: () => Date };
};

export function saleTimestamp(s: SaleLike): number | null {
  const d = s.saleDate?.toDate?.();
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

export function filterSalesInPeriod(sales: SaleLike[], start: Date, end: Date): SaleLike[] {
  const t0 = start.getTime();
  const t1 = end.getTime();
  return sales.filter((s) => {
    const t = saleTimestamp(s);
    return t != null && t >= t0 && t <= t1;
  });
}

/** Agrégation CA par jour sur une plage (labels courts type « lun. 3 »). */
export function aggregateRevenueByDay(
  sales: SaleLike[],
  start: Date,
  end: Date,
  locale = "fr-FR"
): { name: string; revenue: number; margin: number }[] {
  const days: { key: string; label: string; revenue: number }[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999);

  function localDayKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  while (cursor <= endDay) {
    const key = localDayKey(cursor);
    const label = cursor.toLocaleDateString(locale, { weekday: "short", day: "numeric" }).replace(".", "");
    days.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), revenue: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  if (days.length === 0) return [];

  const byKey = new Map(days.map((d) => [d.key, d] as const));

  for (const s of sales) {
    const t = saleTimestamp(s);
    if (t == null) continue;
    const d = new Date(t);
    const key = localDayKey(d);
    const row = byKey.get(key);
    if (row) row.revenue += s.totalAmount || 0;
  }

  // Marge non modélisée dans les ventes → 0 (CDC : à intégrer avec coûts d’achat plus tard)
  return Array.from(byKey.values()).map((d) => ({
    name: d.label,
    revenue: d.revenue,
    margin: 0,
  }));
}

/** Barres CA : jour / créneaux 3h (24h) / mois (année). */
export function aggregateRevenueForChart(
  sales: SaleLike[],
  period: string,
  start: Date,
  end: Date,
  locale = "fr-FR"
): { name: string; revenue: number; margin: number }[] {
  if (period === "24h") {
    const slots: { name: string; revenue: number; margin: number }[] = [];
    for (let b = 0; b < 8; b++) {
      const h0 = b * 3;
      slots.push({ name: `${h0}h`, revenue: 0, margin: 0 });
    }
    const t0 = start.getTime();
    const t1 = end.getTime();
    for (const s of sales) {
      const t = saleTimestamp(s);
      if (t == null || t < t0 || t > t1) continue;
      const hour = new Date(t).getHours();
      const bucket = Math.min(7, Math.floor(hour / 3));
      slots[bucket]!.revenue += s.totalAmount || 0;
    }
    return slots;
  }

  if (period === "year") {
    const byMonth = new Map<number, number>();
    for (let m = 0; m < 12; m++) byMonth.set(m, 0);
    const t0 = start.getTime();
    const t1 = end.getTime();
    for (const s of sales) {
      const t = saleTimestamp(s);
      if (t == null || t < t0 || t > t1) continue;
      const m = new Date(t).getMonth();
      byMonth.set(m, (byMonth.get(m) ?? 0) + (s.totalAmount || 0));
    }
    return Array.from(byMonth.entries()).map(([m, revenue]) => ({
      name: new Date(start.getFullYear(), m, 1).toLocaleDateString(locale, { month: "short" }),
      revenue,
      margin: 0,
    }));
  }

  if (period === "30d") {
    const days = aggregateRevenueByDay(sales, start, end);
    if (days.length <= 14) return days;
    const step = Math.max(1, Math.ceil(days.length / 12));
    const out: { name: string; revenue: number; margin: number }[] = [];
    for (let i = 0; i < days.length; i += step) {
      const chunk = days.slice(i, i + step);
      const revenue = chunk.reduce((a, d) => a + d.revenue, 0);
      out.push({
        name: chunk[0]?.name ?? `S${out.length + 1}`,
        revenue,
        margin: 0,
      });
    }
    return out;
  }

  return aggregateRevenueByDay(sales, start, end);
}

export function formatDashboardCurrency(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) < 1_000_000) return `${Math.round(n / 1000)} k`;
  const m = n / 1_000_000;
  const r = m >= 10 ? Math.round(m) : Math.round(m * 10) / 10;
  return `${r} M`;
}
