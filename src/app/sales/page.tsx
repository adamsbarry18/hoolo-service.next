
"use client";

import React, { useState, useMemo, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  ShoppingCart,
  CreditCard,
  Banknote,
  Smartphone,
  AlertCircle,
  Loader2,
  FileText,
  MessageSquare,
  History,
  Receipt,
  Search,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useUser, useCollection, useDoc, useMemoFirebase } from "@/firebase";
import { useBoutiqueScope } from "@/contexts/boutique-scope";
import {
  collection,
  query,
  doc,
  runTransaction,
  serverTimestamp,
  getDocs,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { generatePDF, shareOnWhatsApp, PDFData } from "@/lib/pdf-service";
import { notifyStockLowCrossing } from "@/firebase/services/notification-service";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ListSearchBar } from "@/components/table/list-search-bar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { rowMatchesSearch } from "@/lib/list-search";
import { productListLabel } from "@/lib/product-display";
import type { DocumentReference } from "firebase/firestore";

/** Libellé affiché si aucune boutique n’est sélectionnée dans l’en-tête. */
const DEFAULT_BOUTIQUE_LABEL = "Hoolo Service";

/** Modes de règlement (CDC / blueprint : espèces, mobile money, crédit). */
type SalePaymentMode = "cash" | "mobile_money" | "credit";

type CartLine = {
  id: number;
  productId: string;
  price: number;
  qty: number;
};

type FirestoreLineItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type SaleRecord = {
  id: string;
  clientId?: string;
  boutiqueId?: string;
  saleDate?: { toDate?: () => Date };
  totalAmount?: number;
  amountPaid?: number;
  remainingAmount?: number;
  paymentType?: string;
  status?: string;
  lineItems?: FirestoreLineItem[];
  notes?: string;
  userId?: string;
};

function paymentModeLabel(mode: SalePaymentMode): string {
  switch (mode) {
    case "cash":
      return "Espèces";
    case "mobile_money":
      return "Mobile financier";
    case "credit":
      return "Crédit";
    default:
      return mode;
  }
}

function saleBadgeVariant(
  paymentType?: string
): "default" | "secondary" | "outline" | "destructive" {
  if (paymentType === "credit") return "outline";
  if (paymentType === "mobile_money") return "secondary";
  return "default";
}

