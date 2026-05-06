"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  PackageOpen,
  Pencil,
  Copy,
  Loader2,
  ClipboardList,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductCatalogForm, type CatalogProductRow } from "@/components/inventory/product-catalog-form";
import { StockAdjustDialog } from "@/components/inventory/stock-adjust-dialog";
import { useCollection, useFirestore, useUser, useDoc, useMemoFirebase } from "@/firebase";
import { useBoutiqueScope } from "@/contexts/boutique-scope";
import { collection, doc, query, orderBy, limit, where } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { normalizeAppSettings } from "@/firebase/services/settings-service";

type ProductDoc = {
  name?: string;
  category?: string;
  reference?: string | null;
  purchasePrice?: number;
  sellingPrice?: number;
  isActive?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
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

export default function ProductDetailPage() {
  const params = useParams();
  const productId = typeof params.id === "string" ? params.id : "";
  const { toast } = useToast();
  const firestore = useFirestore();
  const { profile, isUserLoading } = useUser();
  const { activeBoutiqueId } = useBoutiqueScope();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const settingsDocRef = useMemoFirebase(
    () => (firestore ? doc(firestore, "settings", "global") : null),
    [firestore]
  );
  const { data: settingsRaw } = useDoc(settingsDocRef);
  const globalLowStock = useMemo(
    () => normalizeAppSettings(settingsRaw as Record<string, unknown> | undefined).lowStockThreshold,
    [settingsRaw]
  );

  const productRef = useMemoFirebase(
    () => (firestore && productId ? doc(firestore, "products", productId) : null),
    [firestore, productId]
  );
  const { data: productRaw, isLoading: loadingProduct } = useDoc(productRef);

  const productsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "products"), orderBy("name", "asc"));
  }, [firestore]);
  const { data: allProducts } = useCollection(productsQuery);

  const categories = useMemo(() => {
    if (!allProducts?.length) return [];
    const set = new Set<string>();
    allProducts.forEach((p) => {
      const c = (p as { category?: string }).category?.trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [allProducts]);

  const stocksQuery = useMemoFirebase(() => {
    if (!firestore || !activeBoutiqueId || !productId) return null;
    return query(
      collection(firestore, "boutiques", activeBoutiqueId, "stocks"),
      where("productId", "==", productId),
      limit(1)
    );
  }, [firestore, activeBoutiqueId, productId]);

  const { data: stockDocs, isLoading: loadingStock } = useCollection(stocksQuery);

  const stockRow = useMemo(() => {
    if (!stockDocs?.length) return null;
    return stockDocs[0] as StockRow;
  }, [stockDocs]);

  const movementsQuery = useMemoFirebase(() => {
    if (!firestore || !activeBoutiqueId) return null;
    return query(
      collection(firestore, "boutiques", activeBoutiqueId, "stockMovements"),
      orderBy("timestamp", "desc"),
      limit(200)
    );
  }, [firestore, activeBoutiqueId]);

  const { data: movementsRaw, isLoading: loadingMovements } = useCollection(movementsQuery);

  const productMovements = useMemo(() => {
    if (!movementsRaw?.length || !productId) return [];
    return movementsRaw
      .filter((m) => (m as { productId?: string }).productId === productId)
      .slice(0, 40);
  }, [movementsRaw, productId]);

  const product = productRaw as ProductDoc | undefined;
  const catalogRow: CatalogProductRow | null = useMemo(() => {
    if (!productId || !product) return null;
    return {
      id: productId,
      name: product.name,
      category: product.category,
      reference: product.reference,
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      isActive: product.isActive,
    };
  }, [productId, product]);

  const qty = stockRow?.quantity ?? 0;
  const threshold = stockRow?.alertThreshold ?? globalLowStock;
  const isAdmin = profile?.role === "Admin";

  const copyId = async () => {
    if (!productId || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(productId);
      toast({ title: "ID copié" });
    } catch {
      toast({ variant: "destructive", title: "Copie impossible" });
    }
  };

  if (!productId) {
    return (
      <AppLayout>
        <p className="text-muted-foreground">Produit invalide.</p>
      </AppLayout>
    );
  }

  if (!loadingProduct && !product) {
    return (
      <AppLayout>
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Produit introuvable</CardTitle>
            <CardDescription>Ce catalogue n’existe pas ou a été supprimé.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/inventory">
                <ArrowLeft className="mr-2 h-4 w-4" /> Inventaire
              </Link>
            </Button>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" className="shrink-0" asChild aria-label="Retour inventaire">
              <Link href="/inventory">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-primary sm:text-3xl">
                  {loadingProduct ? "…" : product?.name || "Produit"}
                </h1>
                {product?.isActive === false && <Badge variant="secondary">Inactif</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground truncate">
                {(product?.reference ?? "").trim() ? (
                  <>Réf. {(product?.reference ?? "").trim()}</>
                ) : (
                  <>ID <code className="text-xs">{productId.slice(0, 12)}…</code></>
                )}
              </p>
              <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={copyId}>
                <Copy className="mr-1 h-3 w-3" /> Copier l’ID Firestore
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageOpen className="h-4 w-4" /> Stock boutique
              </CardTitle>
              <CardDescription>Quantité pour la boutique active ({activeBoutiqueId?.slice(0, 8) ?? "-"}…).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingStock ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Quantité</span>
                    <span
                      className={`text-2xl font-bold tabular-nums ${
                        qty === 0 ? "text-rose-600" : qty <= threshold ? "text-orange-600" : "text-emerald-700"
                      }`}
                    >
                      {qty}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Seuil d’alerte</span>
                    <span className="font-medium">{threshold}</span>
                  </div>
                  <Button className="w-full" variant="outline" onClick={() => setAdjustOpen(true)}>
                    <Pencil className="mr-2 h-4 w-4" /> Ajuster le stock
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Fiche catalogue</CardTitle>
              <CardDescription>
                Prix, catégorie, référence et statut. Réservé aux administrateurs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!isUserLoading && !isAdmin ? (
                <p className="text-sm text-muted-foreground">Vous n’avez pas les droits pour modifier la fiche.</p>
              ) : loadingProduct || !catalogRow ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <ProductCatalogForm
                  key={formKey}
                  mode="edit"
                  productId={productId}
                  product={catalogRow}
                  boutiqueId={activeBoutiqueId ?? undefined}
                  existingCategories={categories}
                  onSuccess={() => setFormKey((k) => k + 1)}
                  cancelAction={
                    <Button type="button" variant="outline" asChild>
                      <Link href="/inventory">Retour liste</Link>
                    </Button>
                  }
                />
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4" /> Mouvements récents (ce produit)
            </CardTitle>
            <CardDescription>
              Historique lié à ce produit dans la boutique active. Jusqu’à 40 entrées.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {loadingMovements ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !productMovements.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucun mouvement enregistré pour cet article.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Variation</TableHead>
                    <TableHead className="text-right">Solde après</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productMovements.map((m) => {
                    const mov = m as {
                      id: string;
                      type?: string;
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
                          <Badge variant="outline" className="text-[10px]">
                            {movementLabel(mov.type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {mov.quantityChange != null
                            ? `${mov.quantityChange > 0 ? "+" : ""}${mov.quantityChange}`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {mov.currentQuantityAfter ?? "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {activeBoutiqueId && (
        <StockAdjustDialog
          open={adjustOpen}
          onOpenChange={(o) => setAdjustOpen(o)}
          boutiqueId={activeBoutiqueId}
          productId={productId}
          productName={product?.name ?? productId}
          stock={
            stockRow
              ? {
                  id: stockRow.id,
                  quantity: stockRow.quantity ?? 0,
                  alertThreshold: stockRow.alertThreshold,
                }
              : null
          }
          onSaved={() => setFormKey((k) => k + 1)}
        />
      )}
    </AppLayout>
  );
}
