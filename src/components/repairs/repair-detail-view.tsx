"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query } from "firebase/firestore";
import {
  addPartToRepair,
  updateRepairLaborAndNotes,
  type RepairStatus,
} from "@/firebase/services/repair-service";
import { Loader2, Package, Save } from "lucide-react";
import Link from "next/link";
import { productListLabel } from "@/lib/product-display";
import { toUserFacingErrorMessage } from "@/lib/user-facing-error";
import { REPAIR_STATUS_LABELS } from "@/components/repairs/repair-status-labels";

export type RepairDetailRow = {
  id: string;
  customerName?: string;
  phoneNumber?: string;
  deviceBrand?: string;
  deviceModel?: string;
  deviceType?: string;
  serialNumber?: string;
  status: string;
  issueDescription?: string;
  internalNotes?: string | null;
  laborCost?: number;
  partsCost?: number;
  totalCost?: number;
  updatedAt?: { toDate?: () => Date };
};

type ProductLite = {
  id: string;
  name?: string;
  reference?: string | null;
  purchasePrice?: number;
  sellingPrice?: number;
};

type StatusEntry = { label: string; color: string };

type Props = {
  repair: RepairDetailRow;
  boutiqueId: string;
  products: ProductLite[] | null | undefined;
  stocks: { id: string; productId?: string; quantity?: number }[] | null | undefined;
  statusMap?: Record<RepairStatus, StatusEntry>;
  onStatusChange: (id: string, status: RepairStatus) => Promise<void>;
};