export default function SalesPage() {
  const [items, setItems] = useState<CartLine[]>([]);
  const [saleType, setSaleType] = useState<SalePaymentMode>("cash");
  const [selectedClientId, setSelectedClientId] = useState<string>("walkin");
  const [saleNotes, setSaleNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [detailSale, setDetailSale] = useState<SaleRecord | null>(null);

  const firestore = useFirestore();
  const { user } = useUser();
  const { activeBoutiqueId } = useBoutiqueScope();
  const { toast } = useToast();

  const productsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "products"), orderBy("name", "asc"));
  }, [firestore]);

  const clientsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "clients"));
  }, [firestore]);

  const stocksQuery = useMemoFirebase(() => {
    if (!firestore || !activeBoutiqueId) return null;
    return query(collection(firestore, "boutiques", activeBoutiqueId, "stocks"));
  }, [firestore, activeBoutiqueId]);

  const salesHistoryQuery = useMemoFirebase(() => {
    if (!firestore || !activeBoutiqueId) return null;
    return query(
      collection(firestore, "boutiques", activeBoutiqueId, "sales"),
      orderBy("saleDate", "desc"),
      limit(100)
    );
  }, [firestore, activeBoutiqueId]);

  const boutiqueDocRef = useMemoFirebase(() => {
    if (!firestore || !activeBoutiqueId) return null;
    return doc(firestore, "boutiques", activeBoutiqueId);
  }, [firestore, activeBoutiqueId]);

  const { data: boutiqueProfile } = useDoc<{ name?: string }>(boutiqueDocRef);

  const boutiqueLabel = useMemo(() => {
    if (!activeBoutiqueId) return DEFAULT_BOUTIQUE_LABEL;
    const n = boutiqueProfile?.name?.trim();
    return n || activeBoutiqueId;
  }, [activeBoutiqueId, boutiqueProfile?.name]);

  const { data: products, isLoading: loadingProducts } = useCollection(productsQuery);
  const { data: clients } = useCollection(clientsQuery);
  const { data: stocks, isLoading: loadingStocks } = useCollection(stocksQuery);
  const { data: recentSales, isLoading: loadingHistory } = useCollection(salesHistoryQuery);

  useEffect(() => {
    if (!clients?.length) return;
    if (typeof window === "undefined") return;
    const cid = new URLSearchParams(window.location.search).get("client");
    if (cid && clients.some((c) => c.id === cid)) {
      setSelectedClientId(cid);
    }
  }, [clients]);

  const debouncedProductSearch = useDebouncedValue(productSearch, 200);
  const debouncedHistorySearch = useDebouncedValue(historySearch, 280);

  const selectedClient = clients?.find((c) => c.id === selectedClientId);

  const stockByProductId = useMemo(() => {
    const m = new Map<string, number>();
    stocks?.forEach((s: { productId?: string; quantity?: number }) => {
      if (s.productId != null) m.set(s.productId, s.quantity ?? 0);
    });
    return m;
  }, [stocks]);

  const getStockQty = (productId: string) => stockByProductId.get(productId) ?? 0;

  const filteredProducts = useMemo(() => {
    if (!products?.length) return null;
    return products.filter((p) =>
      rowMatchesSearch(debouncedProductSearch, [
        p.name,
        p.category,
        (p as { reference?: string }).reference,
        p.id,
      ])
    );
  }, [products, debouncedProductSearch]);

  const filteredHistory = useMemo(() => {
    if (!recentSales?.length) return null;
    return recentSales.filter((s) =>
      rowMatchesSearch(debouncedHistorySearch, [
        s.id,
        (s as SaleRecord).clientId,
        String((s as SaleRecord).totalAmount ?? ""),
        (s as SaleRecord).paymentType,
        (s as SaleRecord).status,
        (s as SaleRecord).saleDate?.toDate?.()?.toLocaleString("fr-FR"),
        ...(s as SaleRecord).lineItems?.flatMap((li) => [li.productName, li.productId]) ?? [],
      ])
    );
  }, [recentSales, debouncedHistorySearch]);

  const historyHint =
    recentSales?.length != null && filteredHistory
      ? `${filteredHistory.length} / ${recentSales.length}`
      : undefined;

  const addItem = () => {
    setItems([...items, { id: Date.now(), productId: "", price: 0, qty: 1 }]);
  };

  const removeItem = (id: number) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const updateItem = (idx: number, field: keyof CartLine, value: string | number) => {
    const newItems = [...items];
    const row = { ...newItems[idx]! };
    if (field === "productId") {
      row.productId = value as string;
      const prod = products?.find((p) => p.id === value);
      if (prod) row.price = (prod as { sellingPrice?: number }).sellingPrice ?? 0;
    } else if (field === "price") {
      row.price = Number(value) || 0;
    } else if (field === "qty") {
      row.qty = Math.max(0, Math.floor(Number(value) || 0));
    } else if (field === "id") {
      row.id = value as number;
    }
    newItems[idx] = row;
    setItems(newItems);
  };

  const lineItemsPayload = useMemo((): FirestoreLineItem[] => {
    return items.map((item) => {
      const prod = products?.find((p) => p.id === item.productId);
      const qty = Math.max(1, item.qty || 0);
      const price = Math.max(0, item.price || 0);
      return {
        productId: item.productId,
        productName: (prod as { name?: string } | undefined)?.name ?? "Article",
        quantity: qty,
        unitPrice: price,
        lineTotal: qty * price,
      };
    });
  }, [items, products]);

  const total = useMemo(
    () => lineItemsPayload.reduce((acc, li) => acc + li.lineTotal, 0),
    [lineItemsPayload]
  );

  const creditLimit = (selectedClient as { creditLimit?: number } | undefined)?.creditLimit ?? 0;
  const currentDebt = (selectedClient as { currentDebt?: number } | undefined)?.currentDebt ?? 0;
  const isOverLimit =
    saleType === "credit" &&
    selectedClient &&
    currentDebt + total > creditLimit &&
    selectedClientId !== "walkin";

  const boutiqueId = activeBoutiqueId;

  const linesInvalid = useMemo(() => {
    if (items.length === 0) return true;
    return items.some((it) => !it.productId || it.qty < 1);
  }, [items]);

  const stockWarnings = useMemo(() => {
    if (!boutiqueId) return [];
    return items.filter((it) => it.productId && getStockQty(it.productId) < it.qty);
  }, [items, boutiqueId, stockByProductId]);

  const handleFinishSale = async () => {
    if (items.length === 0) {
      toast({ variant: "destructive", title: "Panier vide", description: "Veuillez ajouter des articles." });
      return;
    }
    if (linesInvalid) {
      toast({
        variant: "destructive",
        title: "Panier incomplet",
        description: "Chaque ligne doit avoir un produit et une quantité d’au moins 1.",
      });
      return;
    }

    if (saleType === "credit" && selectedClientId === "walkin") {
      toast({
        variant: "destructive",
        title: "Client requis",
        description: "Sélectionnez un client enregistré pour une vente à crédit.",
      });
      return;
    }

    if (isOverLimit) {
      toast({
        variant: "destructive",
        title: "Limite dépassée",
        description: "Le plafond de crédit du client ne permet pas cette vente.",
      });
      return;
    }

    if (!boutiqueId) {
      toast({
        variant: "destructive",
        title: "Boutique",
        description: "Choisissez un magasin dans le menu en haut de l’écran.",
      });
      return;
    }

    setIsProcessing(true);
    try {
      type StockPrep = {
        ref: DocumentReference;
        productId: string;
        qty: number;
        previousQty: number;
        threshold: number;
      };

      const stockRefs: StockPrep[] = [];
      for (const item of items) {
        const stockQ = query(
          collection(firestore, "boutiques", boutiqueId, "stocks"),
          where("productId", "==", item.productId)
        );
        const stockSnap = await getDocs(stockQ);
        if (stockSnap.empty) {
          throw new Error(
            `Stock introuvable pour « ${products?.find((p) => p.id === item.productId)?.name ?? item.productId} » dans cette boutique.`
          );
        }
        const stockDoc = stockSnap.docs[0]!;
        const currentQty = stockDoc.data().quantity ?? 0;
        if (currentQty < item.qty) {
          throw new Error(
            `Stock insuffisant pour « ${products?.find((p) => p.id === item.productId)?.name ?? item.productId} » (disponible : ${currentQty}).`
          );
        }
        const threshold = Math.max(0, Math.floor(Number(stockDoc.data().alertThreshold) || 5));
        stockRefs.push({
          ref: stockDoc.ref,
          productId: item.productId,
          qty: item.qty,
          previousQty: currentQty,
          threshold,
        });
      }

      let saleId = "";
      const lineItemsToSave = lineItemsPayload;
      const notesTrim = saleNotes.trim();

      await runTransaction(firestore, async (transaction) => {
        const saleRef = doc(collection(firestore, "boutiques", boutiqueId, "sales"));
        saleId = saleRef.id;

        for (const snap of stockRefs) {
          const fresh = await transaction.get(snap.ref);
          const q0 = fresh.data()?.quantity ?? 0;
          if (q0 < snap.qty) {
            throw new Error("Stock insuffisant (concurrence). Réessayez.");
          }
          const nextQ = q0 - snap.qty;
          transaction.update(snap.ref, {
            quantity: nextQ,
            updatedAt: serverTimestamp(),
          });
          const movementRef = doc(collection(firestore, "boutiques", boutiqueId, "stockMovements"));
          transaction.set(movementRef, {
            stockId: fresh.id,
            productId: snap.productId,
            type: "vente",
            quantityChange: -snap.qty,
            currentQuantityAfter: nextQ,
            sourceDocumentId: saleId,
            userId: user?.uid,
            timestamp: serverTimestamp(),
          });
        }

        const isCredit = saleType === "credit";
        transaction.set(saleRef, {
          clientId: selectedClientId,
          boutiqueId,
          saleDate: serverTimestamp(),
          totalAmount: total,
          lineItems: lineItemsToSave,
          amountPaid: isCredit ? 0 : total,
          remainingAmount: isCredit ? total : 0,
          paymentType: saleType,
          status: isCredit ? "partially_paid" : "completed",
          notes: notesTrim,
          userId: user?.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (isCredit && selectedClientId !== "walkin") {
          const clientRef = doc(firestore, "clients", selectedClientId);
          const clientSnap = await transaction.get(clientRef);
          const debt = clientSnap.data()?.currentDebt || 0;
          transaction.update(clientRef, {
            currentDebt: debt + total,
            updatedAt: serverTimestamp(),
          });
        }
      });

      stockRefs.forEach((s) =>
        notifyStockLowCrossing(
          boutiqueId,
          s.productId,
          s.previousQty,
          s.previousQty - s.qty,
          s.threshold
        )
      );

      setLastSaleId(saleId);
      setIsSuccessOpen(true);
      toast({
        title: "Vente enregistrée",
        description: "Stock et créance client mis à jour.",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      toast({ variant: "destructive", title: "Erreur", description: message });
    } finally {
      setIsProcessing(false);
    }
  };

  const pdfDataFromCart = (): PDFData => ({
    title: saleType === "credit" ? "Vente à crédit" : "Facture",
    id: (lastSaleId ?? "").substring(0, 8).toUpperCase(),
    date: new Date().toLocaleDateString("fr-FR"),
    clientName:
      selectedClientId === "walkin"
        ? "Client de passage"
        : (selectedClient as { name?: string } | undefined)?.name ?? "Client",
    clientPhone: (selectedClient as { phoneNumber?: string } | undefined)?.phoneNumber,
    boutiqueName: boutiqueLabel,
    items: lineItemsPayload.map((li) => ({
      description: li.productName,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      total: li.lineTotal,
    })),
    totalAmount: total,
    paymentType: paymentModeLabel(saleType),
    notes: saleNotes.trim() || undefined,
  });

  const handlePrint = () => {
    if (!lastSaleId) return;
    generatePDF(pdfDataFromCart());
  };

  const handleShare = () => {
    if (!lastSaleId) return;
    const phone = (selectedClient as { phoneNumber?: string } | undefined)?.phoneNumber;
    if (!phone || selectedClientId === "walkin") {
      toast({
        variant: "destructive",
        title: "Téléphone absent",
        description: "Renseignez un client avec numéro pour envoyer par WhatsApp.",
      });
      return;
    }
    shareOnWhatsApp(pdfDataFromCart());
  };

  const resetSale = () => {
    setItems([]);
    setLastSaleId(null);
    setIsSuccessOpen(false);
    setSaleNotes("");
  };

  const resolveClientLabel = (sale: SaleRecord) => {
    const cid = sale.clientId;
    if (!cid || cid === "walkin") return "Client de passage";
    return clients?.find((c) => c.id === cid)?.name ?? cid;
  };

  const pdfDataFromSaleRecord = (sale: SaleRecord): PDFData => {
    const itemsForPdf =
      sale.lineItems?.map((li) => ({
        description: li.productName,
        quantity: Number(li.quantity) || 0,
        unitPrice: Number(li.unitPrice) || 0,
        total: Number(li.lineTotal) || 0,
      })) ?? [];
    const mode: SalePaymentMode =
      sale.paymentType === "credit"
        ? "credit"
        : sale.paymentType === "mobile_money"
          ? "mobile_money"
          : "cash";
    const notesTrim = typeof sale.notes === "string" ? sale.notes.trim() : "";
    return {
      title: mode === "credit" ? "Vente à crédit" : "Facture",
      id: sale.id.substring(0, 8).toUpperCase(),
      date:
        sale.saleDate?.toDate?.()?.toLocaleDateString("fr-FR") ?? new Date().toLocaleDateString("fr-FR"),
      clientName: resolveClientLabel(sale),
      clientPhone:
        sale.clientId && sale.clientId !== "walkin"
          ? clients?.find((c) => c.id === sale.clientId)?.phoneNumber?.trim() || undefined
          : undefined,
      boutiqueName: boutiqueLabel,
      items:
        itemsForPdf.length > 0
          ? itemsForPdf
          : [
              {
                description: "Détail non historisé",
                quantity: 1,
                unitPrice: Number(sale.totalAmount) || 0,
                total: Number(sale.totalAmount) || 0,
              },
            ],
      totalAmount: Number(sale.totalAmount) || 0,
      paymentType: paymentModeLabel(mode),
      notes: notesTrim || undefined,
    };
  };

  const printSaleDetail = (sale: SaleRecord) => {
    try {
      generatePDF(pdfDataFromSaleRecord(sale));
      toast({ title: "Facture PDF", description: "Le fichier a été téléchargé." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast({ variant: "destructive", title: "Erreur PDF", description: msg });
    }
  };

  const shareSaleDetailFromHistory = (sale: SaleRecord) => {
    const phone =
      sale.clientId && sale.clientId !== "walkin"
        ? clients?.find((c) => c.id === sale.clientId)?.phoneNumber?.trim()
        : undefined;
    if (!phone) {
      toast({
        variant: "destructive",
        title: "Téléphone absent",
        description: "Renseignez un client avec numéro pour envoyer par WhatsApp.",
      });
      return;
    }
    shareOnWhatsApp({ ...pdfDataFromSaleRecord(sale), clientPhone: phone });
  };

  const productSelectList = filteredProducts ?? products;

  return (
    <AppLayout>
      <Tabs defaultValue="new" className="space-y-6">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 max-w-full space-y-1">
            <h1 className="text-2xl font-bold leading-tight text-primary sm:text-3xl">Ventes</h1>
            <p className="text-pretty text-sm text-muted-foreground">
              Caisses · Magasin&nbsp;: <span className="font-medium text-foreground">{boutiqueLabel}</span>
            </p>
          </div>
          <TabsList className="w-full shrink-0 sm:w-auto sm:self-center">
            <TabsTrigger value="new" className="gap-1.5">
              <ShoppingCart className="h-4 w-4" /> Nouvelle vente
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-4 w-4" /> Historique
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="new" className="mt-0 space-y-6">
          <div className="grid min-w-0 gap-6 lg:grid-cols-12">
            <div className="min-w-0 space-y-6 lg:col-span-8">
              <Card className="min-w-0 overflow-hidden">
                <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between sm:pb-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <CardTitle className="text-lg sm:text-xl">Articles</CardTitle>
                    {(loadingProducts || loadingStocks) && (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <Button
                    onClick={addItem}
                    size="sm"
                    className="h-9 w-full shrink-0 sm:w-auto"
                  >
                    <Plus className="mr-2 h-4 w-4 shrink-0" />
                    Ajouter une ligne
                  </Button>
                </CardHeader>
                <CardContent className="min-w-0 space-y-3 sm:p-6 sm:pt-0">
                  <div className="flex items-center gap-2 border-b pb-3">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher un produit…"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  {stockWarnings.length > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Quantités au-delà du stock disponible. Réduisez les quantités ou retirez une ligne.
                      </span>
                    </div>
                  )}

                  <div className="space-y-3 p-0 md:hidden">
                    {items.map((item, idx) => {
                      const avail = item.productId ? getStockQty(item.productId) : null;
                      const over = item.productId && avail != null && item.qty > avail;
                      return (
                        <div key={item.id} className="space-y-3 rounded-lg border bg-muted/30 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">Ligne {idx + 1}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeItem(item.id)}
                              className="h-8 w-8 shrink-0 text-rose-500"
                              aria-label="Retirer"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Produit</Label>
                            <Select
                              value={item.productId || undefined}
                              onValueChange={(val) => updateItem(idx, "productId", val)}
                            >
                              <SelectTrigger className="h-9 w-full">
                                <SelectValue placeholder="Choisir…" />
                              </SelectTrigger>
                              <SelectContent className="max-h-[280px]">
                                {productSelectList?.map((p) => {
                                  const q = getStockQty(p.id);
                                  const label = productListLabel(p as { name?: string; reference?: string | null });
                                  return (
                                    <SelectItem key={p.id} value={p.id}>
                                      <span className="truncate">{label}</span>
                                      <span className="ml-2 text-xs text-muted-foreground">({q} dispo)</span>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Prix unit. (GNF)</Label>
                              <Input
                                type="number"
                                min={0}
                                value={item.price || ""}
                                onChange={(e) => updateItem(idx, "price", Number(e.target.value))}
                                className="h-9 px-2 font-mono text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Qté</Label>
                              <Input
                                type="number"
                                min={1}
                                value={item.qty || ""}
                                onChange={(e) => updateItem(idx, "qty", Number(e.target.value))}
                                className="h-9 px-2"
                              />
                            </div>
                          </div>
                          {over && (
                            <p className="text-xs font-medium text-rose-600">
                              Stock insuffisant ({avail} disponible).
                            </p>
                          )}
                          <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                            <span>Sous-total</span>
                            <span className="font-mono">{(item.price * item.qty).toLocaleString()} GNF</span>
                          </div>
                        </div>
                      );
                    })}
                    {items.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">Aucun article pour l’instant.</p>
                    )}
                  </div>

                  <div className="hidden md:block md:overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[200px]">Produit</TableHead>
                          <TableHead className="whitespace-nowrap">Prix unit.</TableHead>
                          <TableHead className="w-[80px]">Qté</TableHead>
                          <TableHead className="whitespace-nowrap">Stock</TableHead>
                          <TableHead className="whitespace-nowrap">Total</TableHead>
                          <TableHead className="w-[48px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, idx) => {
                          const avail = item.productId ? getStockQty(item.productId) : null;
                          const over = item.productId && avail != null && item.qty > avail;
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="py-2">
                                <Select
                                  value={item.productId || undefined}
                                  onValueChange={(val) => updateItem(idx, "productId", val)}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Produit" />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-[280px]">
                                    {productSelectList?.map((p) => {
                                      const q = getStockQty(p.id);
                                      const label = productListLabel(p as { name?: string; reference?: string | null });
                                      return (
                                        <SelectItem key={p.id} value={p.id}>
                                          {label} <span className="text-muted-foreground">({q})</span>
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  value={item.price || ""}
                                  onChange={(e) => updateItem(idx, "price", Number(e.target.value))}
                                  className="h-9 px-2 font-mono"
                                />
                              </TableCell>
                              <TableCell className="py-2">
                                <Input
                                  type="number"
                                  min={1}
                                  value={item.qty || ""}
                                  onChange={(e) => updateItem(idx, "qty", Number(e.target.value))}
                                  className="h-9 px-2"
                                />
                              </TableCell>
                              <TableCell className={`py-2 text-sm ${over ? "font-bold text-rose-600" : ""}`}>
                                {item.productId ? (avail ?? "-") : "-"}
                              </TableCell>
                              <TableCell className="py-2 font-mono text-sm font-bold whitespace-nowrap">
                                {(item.price * item.qty).toLocaleString()}
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeItem(item.id)}
                                  className="h-8 w-8 text-rose-500"
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {items.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                              Aucun article pour l’instant.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="space-y-2 pt-2">
                    <Label htmlFor="sale-notes" className="text-muted-foreground">
                      Note interne <span className="font-normal">(optionnel)</span>
                    </Label>
                    <Textarea
                      id="sale-notes"
                      placeholder="Ex. référence ticket, remarque caisse…"
                      value={saleNotes}
                      onChange={(e) => setSaleNotes(e.target.value)}
                      rows={2}
                      className="resize-none text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="min-w-0 space-y-6 lg:col-span-4">
              <Card className="min-w-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Paiement</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 space-y-4">
                  <div className="min-w-0 space-y-2">
                    <Label className="text-muted-foreground">Mode</Label>
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        variant={saleType === "cash" ? "default" : "outline"}
                        className="h-auto min-h-11 w-full justify-start whitespace-normal px-3 py-2.5 text-left"
                        onClick={() => setSaleType("cash")}
                      >
                        <Banknote className="mr-2 h-4 w-4 shrink-0" />
                        Espèces
                      </Button>
                      <Button
                        type="button"
                        variant={saleType === "mobile_money" ? "default" : "outline"}
                        className="h-auto min-h-11 w-full justify-start whitespace-normal px-3 py-2.5 text-left"
                        onClick={() => setSaleType("mobile_money")}
                      >
                        <Smartphone className="mr-2 h-4 w-4 shrink-0" />
                        Mobile money
                      </Button>
                      <Button
                        type="button"
                        variant={saleType === "credit" ? "default" : "outline"}
                        className="h-auto min-h-11 w-full justify-start whitespace-normal px-3 py-2.5 text-left"
                        onClick={() => setSaleType("credit")}
                      >
                        <CreditCard className="mr-2 h-4 w-4 shrink-0" />
                        Crédit
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Client</Label>
                    <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Client" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[240px]">
                        <SelectItem value="walkin">Client de passage</SelectItem>
                        {clients?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {saleType === "credit" && selectedClient && selectedClientId !== "walkin" && (
                    <div
                      className={`space-y-1.5 rounded-lg border p-3 text-xs ${
                        isOverLimit ? "border-rose-200 bg-rose-50" : "border-blue-200 bg-blue-50"
                      }`}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Crédit utilisé</span>
                        <span className="text-right font-semibold">
                          {currentDebt.toLocaleString()} / {creditLimit.toLocaleString()} GNF
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="font-bold">Après vente</span>
                        <span className={`text-right font-bold ${isOverLimit ? "text-rose-600" : ""}`}>
                          {(currentDebt + total).toLocaleString()} GNF
                        </span>
                      </div>
                      {isOverLimit && (
                        <div className="mt-2 flex items-center gap-1.5 font-bold leading-tight text-rose-600">
                          <AlertCircle size={14} className="shrink-0" /> Plafond dépassé
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2 border-t pt-4">
                    <div className="flex items-center justify-between gap-2 text-lg font-bold">
                      <span>Total</span>
                      <span className="truncate text-primary tabular-nums">{total.toLocaleString()} GNF</span>
                    </div>
                  </div>

                  <Button
                    className="h-12 w-full text-base font-semibold"
                    onClick={handleFinishSale}
                    disabled={
                      isProcessing || isOverLimit || items.length === 0 || linesInvalid || stockWarnings.length > 0
                    }
                  >
                    {isProcessing ? (
                      <Loader2 className="mr-2 animate-spin" />
                    ) : (
                      <ShoppingCart className="mr-2 h-5 w-5" />
                    )}
                    Valider
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Stock et encours client mis à jour selon le mode choisi.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          <Card>
            <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Receipt className="h-5 w-5 shrink-0" /> Historique
                </CardTitle>
                <CardDescription>Jusqu’à 100 ventes pour ce magasin.</CardDescription>
              </div>
              <ListSearchBar
                value={historySearch}
                onChange={setHistorySearch}
                placeholder="Client, montant, réf…"
                className="w-full sm:max-w-xs"
                resultHint={historyHint}
              />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {loadingHistory ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !filteredHistory?.length ? (
                <p className="py-12 text-center text-sm text-muted-foreground">Aucune vente à afficher.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead>Règlement</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((raw) => {
                      const sale = raw as SaleRecord;
                      const d = sale.saleDate?.toDate?.();
                      return (
                        <TableRow key={sale.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {d ? d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "-"}
                          </TableCell>
                          <TableCell className="max-w-[140px] truncate text-sm">
                            {resolveClientLabel(sale)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {(sale.totalAmount ?? 0).toLocaleString()} GNF
                          </TableCell>
                          <TableCell>
                            <Badge variant={saleBadgeVariant(sale.paymentType)} className="text-[10px] uppercase">
                              {sale.paymentType === "mobile_money"
                                ? "Mobile"
                                : sale.paymentType === "credit"
                                  ? "Crédit"
                                  : "Espèces"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {sale.status ?? "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                              onClick={() => setDetailSale(sale)}
                            >
                              <Eye className="h-4 w-4" /> Détail
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isSuccessOpen} onOpenChange={setIsSuccessOpen}>
        <DialogContent className="max-w-sm sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vente enregistrée</DialogTitle>
            <DialogDescription>Vous pouvez partager ou imprimer le ticket.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-4">
            <Button className="w-full" onClick={handlePrint}>
              <FileText className="mr-2 h-4 w-4" /> Facture PDF
            </Button>
            <Button
              variant="outline"
              className="w-full border-emerald-200 text-emerald-600 hover:bg-emerald-50"
              onClick={handleShare}
            >
              <MessageSquare className="mr-2 h-4 w-4" /> WhatsApp
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="w-full" onClick={resetSale}>
              Nouvelle vente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailSale} onOpenChange={(o) => !o && setDetailSale(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vente #{detailSale?.id.substring(0, 8)}</DialogTitle>
            <DialogDescription>
              {detailSale?.saleDate?.toDate?.()?.toLocaleString("fr-FR")} ·{" "}
              {detailSale ? resolveClientLabel(detailSale) : ""}
            </DialogDescription>
          </DialogHeader>
          {detailSale?.lineItems?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Article</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailSale.lineItems.map((li, i) => (
                  <TableRow key={`${li.productId}-${i}`}>
                    <TableCell className="text-sm">{li.productName}</TableCell>
                    <TableCell className="text-right">{li.quantity}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {li.lineTotal.toLocaleString()} GNF
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              Cette vente ne contient pas de lignes détaillées (enregistrement ancien).
            </p>
          )}
          {detailSale?.notes && (
            <p className="rounded-md border bg-muted/40 p-2 text-sm">
              <span className="font-medium">Notes : </span>
              {detailSale.notes}
            </p>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              className="w-full bg-primary sm:w-auto"
              type="button"
              onClick={() => detailSale && printSaleDetail(detailSale)}
            >
              <FileText className="mr-2 h-4 w-4" /> Facture PDF
            </Button>
            {detailSale?.clientId && detailSale.clientId !== "walkin" ? (
              <Button
                type="button"
                variant="outline"
                className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 sm:w-auto"
                onClick={() => detailSale && shareSaleDetailFromHistory(detailSale)}
              >
                <MessageSquare className="mr-2 h-4 w-4" /> WhatsApp
              </Button>
            ) : null}
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setDetailSale(null)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
