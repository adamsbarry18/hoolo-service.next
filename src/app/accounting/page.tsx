
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Calculator,
  Download,
  TrendingDown,
  TrendingUp,
  Loader2,
  Building2,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Pie, PieChart, Cell, ResponsiveContainer } from "recharts";
import { useUser, useCollection, useFirestore, useMemoFirebase, useDoc } from "@/firebase";
import { useBoutiqueScope } from "@/contexts/boutique-scope";
import { collection, query, orderBy, limit, doc } from "firebase/firestore";
import type { TableColumnDef } from "@/hooks/use-table-column-visibility";
import { useTableColumnVisibility } from "@/hooks/use-table-column-visibility";
import { TableColumnToggle } from "@/components/table/table-column-toggle";
import { ListSearchBar } from "@/components/table/list-search-bar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { rowMatchesSearch } from "@/lib/list-search";
import {
  type AccountingSale,
  type AccountingPayment,
  buildPurchasePriceMap,
  monthlyYearSeries,
  paymentTypeBreakdown,
  monthRangeUtc,
  profitForSales,
  sumSaleEncaissements,
  sumPaymentAmounts,
  paymentsBetween,
  salesBetween,
  inventoryCostValue,
  percentChange,
  ledgerCsvRows,
  downloadCsv,
} from "@/lib/accounting-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#10b981", "#f59e0b", "#ef4444", "#6366f1"];

function formatAccountingYAxis(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs < 1000) {
    return value.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
  }
  if (abs < 1_000_000) {
    return `${(value / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} k`;
  }
  const m = value / 1_000_000;
  const rounded = Number.isInteger(m) ? m : parseFloat(m.toFixed(1));
  return `${rounded.toLocaleString("fr-FR")} M`;
}

const chartConfig = {
  revenue: {
    label: "CA",
    color: "hsl(var(--primary))",
  },
  profit: {
    label: "Marge estimée",
    color: "hsl(var(--accent))",
  },
} satisfies ChartConfig;

const ACCOUNTING_JOURNAL_COLUMNS: TableColumnDef[] = [
  { id: "date", label: "Date", mobileVisible: false },
  { id: "type", label: "Règlement", defaultVisible: false },
  { id: "description", label: "Description", required: true },
  { id: "amount", label: "Montants" },
  { id: "status", label: "Statut", defaultVisible: false },
];

function paymentLabel(pt?: string): string {
  switch (pt) {
    case "cash":
      return "Espèces";
    case "mobile_money":
      return "Mobile money";
    case "credit":
      return "Crédit";
    default:
      return pt || "-";
  }
}

