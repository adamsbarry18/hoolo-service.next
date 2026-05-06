
"use client";

import React, { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  ArrowLeftRight,
  Download,
  PackageOpen,
  Loader2,
  Pencil,
  ClipboardList,
  Layers,
} from "lucide-react";
import Link from "next/link";
import { useCollection, useFirestore, useUser, useDoc, useMemoFirebase } from "@/firebase";
import { useBoutiqueScope } from "@/contexts/boutique-scope";
import { collection, query, orderBy, limit, doc } from "firebase/firestore";
import type { TableColumnDef } from "@/hooks/use-table-column-visibility";
import { useTableColumnVisibility } from "@/hooks/use-table-column-visibility";
import { TableColumnToggle } from "@/components/table/table-column-toggle";
import { ListSearchBar } from "@/components/table/list-search-bar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { rowMatchesSearch } from "@/lib/list-search";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StockAdjustDialog } from "@/components/inventory/stock-adjust-dialog";
import { normalizeAppSettings } from "@/firebase/services/settings-service";
import { cn } from "@/lib/utils";

const DEFAULT_BOUTIQUE_LABEL = "Hoolo Service";

const INVENTORY_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "product", label: "Produit", required: true },
  { id: "category", label: "Catégorie", mobileVisible: false },
  { id: "stock", label: "Stock" },
  { id: "threshold", label: "Seuil alerte", mobileVisible: false, defaultVisible: false },
  { id: "price", label: "Prix vente", defaultVisible: true },
  { id: "cost", label: "Prix achat", mobileVisible: false, defaultVisible: false },
  { id: "status", label: "Statut", defaultVisible: true },
  {
    id: "actions",
    label: "Actions",
    required: true,
    headerClassName: "text-right",
  },
];

type ProductRow = {
  id: string;
  name?: string;
  category?: string;
  reference?: string | null;
  sellingPrice?: number;
  purchasePrice?: number;
  isActive?: boolean;
};

type StockRow = {
  id: string;
  productId?: string;
  quantity?: number;
  alertThreshold?: number;
};

function movementLabel(type?: string): string {
  switch (type) {
    case "vente":
      return "Vente";
    case "ajustement":
      return "Ajustement";
    case "reception_initiale":
      return "Réception initiale";
    case "transfert_in":
      return "Transfert entrant";
    case "transfert_out":
      return "Transfert sortant";
    case "reparation":
      return "Réparation (pièce)";
    case "sortie":
      return "Sortie stock";
    default:
      return type ?? "-";
  }
}

