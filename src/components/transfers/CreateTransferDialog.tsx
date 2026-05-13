'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { useBoutiqueScope } from '@/contexts/boutique-scope';
import { collection, query, orderBy } from 'firebase/firestore';
import { createTransfer } from '@/firebase/services/transfer-service';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, Search } from 'lucide-react';
import { rowMatchesSearch } from '@/lib/list-search';
import { productListLabel } from '@/lib/product-display';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { toUserFacingErrorMessage } from '@/lib/user-facing-error';

interface CreateTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTransferDialog({ open, onOpenChange }: CreateTransferDialogProps) {
  const [fromBoutique, setFromBoutique] = useState('');
  const [toBoutique, setToBoutique] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const firestore = useFirestore();
  const { user } = useUser();
  const { activeBoutiqueId } = useBoutiqueScope();
  const { toast } = useToast();

  const productsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'products'), orderBy('name', 'asc'));
  }, [firestore]);

  const boutiquesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'boutiques'), orderBy('name', 'asc'));
  }, [firestore]);

  const stocksFromQuery = useMemoFirebase(() => {
    if (!firestore || !fromBoutique) return null;
    return query(collection(firestore, 'boutiques', fromBoutique, 'stocks'));
  }, [firestore, fromBoutique]);

  const { data: products } = useCollection(productsQuery);
  const { data: boutiques } = useCollection(boutiquesQuery);
  const { data: stocksFrom } = useCollection(stocksFromQuery);

  const debouncedProductSearch = useDebouncedValue(productSearch, 200);

  const filteredProducts = useMemo(() => {
    if (!products?.length) return [];
    return products.filter((p) => {
      if ((p as { isActive?: boolean }).isActive === false) return false;
      return rowMatchesSearch(debouncedProductSearch, [
        p.name,
        (p as { category?: string }).category,
        (p as { reference?: string }).reference,
        p.id,
      ]);
    });
  }, [products, debouncedProductSearch]);

  const stockByProductId = useMemo(() => {
    const m = new Map<string, number>();
    stocksFrom?.forEach((s) => {
      const pid = (s as { productId?: string }).productId;
      if (pid) m.set(pid, (s as { quantity?: number }).quantity ?? 0);
    });
    return m;
  }, [stocksFrom]);

  const availableAtSource = selectedProduct ? stockByProductId.get(selectedProduct) ?? 0 : null;

  useEffect(() => {
    if (!open) return;
    setFromBoutique(activeBoutiqueId ?? '');
    setToBoutique('');
    setSelectedProduct('');
    setQuantity(1);
    setNote('');
    setProductSearch('');
  }, [open, activeBoutiqueId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user) return;

    if (!fromBoutique || !toBoutique) {
      toast({ variant: 'destructive', title: 'Boutiques requises', description: 'Choisissez origine et destination.' });
      return;
    }

    if (fromBoutique === toBoutique) {
      toast({
        variant: 'destructive',
        title: 'Destination invalide',
        description: 'La boutique de destination doit être différente de l’origine.',
      });
      return;
    }

    if (!selectedProduct) {
      toast({ variant: 'destructive', title: 'Produit requis' });
      return;
    }

    const avail = stockByProductId.get(selectedProduct) ?? 0;
    if (avail < 1) {
      toast({
        variant: 'destructive',
        title: 'Stock insuffisant',
        description: 'Aucune unité disponible à l’origine pour ce produit.',
      });
      return;
    }

    if (quantity < 1 || quantity > avail) {
      toast({
        variant: 'destructive',
        title: 'Quantité invalide',
        description: `Vous pouvez transférer entre 1 et ${avail} unité(s).`,
      });
      return;
    }

    const prod = products?.find((p) => p.id === selectedProduct);

    setIsSubmitting(true);
    try {
      await createTransfer(firestore, {
        fromBoutiqueId: fromBoutique,
        toBoutiqueId: toBoutique,
        productId: selectedProduct,
        productName: (prod as { name?: string })?.name ?? selectedProduct,
        quantity: Math.floor(quantity),
        userId: user.uid,
        note: note.trim() || undefined,
      });
      toast({
        title: 'Demande créée',
        description: 'Le transfert est en attente de validation par un administrateur.',
      });
      onOpenChange(false);
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Création impossible',
        description: toUserFacingErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau transfert</DialogTitle>
          <DialogDescription>
            Demande inter-boutiques. Le stock source n’est débité qu’après validation par un administrateur.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Origine</Label>
              <Select value={fromBoutique || undefined} onValueChange={setFromBoutique}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Boutique source" />
                </SelectTrigger>
                <SelectContent className="max-h-[240px]">
                  {boutiques?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {(b as { name?: string }).name || b.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Destination</Label>
              <Select value={toBoutique || undefined} onValueChange={setToBoutique}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Magasin destinataire" />
                </SelectTrigger>
                <SelectContent className="max-h-[240px]">
                  {boutiques?.filter((b) => b.id !== fromBoutique).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {(b as { name?: string }).name || b.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Produit</Label>
            <div className="flex items-center gap-2 rounded-md border px-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                className="border-0 shadow-none focus-visible:ring-0"
                placeholder="Filtrer par nom, catégorie…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            <Select value={selectedProduct || undefined} onValueChange={setSelectedProduct}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un produit" />
              </SelectTrigger>
              <SelectContent className="max-h-[280px]">
                {filteredProducts.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">Aucun produit actif ne correspond.</div>
                ) : (
                  filteredProducts.map((p) => {
                    const av = stockByProductId.get(p.id) ?? 0;
                    const label = productListLabel(p as { name?: string; reference?: string | null });
                    return (
                      <SelectItem key={p.id} value={p.id} disabled={av < 1}>
                        {`${label} (${av} dispo)`}
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
            {fromBoutique && selectedProduct && (
              <p className="text-sm text-muted-foreground">
                Stock disponible à l’origine :{' '}
                <span className="font-semibold text-foreground">{availableAtSource ?? 0}</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tr-qty">Quantité</Label>
            <Input
              id="tr-qty"
              type="number"
              min={1}
              max={availableAtSource ?? undefined}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tr-note">Commentaire (optionnel)</Label>
            <Textarea
              id="tr-note"
              rows={3}
              className="resize-none text-sm"
              placeholder="Motif, référence camion, colis…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-primary">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