export function RepairDetailView({
  repair,
  boutiqueId,
  products,
  stocks,
  statusMap = REPAIR_STATUS_LABELS,
  onStatusChange,
}: Props) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [labor, setLabor] = useState(0);
  const [internalNotes, setInternalNotes] = useState("");
  const [issueText, setIssueText] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const [partProductId, setPartProductId] = useState("");
  const [partQty, setPartQty] = useState(1);
  const [partUnit, setPartUnit] = useState(0);
  const [addingPart, setAddingPart] = useState(false);

  useEffect(() => {
    setLabor(Number(repair.laborCost) || 0);
    setInternalNotes(repair.internalNotes ?? "");
    setIssueText(repair.issueDescription ?? "");
  }, [repair]);

  useEffect(() => {
    const p = products?.find((x) => x.id === partProductId);
    if (!p) {
      setPartUnit(0);
      return;
    }
    const def = Number(p.purchasePrice) || Number(p.sellingPrice) || 0;
    setPartUnit(def);
  }, [partProductId, products]);

  const partsQuery = useMemoFirebase(() => {
    if (!firestore || !boutiqueId || !repair?.id) return null;
    return query(collection(firestore, "boutiques", boutiqueId, "repairs", repair.id, "repairParts"));
  }, [firestore, boutiqueId, repair?.id]);

  const { data: repairParts, isLoading: loadingParts } = useCollection(partsQuery);

  const sortedParts = useMemo(() => {
    if (!repairParts?.length) return [];
    return [...repairParts].sort((a, b) => {
      const ta = (a as { createdAt?: { toDate?: () => Date } }).createdAt?.toDate?.()?.getTime() ?? 0;
      const tb = (b as { createdAt?: { toDate?: () => Date } }).createdAt?.toDate?.()?.getTime() ?? 0;
      return tb - ta;
    });
  }, [repairParts]);

  const stockByProduct = useMemo(() => {
    const m = new Map<string, number>();
    stocks?.forEach((s) => {
      if (s.productId) m.set(s.productId, s.quantity ?? 0);
    });
    return m;
  }, [stocks]);

  const productName = (id: string) => {
    const pr = products?.find((p) => p.id === id);
    if (pr) return productListLabel(pr);
    return id;
  };

  const productsWithStock = useMemo(() => {
    if (!products?.length) return [];
    return products.filter((p) => (stockByProduct.get(p.id) ?? 0) > 0);
  }, [products, stockByProduct]);

  const maxForSelected = partProductId ? stockByProduct.get(partProductId) ?? 0 : 0;

  const saveInfos = async () => {
    setSavingInfo(true);
    try {
      await updateRepairLaborAndNotes(firestore, boutiqueId, repair.id, {
        laborCost: labor,
        internalNotes,
        issueDescription: issueText,
      });
      toast({ title: "Fiche mise à jour" });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: toUserFacingErrorMessage(e),
      });
    } finally {
      setSavingInfo(false);
    }
  };

  const submitPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partProductId) {
      toast({ variant: "destructive", title: "Choisissez une pièce" });
      return;
    }
    if (partQty < 1 || partQty > maxForSelected) {
      toast({ variant: "destructive", title: "Quantité invalide" });
      return;
    }
    setAddingPart(true);
    try {
      await addPartToRepair(firestore, boutiqueId, repair.id, {
        productId: partProductId,
        quantity: Math.floor(partQty),
        unitCost: partUnit,
      });
      toast({ title: "Pièce ajoutée", description: "Stock et coût fiche mis à jour." });
      setPartProductId("");
      setPartQty(1);
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: toUserFacingErrorMessage(err),
      });
    } finally {
      setAddingPart(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="font-mono text-xl font-bold sm:text-2xl">Fiche {repair.id.substring(0, 8)}</h1>
          <p className="text-sm text-muted-foreground">
            {repair.customerName} · {repair.deviceBrand} {repair.deviceModel}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-muted-foreground">Statut</Label>
            <Select
              value={repair.status}
              onValueChange={async (val) => {
                try {
                  await onStatusChange(repair.id, val as RepairStatus);
                } catch {
                  /* toast géré par le parent */
                }
              }}
            >
              <SelectTrigger
                className={`h-9 w-full min-w-[200px] sm:max-w-[260px] ${statusMap[repair.status as RepairStatus]?.color || ""}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(statusMap) as RepairStatus[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {statusMap[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline" className="font-mono">
              Main d’œuvre : {(repair.laborCost ?? 0).toLocaleString()} GNF
            </Badge>
            <Badge variant="outline" className="font-mono">
              Pièces : {(repair.partsCost ?? 0).toLocaleString()} GNF
            </Badge>
            <Badge className="bg-primary font-mono text-primary-foreground">
              Total : {(repair.totalCost ?? 0).toLocaleString()} GNF
            </Badge>
          </div>
        </div>
      </div>

      <Tabs defaultValue="infos" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="infos">Infos</TabsTrigger>
          <TabsTrigger value="parts">Pièces & stock</TabsTrigger>
        </TabsList>

        <TabsContent value="infos" className="mt-4">
          <Card className="min-h-0">
            <CardHeader>
              <CardTitle className="text-lg">Infos</CardTitle>
              <CardDescription>Client, symptômes et main d’œuvre</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Tél. </span>
                  {repair.phoneNumber || "-"}
                </p>
                <p>
                  <span className="text-muted-foreground">Type </span>
                  {repair.deviceType || "-"}
                </p>
                <p>
                  <span className="text-muted-foreground">IMEI / S/N </span>
                  {repair.serialNumber || "-"}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Motif / symptômes</Label>
                <Textarea value={issueText} onChange={(e) => setIssueText(e.target.value)} rows={4} className="text-sm" />
              </div>
              <div className="space-y-2">
                <Label>Notes atelier (interne)</Label>
                <Textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={3}
                  className="text-sm"
                  placeholder="Réserves techniques, historique…"
                />
              </div>
              <div className="space-y-2">
                <Label>Main d’œuvre (GNF)</Label>
                <Input type="number" min={0} value={labor || ""} onChange={(e) => setLabor(Number(e.target.value) || 0)} />
              </div>
              <Button type="button" size="sm" onClick={saveInfos} disabled={savingInfo} className="w-full sm:w-auto">
                {savingInfo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Enregistrer les infos
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parts" className="mt-4">
          <Card className="min-h-0">
            <CardHeader>
              <CardTitle className="text-lg">Pièces & stock</CardTitle>
              <CardDescription>
                Consommations tracées dans l’inventaire -{" "}
                <Link href="/inventory" className="text-primary underline">
                  Stocks
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingParts ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pièce</TableHead>
                        <TableHead className="text-right">Qté</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!sortedParts.length ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                            Aucune pièce consommée.
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedParts.map((row) => {
                          const r = row as {
                            id: string;
                            productId?: string;
                            quantityUsed?: number;
                            totalPartCost?: number;
                          };
                          return (
                            <TableRow key={r.id}>
                              <TableCell className="text-sm">{productName(r.productId ?? "")}</TableCell>
                              <TableCell className="text-right">{r.quantityUsed}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {(r.totalPartCost ?? 0).toLocaleString()} GNF
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              <form onSubmit={submitPart} className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <p className="text-sm font-medium">Ajouter une pièce depuis le stock boutique</p>
                <div className="space-y-2">
                  <Label>Produit</Label>
                  <Select value={partProductId || undefined} onValueChange={setPartProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Référence en stock" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(320px,50vh)]">
                      {productsWithStock.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">Aucun article en stock.</div>
                      ) : (
                        productsWithStock.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {productListLabel(p)} ({stockByProduct.get(p.id)} dispo)
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Qté</Label>
                    <Input
                      type="number"
                      min={1}
                      max={maxForSelected || undefined}
                      value={partQty}
                      onChange={(e) => setPartQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Coût unit. (GNF)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={partUnit || ""}
                      onChange={(e) => setPartUnit(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <Button type="submit" size="sm" disabled={addingPart || ["retiré", "annulé"].includes(repair.status)}>
                  {addingPart ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
                  Ajouter la pièce
                </Button>
                {["retiré", "annulé"].includes(repair.status) && (
                  <p className="text-xs text-amber-700">Fiche clôturée : plus de consommation de pièces.</p>
                )}
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
