"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFirestore } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ScanLine } from "lucide-react";
import { createProductWithInitialStock, updateCatalogProduct, type ProductInput } from "@/firebase/services/inventory-service";
import { ProductBarcodeScannerDialog } from "@/components/inventory/product-barcode-scanner-dialog";

export type CatalogProductRow = {
  id: string;
  name?: string;
  category?: string;
  reference?: string | null;
  purchasePrice?: number;
  sellingPrice?: number;
  isActive?: boolean;
};

const emptyForm: ProductInput & { initialQuantity: number; alertThreshold: number } = {
  name: "",
  category: "",
  reference: "",
  purchasePrice: 0,
  sellingPrice: 0,
  isActive: true,
  initialQuantity: 0,
  alertThreshold: 5,
};

const NEW_CATEGORY_SENTINEL = "__hoolo::new_category__";

export type ProductCatalogFormProps = {
  mode: "create" | "edit";
  product?: CatalogProductRow | null;
  boutiqueId: string | undefined;
  existingCategories?: string[];
  /** ID Firestore du document produit (mode édition). */
  productId?: string;
  onSuccess: (result: { mode: "create"; productId: string } | { mode: "edit" }) => void;
  cancelAction: React.ReactNode;
};

export function ProductCatalogForm({
  mode,
  product,
  boutiqueId,
  existingCategories = [],
  productId,
  onSuccess,
  cancelAction,
}: ProductCatalogFormProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [scannerOpen, setScannerOpen] = useState(false);

  const applyScannedReference = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      setForm((f) => ({ ...f, reference: t }));
      toast({
        title: "Code lu",
        description: "La référence a été renseignée. Complétez le reste du formulaire.",
      });
    },
    [toast]
  );

  useEffect(() => {
    if (mode === "edit" && product) {
      setForm({
        name: product.name ?? "",
        category: product.category ?? "",
        reference: product.reference ?? "",
        purchasePrice: product.purchasePrice ?? 0,
        sellingPrice: product.sellingPrice ?? 0,
        isActive: product.isActive !== false,
        initialQuantity: 0,
        alertThreshold: 5,
      });
    } else if (mode === "create") {
      setForm({ ...emptyForm });
    }
  }, [mode, product]);

  const safeExistingCategories = useMemo(
    () => existingCategories.filter((c) => c.trim() && c !== NEW_CATEGORY_SENTINEL),
    [existingCategories]
  );

  const categoryTrimmed = form.category.trim();
  const categorySelectValue = safeExistingCategories.includes(categoryTrimmed)
    ? categoryTrimmed
    : NEW_CATEGORY_SENTINEL;

  const datalistId = "product-category-suggestions";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "Nom requis" });
      return;
    }
    if (form.sellingPrice < 0) {
      toast({ variant: "destructive", title: "Prix de vente invalide" });
      return;
    }
    if (mode === "create" && !boutiqueId) {
      toast({
        variant: "destructive",
        title: "Aucune boutique active",
        description:
          "Choisissez un magasin dans le menu « Boutique active » en haut de l’écran, puis réessayez.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload: ProductInput = {
        name: form.name,
        category: form.category,
        reference: form.reference,
        purchasePrice: form.purchasePrice,
        sellingPrice: form.sellingPrice,
        isActive: form.isActive,
      };
      if (mode === "create" && boutiqueId) {
        const id = await createProductWithInitialStock(firestore, {
          boutiqueId,
          product: payload,
          initialQuantity: form.initialQuantity,
          alertThreshold: form.alertThreshold,
        });
        toast({ title: "Produit créé", description: "Retour à la liste inventaire." });
        onSuccess({ mode: "create", productId: id });
      } else if (mode === "edit" && productId) {
        await updateCatalogProduct(firestore, productId, payload);
        toast({ title: "Produit mis à jour" });
        onSuccess({ mode: "edit" });
      }
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Erreur";
      toast({ variant: "destructive", title: "Erreur", description: m });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pc-name">Désignation</Label>
          <Input
            id="pc-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="pc-ref" className="mb-0">
              Référence produit
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 md:hidden"
              onClick={() => setScannerOpen(true)}
            >
              <ScanLine className="h-3.5 w-3.5" aria-hidden />
              Scanner
            </Button>
          </div>
          <Input
            id="pc-ref"
            value={form.reference ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
            placeholder="Ex. SKU, code fournisseur…"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Optionnel. Sur mobile, utilisez « Scanner » pour lire un code-barres ou un QR code (caméra).
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pc-cat">Catégorie</Label>
          {safeExistingCategories.length > 0 ? (
            <Select
              value={categorySelectValue}
              onValueChange={(v) => {
                if (v === NEW_CATEGORY_SENTINEL) {
                  setForm((f) => ({ ...f, category: "" }));
                  return;
                }
                setForm((f) => ({ ...f, category: v }));
              }}
            >
              <SelectTrigger id="pc-cat-select" className="w-full">
                <SelectValue placeholder="Choisir une catégorie existante…" />
              </SelectTrigger>
              <SelectContent className="z-[220] max-h-[min(16rem,40vh)]">
                <SelectItem value={NEW_CATEGORY_SENTINEL}>Nouvelle catégorie</SelectItem>
                {safeExistingCategories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Input
            id="pc-cat"
            list={safeExistingCategories.length > 0 ? datalistId : undefined}
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder={
              safeExistingCategories.length > 0
                ? "Nom de la catégorie (nouvelle ou complétez la sélection)"
                : "Ex. Accessoires, Pièces écran…"
            }
          />
          {safeExistingCategories.length > 0 ? (
            <datalist id={datalistId}>
              {safeExistingCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Sélectionnez une catégorie déjà utilisée ou saisissez un libellé pour en créer une nouvelle.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="pc-purchase">Prix achat (GNF)</Label>
            <Input
              id="pc-purchase"
              type="number"
              min={0}
              value={form.purchasePrice || ""}
              onChange={(e) => setForm((f) => ({ ...f, purchasePrice: Number(e.target.value) || 0 }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pc-sell">Prix vente (GNF)</Label>
            <Input
              id="pc-sell"
              type="number"
              min={0}
              value={form.sellingPrice || ""}
              onChange={(e) => setForm((f) => ({ ...f, sellingPrice: Number(e.target.value) || 0 }))}
            />
          </div>
        </div>
        {mode === "create" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pc-qty">Stock initial</Label>
              <Input
                id="pc-qty"
                type="number"
                min={0}
                value={form.initialQuantity || ""}
                onChange={(e) => setForm((f) => ({ ...f, initialQuantity: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pc-th">Seuil d’alerte</Label>
              <Input
                id="pc-th"
                type="number"
                min={0}
                value={form.alertThreshold || ""}
                onChange={(e) => setForm((f) => ({ ...f, alertThreshold: Number(e.target.value) || 0 }))}
              />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <Label htmlFor="pc-active" className="cursor-pointer">
            Actif (visible ventes & stock)
          </Label>
          <Switch
            id="pc-active"
            checked={form.isActive}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {cancelAction}
          <Button type="submit" disabled={isSaving} className="bg-primary sm:min-w-[120px]">
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "create" ? (
              "Créer le produit"
            ) : (
              "Enregistrer"
            )}
          </Button>
        </div>
      </form>
      <ProductBarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDecoded={applyScannedReference}
      />
    </>
  );
}