/** Couleurs stables par type de mouvement (lisibles en clair). */
function movementTypeBadgeClass(type?: string): string {
  switch (type) {
    case "vente":
      return "border-sky-300/80 bg-sky-100 text-sky-950";
    case "ajustement":
      return "border-amber-300/80 bg-amber-100 text-amber-950";
    case "reception_initiale":
      return "border-emerald-300/80 bg-emerald-100 text-emerald-950";
    case "transfert_in":
      return "border-teal-300/80 bg-teal-100 text-teal-950";
    case "transfert_out":
      return "border-violet-300/80 bg-violet-100 text-violet-950";
    case "reparation":
      return "border-indigo-300/80 bg-indigo-100 text-indigo-950";
    case "sortie":
      return "border-rose-300/80 bg-rose-100 text-rose-950";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

const CATEGORY_BADGE_PALETTES = [
  "border-sky-300/70 bg-sky-50 text-sky-950",
  "border-indigo-300/70 bg-indigo-50 text-indigo-950",
  "border-violet-300/70 bg-violet-50 text-violet-950",
  "border-fuchsia-300/70 bg-fuchsia-50 text-fuchsia-950",
  "border-emerald-300/70 bg-emerald-50 text-emerald-950",
  "border-teal-300/70 bg-teal-50 text-teal-950",
  "border-amber-300/70 bg-amber-50 text-amber-950",
  "border-orange-300/70 bg-orange-50 text-orange-950",
  "border-cyan-300/70 bg-cyan-50 text-cyan-950",
  "border-pink-300/70 bg-pink-50 text-pink-950",
] as const;

/** Même libellé de catégorie → même couleur (UT pour repérer les familles). */
function categoryBadgeClass(category: string): string {
  const c = category.trim();
  if (!c) return "border-border bg-muted/60 text-muted-foreground";
  let h = 0;
  for (let i = 0; i < c.length; i++) {
    h = (h * 31 + c.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_BADGE_PALETTES[h % CATEGORY_BADGE_PALETTES.length];
}

function renderInventoryCells(
  col: TableColumnDef,
  p: ProductRow,
  qty: number,
  threshold: number,
  hasStockLine: boolean,
  onAdjust: () => void
) {
  switch (col.id) {
    case "product":
      return (
        <TableCell key={col.id}>
          <div className="flex items-center gap-3">
            <div className="rounded bg-muted p-2">
              <PackageOpen className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <Link href={`/inventory/products/${p.id}`} className="truncate font-semibold text-foreground hover:underline block">
                {p.name}
              </Link>
              <p className="text-xs text-muted-foreground truncate">
                {(p.reference ?? "").trim() ? `Réf. ${(p.reference ?? "").trim()}` : p.id.substring(0, 8)}
              </p>
              {p.isActive === false && (
                <Badge variant="secondary" className="mt-1 text-[10px]">
                  Inactif
                </Badge>
              )}
            </div>
          </div>
        </TableCell>
      );
    case "category":
      return (
        <TableCell key={col.id}>
          <Badge variant="outline" className={cn("font-normal", categoryBadgeClass(p.category ?? ""))}>
            {p.category?.trim() ? p.category : "-"}
          </Badge>
        </TableCell>
      );
    case "stock":
      return (
        <TableCell key={col.id} className={`font-bold ${qty <= threshold && qty > 0 ? "text-orange-600" : qty === 0 ? "text-rose-600" : ""}`}>
          <span>{qty}</span>
          {!hasStockLine && (
            <span className="ml-2 text-xs font-normal text-amber-600">(non initialisé)</span>
          )}
        </TableCell>
      );
    case "threshold":
      return <TableCell key={col.id}>{threshold}</TableCell>;
    case "price":
      return (
        <TableCell key={col.id} className="font-mono text-sm">
          {(p.sellingPrice ?? 0).toLocaleString()} GNF
        </TableCell>
      );
    case "cost":
      return (
        <TableCell key={col.id} className="font-mono text-sm text-muted-foreground">
          {(p.purchasePrice ?? 0).toLocaleString()} GNF
        </TableCell>
      );
    case "status":
      return (
        <TableCell key={col.id}>
          <Badge
            className={
              qty === 0
                ? "bg-rose-100 text-rose-700"
                : qty <= threshold
                  ? "bg-orange-100 text-orange-700"
                  : "bg-emerald-100 text-emerald-700"
            }
          >
            {qty === 0 ? "Rupture" : qty <= threshold ? "Stock bas" : "Normal"}
          </Badge>
        </TableCell>
      );
    case "actions":
      return (
        <TableCell key={col.id} className="text-right">
          <Button variant="outline" size="sm" className="mr-1 h-8" onClick={onAdjust}>
            Stock
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-primary" asChild>
            <Link href={`/inventory/products/${p.id}`}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Détail
            </Link>
          </Button>
        </TableCell>
      );
    default:
      return null;
  }
}

export default function InventoryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "ok" | "low" | "out">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [hideInactive, setHideInactive] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustContext, setAdjustContext] = useState<{
    productId: string;
    productName: string;
    stock: { id: string; quantity: number; alertThreshold?: number } | null;
  } | null>(null);

  const firestore = useFirestore();
  const { profile } = useUser();
  const { activeBoutiqueId } = useBoutiqueScope();

  const settingsDocRef = useMemoFirebase(
    () => (firestore ? doc(firestore, "settings", "global") : null),
    [firestore]
  );
  const { data: settingsRaw } = useDoc(settingsDocRef);
  const globalLowStock = useMemo(
    () => normalizeAppSettings(settingsRaw as Record<string, unknown> | undefined).lowStockThreshold,
    [settingsRaw]
  );

  const boutiqueDocRef = useMemoFirebase(() => {
    if (!firestore || !activeBoutiqueId) return null;
    return doc(firestore, "boutiques", activeBoutiqueId);
  }, [firestore, activeBoutiqueId]);

  const { data: boutiqueDoc } = useDoc<{ name?: string }>(boutiqueDocRef);

  const boutiqueLabel = useMemo(() => {
    if (!activeBoutiqueId) return DEFAULT_BOUTIQUE_LABEL;
    const n = boutiqueDoc?.name?.trim();
    return n || activeBoutiqueId;
  }, [activeBoutiqueId, boutiqueDoc?.name]);

  const { visibility, setColumnVisible, visibleColumns } = useTableColumnVisibility(
    "hoolo:table:inventory-detail:v3",
    INVENTORY_TABLE_COLUMNS
  );
  const colSpan = visibleColumns.length;

  const productsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "products"), orderBy("name", "asc"));
  }, [firestore]);

  const { data: products, isLoading: isProductsLoading } = useCollection(productsQuery);

  const stocksQuery = useMemoFirebase(() => {
    if (!firestore || !activeBoutiqueId) return null;
    return query(collection(firestore, "boutiques", activeBoutiqueId, "stocks"));
  }, [firestore, activeBoutiqueId]);

  const { data: stocks, isLoading: isStocksLoading } = useCollection(stocksQuery);

  const movementsQuery = useMemoFirebase(() => {
    if (!firestore || !activeBoutiqueId) return null;
    return query(
      collection(firestore, "boutiques", activeBoutiqueId, "stockMovements"),
      orderBy("timestamp", "desc"),
      limit(100)
    );
  }, [firestore, activeBoutiqueId]);

  const { data: movements, isLoading: isMovementsLoading } = useCollection(movementsQuery);

  const getStockRow = (productId: string): StockRow | null => {
    const row = stocks?.find((s) => (s as StockRow).productId === productId);
    return row ? (row as StockRow) : null;
  };

  const getQty = (productId: string) => getStockRow(productId)?.quantity ?? 0;

  const getThreshold = (productId: string) =>
    getStockRow(productId)?.alertThreshold ?? globalLowStock;

  const categories = useMemo(() => {
    if (!products?.length) return [];
    const set = new Set<string>();
    products.forEach((p) => {
      const c = (p as ProductRow).category?.trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [products]);

  const debouncedSearch = useDebouncedValue(searchTerm, 280);

  const filteredProducts = useMemo(() => {
    if (!products?.length) return null;
    return products.filter((p) => {
      const pr = p as ProductRow;
      if (hideInactive && pr.isActive === false) return false;
      const qty = getQty(p.id);
      const th = getThreshold(p.id);
      if (stockFilter === "ok" && !(qty > th)) return false;
      if (stockFilter === "low" && !(qty > 0 && qty <= th)) return false;
      if (stockFilter === "out" && qty !== 0) return false;
      if (categoryFilter !== "all" && (pr.category || "") !== categoryFilter) return false;
      return rowMatchesSearch(debouncedSearch, [pr.name, pr.category, pr.reference, pr.id]);
    });
  }, [products, debouncedSearch, stockFilter, stocks, hideInactive, categoryFilter, globalLowStock]);

  const resultHint =
    products?.length != null && filteredProducts
      ? `${filteredProducts.length}/${products.length}`
      : undefined;

  const isLoading = isProductsLoading || isStocksLoading;

  const inventoryValuePurchase = useMemo(() => {
    if (!products?.length) return 0;
    return products.reduce((acc, p) => acc + getQty(p.id) * ((p as ProductRow).purchasePrice ?? 0), 0);
  }, [products, stocks]);

  const inventoryValueSelling = useMemo(() => {
    if (!products?.length) return 0;
    return products.reduce((acc, p) => acc + getQty(p.id) * ((p as ProductRow).sellingPrice ?? 0), 0);
  }, [products, stocks]);

  const alertCount = useMemo(() => {
    if (!products?.length) return 0;
    return products.filter((p) => {
      const qty = getQty(p.id);
      const th = getThreshold(p.id);
      return qty > 0 && qty <= th;
    }).length;
  }, [products, stocks]);

  const ruptureCount = useMemo(() => {
    if (!products?.length) return 0;
    return products.filter((p) => getQty(p.id) === 0).length;
  }, [products, stocks]);

  const openAdjust = (p: ProductRow) => {
    const row = getStockRow(p.id);
    setAdjustContext({
      productId: p.id,
      productName: p.name ?? p.id,
      stock: row
        ? { id: row.id, quantity: row.quantity ?? 0, alertThreshold: row.alertThreshold }
        : null,
    });
    setAdjustOpen(true);
  };

  const exportCsv = () => {
    if (!filteredProducts?.length) return;
    const header = ["id", "reference", "name", "category", "quantity", "alertThreshold", "sellingPrice", "purchasePrice"];
    const lines = [header.join(";")];
    for (const p of filteredProducts) {
      const pr = p as ProductRow;
      const row = getStockRow(p.id);
      lines.push(
        [
          p.id,
          `"${String(pr.reference ?? "").replace(/"/g, '""')}"`,
          `"${(pr.name ?? "").replace(/"/g, '""')}"`,
          `"${(pr.category ?? "").replace(/"/g, '""')}"`,
          row?.quantity ?? 0,
          row?.alertThreshold ?? globalLowStock,
          pr.sellingPrice ?? 0,
          pr.purchasePrice ?? 0,
        ].join(";")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventaire_${activeBoutiqueId ?? "export"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const productById = useMemo(() => {
    const m = new Map<string, string>();
    products?.forEach((p) => m.set(p.id, (p as ProductRow).name ?? p.id));
    return m;
  }, [products]);

  return (
    <AppLayout>
      <Tabs defaultValue="inventory" className="space-y-6">
        <div className="space-y-4">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold leading-tight text-primary sm:text-3xl">Stocks et produits</h1>
            <p className="text-pretty text-sm text-muted-foreground sm:text-base">
              Magasin&nbsp;: <span className="font-medium text-foreground">{boutiqueLabel}</span>
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:inline-flex sm:h-10 sm:w-auto">
              <TabsTrigger value="inventory" className="gap-1.5 px-3 py-2 sm:py-1.5">
                <Layers className="h-4 w-4 shrink-0" /> Inventaire
              </TabsTrigger>
              <TabsTrigger value="movements" className="gap-1.5 px-3 py-2 sm:py-1.5">
                <ClipboardList className="h-4 w-4 shrink-0" /> Mouvements
              </TabsTrigger>
            </TabsList>
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <Link href="/transfers">
                <ArrowLeftRight className="mr-2 h-4 w-4" /> Transferts
              </Link>
            </Button>
            {profile?.role === "Admin" && (
              <Button className="w-full bg-primary sm:w-auto" asChild>
                <Link href="/inventory/products/new">
                  <Plus className="mr-2 h-4 w-4" /> Nouveau produit
                </Link>
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="inventory" className="mt-0 space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Produits</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{products?.length || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Valeur achat</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-base font-bold tabular-nums sm:text-lg">
                  {inventoryValuePurchase.toLocaleString("fr-FR")} GNF
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Valeur vente</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-base font-bold tabular-nums text-primary sm:text-lg">
                  {inventoryValueSelling.toLocaleString("fr-FR")} GNF
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-orange-600">Alertes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-orange-600">{alertCount}</div>
              </CardContent>
            </Card>
            <Card className="col-span-2 lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-rose-600">Ruptures</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-rose-600">{ruptureCount}</div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm lg:flex-row lg:flex-wrap lg:items-end">
            <ListSearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Rechercher nom, catégorie ou réf…"
              resultHint={resultHint ? `${resultHint.replace("/", " / ")} produits` : undefined}
              className="min-w-0 lg:min-w-[200px] lg:flex-1"
            />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-10 w-full lg:w-[min(100%,11rem)]">
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes catégories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as typeof stockFilter)}>
              <SelectTrigger className="h-10 w-full lg:w-[min(100%,12.5rem)]">
                <SelectValue placeholder="Niveau" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les stocks</SelectItem>
                <SelectItem value="ok">Au-dessus du seuil</SelectItem>
                <SelectItem value="low">Stock bas (≤ seuil)</SelectItem>
                <SelectItem value="out">Rupture (0)</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 rounded-md border px-3 py-2 lg:shrink-0">
              <Switch id="inv-hide" checked={hideInactive} onCheckedChange={setHideInactive} />
              <Label htmlFor="inv-hide" className="cursor-pointer text-sm">
                Sans inactifs
              </Label>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 lg:ml-auto lg:w-auto">
              <TableColumnToggle
                columns={INVENTORY_TABLE_COLUMNS}
                visibility={visibility}
                onColumnVisibleChange={setColumnVisible}
              />
              <Button variant="outline" size="sm" type="button" onClick={exportCsv} disabled={!filteredProducts?.length}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Inventaire</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 space-y-4">
              <div className="space-y-3 md:hidden">
                {isLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !filteredProducts?.length ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {products?.length ? "Aucun résultat pour ces filtres." : "Aucun produit dans le catalogue."}
                  </p>
                ) : (
                  filteredProducts.map((raw) => {
                    const p = raw as ProductRow;
                    const qty = getQty(p.id);
                    const th = getThreshold(p.id);
                    const srow = getStockRow(p.id);
                    const qtyClass =
                      qty <= th && qty > 0 ? "text-orange-600" : qty === 0 ? "text-rose-600" : "";
                    const statusLabel = qty === 0 ? "Rupture" : qty <= th ? "Stock bas" : "Normal";
                    const statusClass =
                      qty === 0
                        ? "bg-rose-100 text-rose-700"
                        : qty <= th
                          ? "bg-orange-100 text-orange-700"
                          : "bg-emerald-100 text-emerald-700";
                    return (
                      <div key={p.id} className="rounded-lg border bg-card p-4 shadow-sm">
                        <div className="flex gap-3">
                          <div className="h-fit shrink-0 rounded bg-muted p-2">
                            <PackageOpen className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/inventory/products/${p.id}`}
                              className="block truncate font-semibold text-foreground hover:underline"
                            >
                              {p.name}
                            </Link>
                            <p className="truncate text-xs text-muted-foreground">
                              {(p.reference ?? "").trim()
                                ? `Réf. ${(p.reference ?? "").trim()}`
                                : p.id.substring(0, 8)}
                            </p>
                            {p.isActive === false ? (
                              <Badge variant="secondary" className="mt-1 text-[10px]">
                                Inactif
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Stock</p>
                            <p className={`font-semibold tabular-nums ${qtyClass}`}>
                              {qty}
                              {!srow ? (
                                <span className="ml-1 text-xs font-normal text-amber-600">(non init.)</span>
                              ) : null}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Prix vente</p>
                            <p className="font-mono text-sm tabular-nums">
                              {(p.sellingPrice ?? 0).toLocaleString()} GNF
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Badge className={statusClass}>{statusLabel}</Badge>
                          <div className="ml-auto flex shrink-0 gap-1">
                            <Button variant="outline" size="sm" className="h-8" onClick={() => openAdjust(p)}>
                              Stock
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 text-primary" asChild>
                              <Link href={`/inventory/products/${p.id}`}>
                                <Pencil className="mr-1 h-3.5 w-3.5" /> Détail
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="hidden min-w-0 md:block">
                <div className="overflow-x-auto">
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
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={colSpan} className="py-10 text-center">
                            <Loader2 className="inline h-6 w-6 animate-spin" />
                          </TableCell>
                        </TableRow>
                      ) : !filteredProducts?.length ? (
                        <TableRow>
                          <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                            {products?.length ? "Aucun résultat pour ces filtres." : "Aucun produit dans le catalogue."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredProducts.map((raw) => {
                          const p = raw as ProductRow;
                          const qty = getQty(p.id);
                          const th = getThreshold(p.id);
                          const srow = getStockRow(p.id);
                          return (
                            <TableRow key={p.id}>
                              {visibleColumns.map((col) =>
                                renderInventoryCells(col, p, qty, th, !!srow, () => openAdjust(p))
                              )}
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Mouvements récents</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0">
              {isMovementsLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !movements?.length ? (
                <p className="py-12 text-center text-sm text-muted-foreground">Aucun mouvement pour l’instant.</p>
              ) : (
                <>
                  <div className="space-y-2 md:hidden">
                    {movements.map((m) => {
                      const mov = m as {
                        id: string;
                        type?: string;
                        productId?: string;
                        quantityChange?: number;
                        currentQuantityAfter?: number;
                        timestamp?: { toDate?: () => Date };
                        note?: string;
                      };
                      const d = mov.timestamp?.toDate?.();
                      return (
                        <div key={mov.id} className="rounded-lg border bg-card p-3 text-sm shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                              {d ? d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "-"}
                            </p>
                            <Badge
                              variant="outline"
                              className={cn(
                                "max-w-[55%] shrink-0 text-[10px] font-medium leading-tight",
                                movementTypeBadgeClass(mov.type)
                              )}
                            >
                              {movementLabel(mov.type)}
                            </Badge>
                          </div>
                          <p className="mt-2 font-medium leading-snug text-foreground">
                            {productById.get(mov.productId ?? "") ?? mov.productId ?? "-"}
                          </p>
                          <div className="mt-2 flex items-baseline justify-between gap-2 border-t pt-2 text-xs tabular-nums">
                            <span>
                              <span className="mr-1 font-normal text-muted-foreground">Var.</span>
                              <span className="font-mono">
                                {mov.quantityChange != null
                                  ? `${mov.quantityChange > 0 ? "+" : ""}${mov.quantityChange}`
                                  : "-"}
                              </span>
                            </span>
                            <span>
                              <span className="mr-1 font-normal text-muted-foreground">Solde</span>
                              <span className="font-mono text-foreground">{mov.currentQuantityAfter ?? "-"}</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Produit</TableHead>
                          <TableHead className="text-right">Variation</TableHead>
                          <TableHead className="text-right">Solde après</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {movements.map((m) => {
                          const mov = m as {
                            id: string;
                            type?: string;
                            productId?: string;
                            quantityChange?: number;
                            currentQuantityAfter?: number;
                            timestamp?: { toDate?: () => Date };
                            note?: string;
                          };
                          const d = mov.timestamp?.toDate?.();
                          return (
                            <TableRow key={mov.id}>
                              <TableCell className="whitespace-nowrap text-xs">
                                {d ? d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "-"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px] font-medium", movementTypeBadgeClass(mov.type))}
                                >
                                  {movementLabel(mov.type)}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate text-sm">
                                {productById.get(mov.productId ?? "") ?? mov.productId ?? "-"}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm tabular-nums">
                                {mov.quantityChange != null
                                  ? `${mov.quantityChange > 0 ? "+" : ""}${mov.quantityChange}`
                                  : "-"}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm tabular-nums">
                                {mov.currentQuantityAfter ?? "-"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {adjustContext && (
        <StockAdjustDialog
          open={adjustOpen}
          onOpenChange={(o) => {
            setAdjustOpen(o);
            if (!o) setAdjustContext(null);
          }}
          boutiqueId={activeBoutiqueId ?? undefined}
          productId={adjustContext.productId}
          productName={adjustContext.productName}
          stock={adjustContext.stock}
          onSaved={() => {}}
        />
      )}
    </AppLayout>
  );
}
