"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFirestore } from "@/firebase";
import { useUser } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { adjustStockLevel, ensureStockLine } from "@/firebase/services/inventory-service";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boutiqueId: string | undefined;
  productId: string;
  productName: string;
  stock: { id: string; quantity: number; alertThreshold?: number } | null;
  onSaved: () => void;
};

export function StockAdjustDialog({
  open,
  onOpenChange,
  boutiqueId,
  productId,
  productName,
  stock,
  onSaved,
}: Props) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [qty, setQty] = useState(0);
  const [threshold, setThreshold] = useState(5);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (stock) {
      setQty(stock.quantity);
      setThreshold(stock.alertThreshold ?? 5);
      setNote("");
    } else {
      setQty(0);
      setThreshold(5);
      setNote("");
    }
  }, [open, stock]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boutiqueId) {
      toast({ variant: "destructive", title: "Boutique manquante" });
      return;
    }
    setIsSaving(true);
    try {
      let stockId = stock?.id;
      if (!stockId) {
        stockId = await ensureStockLine(firestore, boutiqueId, productId, threshold);
      }
      await adjustStockLevel(firestore, {
        boutiqueId,
        stockId,
        productId,
        newQuantity: qty,
        newAlertThreshold: threshold,
        note,
        userId: user?.uid,
      });
      toast({ title: "Stock mis à jour", description: "Mouvement enregistré." });
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Erreur";
      toast({ variant: "destructive", title: "Erreur", description: m });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajuster le stock</DialogTitle>
          <DialogDescription className="line-clamp-2">{productName}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!stock && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
              Aucune ligne de stock pour ce produit : une ligne sera créée pour cette boutique.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sa-qty">Quantité physique</Label>
              <Input
                id="sa-qty"
                type="number"
                min={0}
                value={qty}
                onChange={(e) => setQty(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sa-th">Seuil d’alerte</Label>
              <Input
                id="sa-th"
                type="number"
                min={0}
                value={threshold}
                onChange={(e) => setThreshold(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sa-note">Motif (inventaire, réception, casse…)</Label>
            <Textarea
              id="sa-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="resize-none text-sm"
              placeholder="Optionnel"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
