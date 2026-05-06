
"use client";

import React, { useState, useMemo, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Package,
  CreditCard,
  Wrench,
  AlertCircle,
  Calendar as CalendarIcon,
  Loader2,
  ChevronRight,
  ArrowLeftRight,
  ShoppingCart,
  Users,
  BarChart3,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Pie,
  PieChart,
  Cell,
} from "recharts";
import { useFirestore, useUser, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { useBoutiqueScope } from "@/contexts/boutique-scope";
import { collection, query, where, orderBy, limit, getDocs, doc } from "firebase/firestore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { getUserFirstNameLabel } from "@/lib/user-display";
import {
  getDashboardPeriodBounds,
  filterSalesInPeriod,
  aggregateRevenueForChart,
  type SaleLike,
} from "@/lib/dashboard-utils";
import { normalizeAppSettings } from "@/firebase/services/settings-service";
import { formatCompactGNF } from "@/lib/format-compact-money";
import { productListLabel } from "@/lib/product-display";

const chartConfig = {
  revenue: {
    label: "Chiffre d'Affaires",
    color: "hsl(var(--primary))",
  },
  margin: {
    label: "Marge Brute",
    color: "hsl(var(--accent))",
  },
} satisfies ChartConfig;

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#10b981", "#f59e0b", "#ef4444"];

type PieSlice = { name: string; value: number };

export default function Dashboard() {
  const [period, setPeriod] = useState("7d");
  const firestore = useFirestore();
  const { profile, user, isUserLoading } = useUser();
  const { activeBoutiqueId } = useBoutiqueScope();
  const isAdmin = profile?.role === "Admin";

  const settingsDocRef = useMemoFirebase(
    () => (firestore ? doc(firestore, "settings", "global") : null),
    [firestore]
  );
  const { data: settingsRaw } = useDoc(settingsDocRef);
  const globalLowStock = useMemo(
    () => normalizeAppSettings(settingsRaw as Record<string, unknown> | undefined).lowStockThreshold,
    [settingsRaw]
  );

  const todayLabel = useMemo(() => {
    const d = new Date();
    const w = d.toLocaleDateString("fr-FR", { weekday: "long" });
    const weekday = w.charAt(0).toUpperCase() + w.slice(1);
    const dayMonth = d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
    });
    return `${weekday}, ${dayMonth}`;
  }, []);

  const greetingName = useMemo(
    () => getUserFirstNameLabel(profile, user),
    [profile?.firstName, profile?.displayName, user?.displayName, user?.email]
  );

  const boutiquesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "boutiques"), orderBy("name", "asc"));
  }, [firestore, user]);

  const { data: boutiques, isLoading: loadingBoutiques } = useCollection(boutiquesQuery);

  const [adminSalesFlat, setAdminSalesFlat] = useState<SaleLike[]>([]);
  const [adminSalesLoading, setAdminSalesLoading] = useState(false);

  useEffect(() => {
    if (!firestore || !user) {
      setAdminSalesFlat([]);
      setAdminSalesLoading(false);
      return;
    }
    if (loadingBoutiques) {
      setAdminSalesLoading(true);
      return;
    }
    if (!boutiques?.length) {
      setAdminSalesFlat([]);
      setAdminSalesLoading(false);
      return;
    }

    let cancelled = false;
    setAdminSalesLoading(true);
    (async () => {
      try {
        const chunks = await Promise.all(
          boutiques.map(async (b) => {
            const q = query(
              collection(firestore, "boutiques", b.id, "sales"),
              orderBy("saleDate", "desc"),
              limit(500)
            );
            const snap = await getDocs(q);
            return snap.docs.map((d) => ({
              id: d.id,
              boutiqueId: b.id,
              ...d.data(),
            })) as SaleLike[];
          })
        );
        if (!cancelled) setAdminSalesFlat(chunks.flat());
      } finally {
        if (!cancelled) setAdminSalesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firestore, user, boutiques, loadingBoutiques]);

  const mergedSales = useMemo((): SaleLike[] => adminSalesFlat, [adminSalesFlat]);

  const loadingSales = adminSalesLoading;

  const periodBounds = useMemo(() => getDashboardPeriodBounds(period), [period]);

  const salesInPeriod = useMemo(
    () => filterSalesInPeriod(mergedSales, periodBounds.start, periodBounds.end),
    [mergedSales, periodBounds]
  );

  const caPeriod = useMemo(
    () => salesInPeriod.reduce((a, s) => a + (s.totalAmount || 0), 0),
    [salesInPeriod]
  );

  const caCurrentCalendarMonth = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    return filterSalesInPeriod(mergedSales, start, end).reduce((a, s) => a + (s.totalAmount || 0), 0);
  }, [mergedSales]);

  const revenueData = useMemo(
    () => aggregateRevenueForChart(mergedSales, period, periodBounds.start, periodBounds.end),
    [mergedSales, period, periodBounds]
  );

  const showMarginBar = revenueData.some((d) => d.margin > 0);

  const pieData = useMemo((): PieSlice[] => {
    const sales = salesInPeriod;
    const totalCa = sales.reduce((a, s) => a + (s.totalAmount || 0), 0);

    if (boutiques && boutiques.length > 1 && totalCa > 0) {
      const byB = new Map<string, number>();
      for (const s of sales) {
        const bid = s.boutiqueId ?? "";
        byB.set(bid, (byB.get(bid) ?? 0) + (s.totalAmount || 0));
      }
      return boutiques
        .map((b) => ({
          name: (b as { name?: string }).name || b.id,
          value: byB.get(b.id) ?? 0,
        }))
        .filter((x) => x.value > 0);
    }

    if (totalCa <= 0) return [{ name: "Aucune vente", value: 1 }];

    let cash = 0;
    let mobile = 0;
    let credit = 0;
    for (const s of sales) {
      const pt = s.paymentType;
      const amt = s.totalAmount || 0;
      if (pt === "credit") credit += amt;
      else if (pt === "mobile_money") mobile += amt;
      else cash += amt;
    }
    const rows: PieSlice[] = [];
    if (cash > 0) rows.push({ name: "Espèces", value: cash });
    if (mobile > 0) rows.push({ name: "Mobile money", value: mobile });
    if (credit > 0) rows.push({ name: "À crédit", value: credit });
    return rows.length ? rows : [{ name: "Aucune vente", value: 1 }];
  }, [boutiques, salesInPeriod]);

  const clientsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, "clients")) : null),
    [firestore]
  );
  const productsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, "products")) : null),
    [firestore]
  );
  const repairsQuery = useMemoFirebase(() => {
    if (!firestore || !activeBoutiqueId) return null;
    return query(
      collection(firestore, "boutiques", activeBoutiqueId, "repairs"),
      where("status", "in", ["reçu", "en_diagnostic", "en_cours"])
    );
  }, [firestore, activeBoutiqueId]);

  const stocksQuery = useMemoFirebase(() => {
    if (!firestore || !activeBoutiqueId) return null;
    return query(collection(firestore, "boutiques", activeBoutiqueId, "stocks"));
  }, [firestore, activeBoutiqueId]);

  const transfersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "transfers"), orderBy("createdAt", "desc"), limit(120));
  }, [firestore]);

  const { data: clients, isLoading: loadingClients } = useCollection(clientsQuery);
  const { data: products, isLoading: loadingProducts } = useCollection(productsQuery);
  const { data: activeRepairs, isLoading: loadingRepairs } = useCollection(repairsQuery);
  const { data: stocks, isLoading: loadingStocks } = useCollection(stocksQuery);
  const { data: transfers } = useCollection(transfersQuery);

  const totalDebt = useMemo(() => {
    return clients?.reduce((acc, client) => acc + (client.currentDebt || 0), 0) || 0;
  }, [clients]);

  const pendingTransfersCount = useMemo(() => {
    if (!transfers?.length) return 0;
    return transfers.filter((t) => {
      if ((t as { status?: string }).status !== "pending") return false;
      if (isAdmin) return true;
      const from = (t as { fromBoutiqueId?: string }).fromBoutiqueId;
      const to = (t as { toBoutiqueId?: string }).toBoutiqueId;
      return from === activeBoutiqueId || to === activeBoutiqueId;
    }).length;
  }, [transfers, isAdmin, activeBoutiqueId]);

  const stockAlerts = useMemo(() => {
    if (!products?.length || !stocks) return [];
    return products
      .map((p) => {
        const st = stocks.find((s) => (s as { productId?: string }).productId === p.id);
        const qty = (st as { quantity?: number })?.quantity ?? 0;
        const th =
          (st as { alertThreshold?: number } | undefined)?.alertThreshold ?? globalLowStock;
        return {
          id: p.id,
          name: (p as { name?: string }).name ?? p.id,
          reference: (p as { reference?: string | null }).reference ?? null,
          qty,
          th,
        };
      })
      .filter((row) => row.qty <= row.th)
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 8);
  }, [products, stocks, globalLowStock]);

  const currentBoutiqueName = useMemo(() => {
    if (!activeBoutiqueId) return null;
    const b = boutiques?.find((x) => x.id === activeBoutiqueId);
    return (b as { name?: string } | undefined)?.name ?? activeBoutiqueId;
  }, [boutiques, activeBoutiqueId]);

  const periodLabel =
    period === "24h"
      ? "24 h"
      : period === "7d"
        ? "7 jours"
        : period === "30d"
          ? "30 jours"
          : "année en cours";

  const pieTotalForPct = pieData.reduce((a, p) => a + p.value, 0);

  return (
    <AppLayout>
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 text-left">
            <p className="text-sm text-muted-foreground">{todayLabel}</p>
            <h1 className="mt-1 font-bold tracking-tight text-foreground text-3xl sm:text-4xl">
              Bonjour{" "}
              {isUserLoading ? (
                <span
                  className="inline-block h-9 w-40 max-w-[60vw] animate-pulse rounded-md bg-muted align-middle sm:h-10"
                  aria-hidden
                />
              ) : (
                <span className="text-accent">{greetingName ?? "…"}</span>
              )}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px] sm:w-[180px] h-9">
                <CalendarIcon className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Dernières 24h</SelectItem>
                <SelectItem value="7d">7 derniers jours</SelectItem>
                <SelectItem value="30d">30 derniers jours</SelectItem>
                <SelectItem value="year">Cette année</SelectItem>
              </SelectContent>
            </Select>
            <Button className="bg-primary hover:bg-primary/90 h-9" asChild>
              <Link href="/sales">Vente</Link>
            </Button>
          </div>
        </div>

        <div className="hidden flex-wrap gap-2 md:flex">
          <Button variant="outline" size="sm" className="h-8" asChild>
            <Link href="/sales">
              <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Ventes
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="h-8" asChild>
            <Link href="/inventory">
              <Package className="mr-1.5 h-3.5 w-3.5" /> Stock
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="h-8" asChild>
            <Link href="/repairs">
              <Wrench className="mr-1.5 h-3.5 w-3.5" /> Réparations
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="h-8" asChild>
            <Link href="/credits">
              <CreditCard className="mr-1.5 h-3.5 w-3.5" /> Crédits
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="h-8" asChild>
            <Link href="/transfers">
              <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" /> Transferts
            </Link>
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/accounting">
                <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Comptabilité
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8" asChild>
            <Link href="/customers">
              <Users className="mr-1.5 h-3.5 w-3.5" /> Clients
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card className="border-l-4 border-l-primary shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase text-muted-foreground">
                CA ({periodLabel})
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div
                className="text-xl sm:text-2xl font-bold truncate"
                title={loadingSales ? undefined : `${caPeriod.toLocaleString("fr-FR")} GNF`}
              >
                {loadingSales ? (
                  <Loader2 className="animate-spin h-5 w-5" />
                ) : (
                  formatCompactGNF(caPeriod)
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Ventes enregistrées Firestore</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-sky-500 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase text-muted-foreground">CA (mois)</CardTitle>
              <CalendarIcon className="h-4 w-4 text-sky-500" />
            </CardHeader>
            <CardContent>
              <div
                className="text-xl sm:text-2xl font-bold truncate"
                title={loadingSales ? undefined : `${caCurrentCalendarMonth.toLocaleString("fr-FR")} GNF`}
              >
                {loadingSales ? (
                  <Loader2 className="animate-spin h-5 w-5" />
                ) : (
                  formatCompactGNF(caCurrentCalendarMonth)
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Mois calendaire en cours</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-accent shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Catalogue</CardTitle>
              <Package className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">
                {loadingProducts ? <Loader2 className="animate-spin h-5 w-5" /> : products?.length || 0}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Articles référencés</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Réparations</CardTitle>
              <Wrench className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">
                {loadingRepairs ? <Loader2 className="animate-spin h-5 w-5" /> : activeRepairs?.length || 0}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">En cours (boutique sélectionnée)</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Transferts</CardTitle>
              <ArrowLeftRight className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">{pendingTransfersCount}</div>
              <p className="text-[10px] text-muted-foreground mt-1">En attente (transferts)</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-rose-500 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Créances</CardTitle>
              <CreditCard className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div
                className="text-xl sm:text-2xl font-bold truncate"
                title={loadingClients ? undefined : `${totalDebt.toLocaleString("fr-FR")} GNF`}
              >
                {loadingClients ? <Loader2 className="animate-spin h-5 w-5" /> : formatCompactGNF(totalDebt)}
              </div>
              <p className="text-[10px] text-rose-600 flex items-center mt-1 truncate">
                <AlertCircle className="h-3 w-3 mr-1 shrink-0" />{" "}
                {clients?.filter((c) => (c.currentDebt || 0) > 0).length || 0} débiteurs
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="lg:col-span-2 overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg">Performance des ventes</CardTitle>
              <CardDescription className="text-xs">
                CA agrégé sur la période sélectionnée (marge brute : données non disponibles dans le modèle actuel).
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <div className="h-[300px] w-full">
                {loadingSales ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement des ventes…
                  </div>
                ) : (
                  <ChartContainer config={chartConfig} className="h-full w-full">
                    <BarChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => {
                          const n = Number(v);
                          if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
                          if (n >= 1000) return `${Math.round(n / 1000)}k`;
                          return String(n);
                        }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
                      {showMarginBar ? (
                        <Bar dataKey="margin" fill="var(--color-margin)" radius={[4, 4, 0, 0]} />
                      ) : null}
                    </BarChart>
                  </ChartContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {boutiques && boutiques.length > 1 ? "CA par boutique" : "Paiements"}
              </CardTitle>
              <CardDescription className="text-xs">
                {boutiques && boutiques.length > 1
                  ? "Part du CA sur la période (plusieurs boutiques)."
                  : "Répartition comptant / crédit sur la période."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="h-[200px] sm:h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip
                      formatter={(value: number, name: string) =>
                        name === "Aucune vente"
                          ? ["-", name]
                          : [formatCompactGNF(Number(value)), name]
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2 w-full max-h-[150px] overflow-y-auto pr-2">
                {pieData.map((b, i) => {
                  const pct =
                    pieTotalForPct > 0 && b.name !== "Aucune vente"
                      ? Math.round((b.value / pieTotalForPct) * 100)
                      : null;
                  return (
                    <div key={b.name} className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        <span className="truncate">{b.name}</span>
                      </div>
                      <span className="font-bold shrink-0">
                        {b.name === "Aucune vente"
                          ? "-"
                          : pct != null
                            ? `${pct} %`
                            : formatCompactGNF(b.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-rose-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-rose-500" />
                <CardTitle className="text-lg">Alertes de stock</CardTitle>
              </div>
              <Button variant="ghost" size="sm" asChild className="h-8">
                <Link href="/inventory" className="text-xs text-primary font-bold">
                  Voir tout <ChevronRight size={14} className="ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {loadingProducts || loadingStocks ? (
                <div className="flex justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : stockAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-6 border-2 border-dashed rounded-lg">
                  Aucune alerte : tous les articles sont au-dessus de leur seuil (défaut {globalLowStock} unités).
                </p>
              ) : (
                <ul className="space-y-2">
                  {stockAlerts.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                    >
                      <span className="font-medium truncate mr-2">
                        {productListLabel({ name: row.name, reference: row.reference })}
                      </span>
                      <span
                        className={`shrink-0 font-bold ${row.qty === 0 ? "text-rose-600" : "text-orange-600"}`}
                      >
                        {row.qty}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