function paymentBadgeClass(pt?: string): string {
  switch (pt) {
    case "cash":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "mobile_money":
      return "border-sky-200 bg-sky-50 text-sky-900";
    case "credit":
      return "border-violet-200 bg-violet-50 text-violet-900";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function renderJournalCells(col: TableColumnDef, sale: AccountingSale) {
  const total = Number(sale.totalAmount) || 0;
  const enc = Number(sale.amountPaid) || 0;

  switch (col.id) {
    case "date":
      return (
        <TableCell key={col.id} className="text-xs whitespace-nowrap">
          {sale.saleDate?.toDate
            ? sale.saleDate.toDate().toLocaleString("fr-FR", {
                dateStyle: "short",
                timeStyle: "short",
              })
            : "-"}
        </TableCell>
      );
    case "type":
      return (
        <TableCell key={col.id}>
          <Badge variant="outline" className={cn("text-[10px] font-medium", paymentBadgeClass(sale.paymentType))}>
            {paymentLabel(sale.paymentType)}
          </Badge>
        </TableCell>
      );
    case "description":
      return (
        <TableCell key={col.id} className="text-sm font-medium">
          <span className="text-primary">Vente</span>{" "}
          <span className="font-mono text-xs text-muted-foreground">#{sale.id.substring(0, 8)}</span>
        </TableCell>
      );
    case "amount":
      return (
        <TableCell key={col.id}>
          <div className="flex flex-col gap-0.5 font-mono text-sm">
            <span className="font-bold text-emerald-700">+{total.toLocaleString()} GNF</span>
            {sale.paymentType === "credit" ? (
              <span className="text-[10px] text-muted-foreground">
                Encaissé : {enc.toLocaleString()} GNF
              </span>
            ) : null}
          </div>
        </TableCell>
      );
    case "status":
      return (
        <TableCell key={col.id}>
          <span className="text-[10px] font-bold uppercase text-muted-foreground">
            {sale.status || "-"}
          </span>
        </TableCell>
      );
    default:
      return null;
  }
}

type ReportPreset = "month" | "prev_month" | "year" | "90d";

export default function AccountingPage() {
  const { profile } = useUser();
  const { activeBoutiqueId } = useBoutiqueScope();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [journalSearch, setJournalSearch] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportPreset, setReportPreset] = useState<ReportPreset>("month");

  const boutiqueId = activeBoutiqueId?.trim() || "";

  const boutiqueDocRef = useMemoFirebase(() => {
    if (!firestore || !boutiqueId) return null;
    return doc(firestore, "boutiques", boutiqueId);
  }, [firestore, boutiqueId]);

  const { data: boutiqueDoc } = useDoc<{ name?: string }>(boutiqueDocRef);

  const boutiqueLabel = useMemo(() => {
    if (!boutiqueId) return "";
    const n = boutiqueDoc?.name?.trim();
    return n || boutiqueId;
  }, [boutiqueId, boutiqueDoc?.name]);

  const salesQuery = useMemoFirebase(() => {
    if (!firestore || !boutiqueId) return null;
    return query(
      collection(firestore, "boutiques", boutiqueId, "sales"),
      orderBy("saleDate", "desc"),
      limit(650)
    );
  }, [firestore, boutiqueId]);

  const productsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "products"), orderBy("name", "asc"));
  }, [firestore]);

  const stocksQuery = useMemoFirebase(() => {
    if (!firestore || !boutiqueId) return null;
    return query(collection(firestore, "boutiques", boutiqueId, "stocks"));
  }, [firestore, boutiqueId]);

  const paymentsQuery = useMemoFirebase(() => {
    if (!firestore || !boutiqueId) return null;
    return query(collection(firestore, "boutiques", boutiqueId, "payments"), limit(400));
  }, [firestore, boutiqueId]);

  const { data: salesRaw, isLoading: loadingSales } = useCollection(salesQuery);
  const { data: productsRaw, isLoading: loadingProducts } = useCollection(productsQuery);
  const { data: stocksRaw, isLoading: loadingStocks } = useCollection(stocksQuery);
  const { data: paymentsRaw, isLoading: loadingPayments } = useCollection(paymentsQuery);

  const sales = useMemo(() => (salesRaw ?? []) as AccountingSale[], [salesRaw]);
  const payments = useMemo(() => (paymentsRaw ?? []) as AccountingPayment[], [paymentsRaw]);

  const purchaseMap = useMemo(
    () =>
      buildPurchasePriceMap(
        (productsRaw ?? []).map((p: { id: string; purchasePrice?: number }) => ({
          id: p.id,
          purchasePrice: p.purchasePrice,
        }))
      ),
    [productsRaw]
  );

  const chartYear = new Date().getFullYear();
  const chartData = useMemo(
    () => monthlyYearSeries(sales, purchaseMap, chartYear),
    [sales, purchaseMap, chartYear]
  );

  const today = new Date();
  const y = today.getFullYear();
  const m0 = today.getMonth();
  const { start: monthStart, end: monthEnd } = monthRangeUtc(y, m0);
  const prevMonthStart = m0 === 0 ? monthRangeUtc(y - 1, 11).start : monthRangeUtc(y, m0 - 1).start;
  const prevMonthEnd = m0 === 0 ? monthRangeUtc(y - 1, 11).end : monthRangeUtc(y, m0 - 1).end;

  const salesThisMonth = useMemo(
    () => salesBetween(sales, monthStart, monthEnd),
    [sales, monthStart, monthEnd]
  );
  const salesPrevMonth = useMemo(
    () => salesBetween(sales, prevMonthStart, prevMonthEnd),
    [sales, prevMonthStart, prevMonthEnd]
  );

  const profitMonth = profitForSales(salesThisMonth, purchaseMap);
  const profitPrevMonth = profitForSales(salesPrevMonth, purchaseMap);
  const profitDeltaPct = percentChange(profitMonth, profitPrevMonth);

  const encVent = sumSaleEncaissements(salesThisMonth);
  const encRepay = sumPaymentAmounts(paymentsBetween(payments, monthStart, monthEnd));
  const encaissementsMonth = encVent + encRepay;

  const stockCostValuation = useMemo(
    () => inventoryCostValue((stocksRaw ?? []) as { productId?: string; quantity?: number }[], purchaseMap),
    [stocksRaw, purchaseMap]
  );

  const yearStart = new Date(chartYear, 0, 1, 0, 0, 0, 0);
  const pieSlices = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return paymentTypeBreakdown(sales, yearStart, end);
  }, [sales, yearStart]);
  const pieTotal = pieSlices.reduce((a, p) => a + p.value, 0);
  const pieData =
    pieSlices.length > 0
      ? pieSlices
      : [{ name: "Aucune vente sur la période", value: 0 }];

  const { visibility, setColumnVisible, visibleColumns } = useTableColumnVisibility(
    "hoolo:table:accounting-journal:v3",
    ACCOUNTING_JOURNAL_COLUMNS
  );

  const debouncedJournalSearch = useDebouncedValue(journalSearch, 280);

  const journalSales = useMemo(() => sales.slice(0, 120), [sales]);

  const filteredSales = useMemo(() => {
    if (!journalSales.length) return [];
    return journalSales.filter((sale) =>
      rowMatchesSearch(debouncedJournalSearch, [
        sale.id,
        String(sale.totalAmount ?? ""),
        String(sale.amountPaid ?? ""),
        sale.status,
        sale.paymentType,
        sale.saleDate?.toDate
          ? sale.saleDate.toDate().toLocaleDateString("fr-FR")
          : "",
      ])
    );
  }, [journalSales, debouncedJournalSearch]);

  const journalResultHint =
    journalSales.length > 0 ? `${filteredSales.length}/${journalSales.length}` : undefined;

  const loading = loadingSales || loadingProducts || loadingStocks || loadingPayments;

  const handleGrandLivreCsv = () => {
    if (!boutiqueId || !sales.length) {
      toast({
        title: "Export vide",
        description: "Aucune vente chargée pour ce magasin.",
      });
      return;
    }
    const rows = ledgerCsvRows(sales);
    downloadCsv(`grand-livre_${boutiqueId}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast({ title: "Grand livre exporté", description: `${sales.length} ligne(s).` });
  };

  const reportRange = (): { start: Date; end: Date; label: string } => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    switch (reportPreset) {
      case "month":
        return { ...monthRangeUtc(y, m0), label: "mois en cours" };
      case "prev_month": {
        const pm = m0 === 0 ? 11 : m0 - 1;
        const py = m0 === 0 ? y - 1 : y;
        return { ...monthRangeUtc(py, pm), label: "mois précédent" };
      }
      case "year": {
        const start = new Date(chartYear, 0, 1, 0, 0, 0, 0);
        return { start, end, label: `${chartYear}` };
      }
      case "90d":
      default: {
        const start = new Date(end);
        start.setDate(start.getDate() - 90);
        start.setHours(0, 0, 0, 0);
        return { start, end, label: "90 derniers jours" };
      }
    }
  };

  const buildReportCsvRows = () => {
    if (!boutiqueId || !sales.length) {
      return null;
    }
    const { start, end, label } = reportRange();
    const sliceSales = salesBetween(sales, start, end);
    const slicePay = paymentsBetween(payments, start, end);
    const ca = sliceSales.reduce((a, s) => a + (Number(s.totalAmount) || 0), 0);
    const marge = profitForSales(sliceSales, purchaseMap);
    const encV = sumSaleEncaissements(sliceSales);
    const encR = sumPaymentAmounts(slicePay);
    const rows: string[][] = [
      ["Synthèse comptable Hoolo Service", ""],
      ["Période", label],
      ["Boutique", boutiqueId],
      ["", ""],
      ["Libellé", "Montant GNF"],
      ["Chiffre d'affaires TTC", String(ca)],
      ["Marge brute estimée (CA − coût catalogue)", String(Math.round(marge))],
      ["Encaissements liés aux ventes", String(Math.round(encV))],
      ["Remboursements clients (versements)", String(Math.round(encR))],
      ["Valorisation stock (coût)", String(Math.round(stockCostValuation))],
      ["", ""],
      ["Détail ventes (extrait)", ""],
      ...ledgerCsvRows(sliceSales).slice(0, 201),
    ];
    return { rows, label, sliceSales, slicePay, ca, marge, encV, encR };
  };

  const handleReportCsv = () => {
    const report = buildReportCsvRows();
    if (!report) {
      toast({ variant: "destructive", title: "Données insuffisantes" });
      return;
    }
    const { rows, label } = report;
    downloadCsv(
      `rapport_${label.replace(/\s+/g, "_")}_${boutiqueId}_${new Date().toISOString().slice(0, 10)}.csv`,
      rows
    );
    toast({ title: "Rapport exporté", description: `Période : ${label}` });
    setReportOpen(false);
  };

  if (profile?.role !== "Admin") {
    return (
      <AppLayout>
        <div className="flex h-[60vh] flex-col items-center justify-center space-y-4 text-center">
          <div className="rounded-full bg-rose-100 p-4 text-rose-600">
            <BarChart3 size={48} />
          </div>
          <h2 className="text-2xl font-bold">Accès restreint</h2>
          <p className="text-muted-foreground max-w-md">
            La comptabilité et les exports financiers sont réservés aux administrateurs.
          </p>
        </div>
      </AppLayout>
    );
  }

  if (!boutiqueId) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Card className="border-amber-200 bg-amber-50/80">
            <CardHeader className="flex flex-row items-start gap-3">
              <Building2 className="mt-0.5 h-6 w-6 shrink-0 text-amber-800" />
              <div>
                <CardTitle className="text-base text-amber-950">Magasin requis</CardTitle>
                <CardDescription className="text-amber-900/90">
                  Sélectionnez un magasin en haut de page, ou créez-en un dans l’administration.
                </CardDescription>
                <Button className="mt-4 bg-primary" asChild>
                  <Link href="/boutiques">Boutiques</Link>
                </Button>
              </div>
            </CardHeader>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const hasChartActivity = chartData.some((d) => d.revenue > 0 || d.profit > 0);

  return (
    <AppLayout>
      <div className="min-w-0 space-y-6">
        <div className="space-y-4">
          <div className="min-w-0 max-w-full space-y-1">
            <h1 className="text-2xl font-bold leading-tight text-primary sm:text-3xl">Comptabilité</h1>
            <p className="text-pretty text-sm text-muted-foreground sm:text-base">
              Magasin&nbsp;: <span className="font-medium text-foreground">{boutiqueLabel}</span>
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button variant="outline" className="w-full sm:w-auto" onClick={handleGrandLivreCsv} disabled={loading}>
              <Download className="mr-2 h-4 w-4" /> Grand livre CSV
            </Button>
            <Button className="w-full bg-primary sm:w-auto" onClick={() => setReportOpen(true)} disabled={loading}>
              <Calculator className="mr-2 h-4 w-4" /> Rapport synthèse
            </Button>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-3">
          <Card className="bg-primary text-primary-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium leading-snug opacity-95">Marge du mois</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums sm:text-3xl">
                {Math.round(profitMonth).toLocaleString()} GNF
              </div>
              <div className="mt-2 flex items-center gap-1 text-xs opacity-90">
                {profitDeltaPct != null ? (
                  <>
                    {profitDeltaPct >= 0 ? (
                      <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>
                      {profitDeltaPct >= 0 ? "+" : ""}
                      {profitDeltaPct}% vs mois précédent
                    </span>
                  </>
                ) : (
                  <span>Pas de comparaison (mois précédent vide ou nul)</span>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium leading-snug text-muted-foreground">Encaissements du mois</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums sm:text-3xl">
                {Math.round(encaissementsMonth).toLocaleString()} GNF
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Ventes encaissées et remboursements enregistrés.</p>
            </CardContent>
          </Card>
          <Card className="col-span-2 lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium leading-snug text-muted-foreground">Stock (valeur achat)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-primary sm:text-3xl">
                {Math.round(stockCostValuation).toLocaleString()} GNF
              </div>
              <p className="text-muted-foreground mt-2 text-xs">Estimation à partir du catalogue - pas une charge du mois.</p>
              <Button variant="link" className="mt-1 h-auto p-0 text-xs font-medium" asChild>
                <Link href="/inventory">Voir l&apos;inventaire</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle>CA et marge - {chartYear}</CardTitle>
              <p className="text-sm text-muted-foreground">CA TTC et marge estimée, mois par mois.</p>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-2 sm:px-6">
              {loading ? (
                <div className="flex h-[240px] items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
                </div>
              ) : !hasChartActivity ? (
                <p className="text-muted-foreground py-12 text-center text-sm">
                  Aucune vente cette année pour ce magasin.
                </p>
              ) : (
                <ChartContainer
                  config={chartConfig}
                  className="aspect-auto h-[240px] w-full min-w-0 max-w-full sm:h-[300px] [&_.recharts-responsive-container]:max-w-full"
                >
                  <AreaChart data={chartData} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevAcc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorProfAcc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-profit)" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="var(--color-profit)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11 }}
                      interval={0}
                      height={28}
                    />
                    <YAxis
                      width={44}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10 }}
                      tickFormatter={formatAccountingYAxis}
                      domain={[0, (max: number) => Math.max(max * 1.08, 1)]}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--color-revenue)"
                      fillOpacity={1}
                      fill="url(#colorRevAcc)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      stroke="var(--color-profit)"
                      fillOpacity={1}
                      fill="url(#colorProfAcc)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader className="pb-2">
              <CardTitle>Règlements - {chartYear}</CardTitle>
              <p className="text-sm text-muted-foreground">Part du CA TTC par mode de paiement (année en cours).</p>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {!pieTotal && !loading ? (
                <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <TrendingDown size={36} className="opacity-25" />
                  <p className="text-sm">Pas encore de ventes sur cette année.</p>
                </div>
              ) : (
                <>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={76}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell
                              key={entry.name}
                              fill={
                                entry.name === "Aucune vente sur la période"
                                  ? "#e5e7eb"
                                  : COLORS[index % COLORS.length]
                              }
                            />
                          ))}
                        </Pie>
                        <ChartTooltip
                          formatter={(value: number, name: string) =>
                            name === "Aucune vente sur la période"
                              ? ["-", name]
                              : [`${Number(value).toLocaleString("fr-FR")} GNF`, name]
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 max-h-[140px] w-full space-y-1.5 overflow-y-auto pr-1 text-xs">
                    {pieData.map((b, i) => {
                      const pct =
                        pieTotal > 0 && b.name !== "Aucune vente sur la période"
                          ? Math.round((b.value / pieTotal) * 100)
                          : null;
                      return (
                        <div key={b.name} className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  b.name === "Aucune vente sur la période"
                                    ? "#e5e7eb"
                                    : COLORS[i % COLORS.length],
                              }}
                            />
                            <span className="truncate">{b.name}</span>
                          </div>
                          <span className="shrink-0 font-semibold">
                            {pct != null ? `${pct} %` : `${b.value.toLocaleString("fr-FR")} GNF`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div>
              <CardTitle>Journal caisse</CardTitle>
              <p className="text-sm text-muted-foreground">
                Dernières ventes affichées&nbsp;: {journalSales.length}
                {sales.length > journalSales.length ? (
                  <span> · {sales.length} au total en mémoire</span>
                ) : null}
              </p>
            </div>
            <TableColumnToggle
              columns={ACCOUNTING_JOURNAL_COLUMNS}
              visibility={visibility}
              onColumnVisibleChange={setColumnVisible}
              className="w-full shrink-0 sm:w-auto"
            />
          </CardHeader>
          <CardContent className="min-w-0 space-y-4 p-4 sm:p-6">
            {loadingSales ? (
              <div className="flex justify-center py-10 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" /> Chargement…
              </div>
            ) : !journalSales.length ? (
              <p className="py-10 text-center text-muted-foreground">
                Aucune vente dans ce magasin. Les ventes alimentent ce journal.
              </p>
            ) : (
              <>
                <ListSearchBar
                  value={journalSearch}
                  onChange={setJournalSearch}
                  placeholder="Réf. vente, montant, règlement…"
                  resultHint={
                    journalResultHint ? `${journalResultHint.replace("/", " / ")} lignes` : undefined
                  }
                  id="accounting-journal-search"
                  className="min-w-0"
                />
                {!filteredSales.length ? (
                  <p className="py-8 text-center text-muted-foreground">Aucun résultat pour cette recherche.</p>
                ) : (
                  <>
                    <div className="space-y-3 md:hidden">
                      {filteredSales.map((sale) => {
                        const total = Number(sale.totalAmount) || 0;
                        const enc = Number(sale.amountPaid) || 0;
                        const d = sale.saleDate?.toDate?.();
                        return (
                          <div key={sale.id} className="rounded-lg border bg-card p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-primary">
                                  Vente{" "}
                                  <span className="font-mono text-xs text-muted-foreground">
                                    #{sale.id.substring(0, 8)}
                                  </span>
                                </p>
                                {d ? (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                                  </p>
                                ) : null}
                              </div>
                              <Badge
                                variant="outline"
                                className={cn("shrink-0 text-[10px] font-medium", paymentBadgeClass(sale.paymentType))}
                              >
                                {paymentLabel(sale.paymentType)}
                              </Badge>
                            </div>
                            <div className="mt-3 border-t pt-3">
                              <p className="font-mono text-base font-bold text-emerald-700 tabular-nums">
                                +{total.toLocaleString()} GNF
                              </p>
                              {sale.paymentType === "credit" ? (
                                <p className="text-xs text-muted-foreground">
                                  Encaissé&nbsp;: {enc.toLocaleString()} GNF
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {visibleColumns.map((col) => (
                              <TableHead key={col.id} className={col.headerClassName}>
                                {col.label}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSales.map((sale) => (
                            <TableRow key={sale.id}>
                              {visibleColumns.map((col) => renderJournalCells(col, sale))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={reportOpen} onOpenChange={setReportOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rapport synthèse</DialogTitle>
              <DialogDescription>Export CSV&nbsp;: synthèse et extrait des ventes pour la période choisie.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label>Période</Label>
              <Select value={reportPreset} onValueChange={(v) => setReportPreset(v as ReportPreset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mois en cours</SelectItem>
                  <SelectItem value="prev_month">Mois précédent</SelectItem>
                  <SelectItem value="year">Année {chartYear} (à ce jour)</SelectItem>
                  <SelectItem value="90d">90 derniers jours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setReportOpen(false)}>
                Annuler
              </Button>
              <Button className="bg-primary" onClick={handleReportCsv} disabled={loading}>
                Télécharger CSV
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
