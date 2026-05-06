"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductCatalogForm } from "@/components/inventory/product-catalog-form";
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase";
import { useBoutiqueScope } from "@/contexts/boutique-scope";
import { collection, query, orderBy } from "firebase/firestore";

export default function NewProductPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { profile, isUserLoading } = useUser();
  const { activeBoutiqueId } = useBoutiqueScope();

  const productsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "products"), orderBy("name", "asc"));
  }, [firestore]);

  const { data: products } = useCollection(productsQuery);

  const categories = useMemo(() => {
    if (!products?.length) return [];
    const set = new Set<string>();
    products.forEach((p) => {
      const c = (p as { category?: string }).category?.trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [products]);

  const isAdmin = profile?.role === "Admin";

  if (isUserLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <Card className="max-w-lg mx-auto mt-8">
          <CardHeader>
            <CardTitle>Accès réservé</CardTitle>
            <CardDescription>Seuls les administrateurs peuvent créer un produit.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/inventory">
                <ArrowLeft className="mr-2 h-4 w-4" /> Retour inventaire
              </Link>
            </Button>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" asChild aria-label="Retour">
            <Link href="/inventory">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-primary sm:text-3xl">Nouveau produit</h1>
            <p className="text-sm text-muted-foreground">
              Ajout au catalogue et première ligne de stock pour la boutique active.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Fiche catalogue</CardTitle>
            <CardDescription>Renseignez les informations puis validez - vous serez renvoyé vers la liste inventaire.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProductCatalogForm
              mode="create"
              boutiqueId={activeBoutiqueId ?? undefined}
              existingCategories={categories}
              onSuccess={() => router.push("/inventory")}
              cancelAction={
                <Button type="button" variant="outline" asChild>
                  <Link href="/inventory">Annuler</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
