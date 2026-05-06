"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign,
  CreditCard,
  Package,
  Building,
  Save,
  Plus,
  X,
  Loader2,
  ShieldCheck,
  Building2,
  Users,
  ArrowRight,
} from "lucide-react";
import { useFirestore, useUser } from "@/firebase";
import { getAppSettings, saveAppSettings, AppSettings, normalizeAppSettings } from "@/firebase/services/settings-service";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { profile, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newMethod, setNewMethod] = useState("");

  useEffect(() => {
    async function load() {
      if (!firestore || profile?.role !== "Admin") {
        setIsDataLoading(false);
        return;
      }
      try {
        const data = await getAppSettings(firestore);
        setSettings(data);
      } catch (error) {
        console.error("Error loading settings:", error);
        setSettings(normalizeAppSettings(undefined));
      } finally {
        setIsDataLoading(false);
      }
    }
    if (!isUserLoading && profile) {
      load();
    }
  }, [firestore, profile, isUserLoading]);

  if (isUserLoading) {
    return (
      <AppLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (profile?.role !== "Admin") {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
          <div className="p-4 bg-rose-100 text-rose-600 rounded-full">
            <ShieldCheck size={48} />
          </div>
          <h2 className="text-2xl font-bold">Accès Administrateur Requis</h2>
          <p className="text-muted-foreground max-w-md">
            Seuls les administrateurs peuvent modifier les paramètres globaux.
          </p>
        </div>
      </AppLayout>
    );
  }

  const handleSave = async () => {
    if (!firestore || !settings) return;
    setIsSaving(true);
    try {
      await saveAppSettings(firestore, settings);
      toast({ title: "Paramètres enregistrés", description: "Les modifications ont été appliquées avec succès." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const addPaymentMethod = () => {
    if (!newMethod.trim() || !settings) return;
    if (settings.paymentMethods.includes(newMethod.trim())) return;
    setSettings({
      ...settings,
      paymentMethods: [...settings.paymentMethods, newMethod.trim()]
    });
    setNewMethod("");
  };

  const removePaymentMethod = (method: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      paymentMethods: settings.paymentMethods.filter(m => m !== method)
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-primary sm:text-3xl">Configuration système</h1>
            <p className="mt-1 text-pretty text-sm text-muted-foreground sm:text-base">
              Préférences globales Hoolo Service (identité, finance, stock, paiements).
            </p>
          </div>
          <Button className="w-full shrink-0 sm:w-auto" onClick={handleSave} disabled={isSaving || isDataLoading}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Enregistrer
          </Button>
        </div>

        {isDataLoading ? (
          <div className="flex h-[40vh] items-center justify-center">
             <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="md:col-span-2 border-primary/15 bg-primary/[0.03]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 className="h-5 w-5 text-primary" />
                  Multi-magasins
                </CardTitle>
                <CardDescription>
                  Chaque point de vente a ses propres stocks, ventes et réparations. Les utilisateurs choisissent le
                  magasin actif dans l’en-tête : aucune affectation fixe par compte n’est nécessaire.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="secondary" asChild>
                  <Link href="/boutiques" className="inline-flex items-center gap-2">
                    Boutiques
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/users" className="inline-flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Personnel
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building className="h-5 w-5 text-primary" />
                  Entreprise
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nom de l'entreprise</Label>
                  <Input 
                    id="companyName" 
                    value={settings?.companyName || ""} 
                    onChange={(e) => setSettings(s => s ? {...s, companyName: e.target.value} : null)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                  Finance &amp; devises
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currency">Devise principale</Label>
                  <Input 
                    id="currency" 
                    placeholder="GNF, USD, EUR…" 
                    value={settings?.currency || ""}
                    onChange={(e) => setSettings(s => s ? {...s, currency: e.target.value} : null)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="h-5 w-5 text-orange-600" />
                  Seuil stock bas (global)
                </CardTitle>
                <CardDescription>
                  Valeur de référence pour les alertes et indicateurs « stock bas » lorsqu&apos;un article n&apos;a pas de
                  seuil propre.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="lowStock">Quantité minimum confortable</Label>
                  <Input
                    id="lowStock"
                    type="number"
                    min={0}
                    step={1}
                    value={settings?.lowStockThreshold ?? 5}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setSettings((s) =>
                        s ? { ...s, lowStockThreshold: Number.isFinite(v) ? Math.max(0, v) : s.lowStockThreshold } : null
                      );
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CreditCard className="h-5 w-5 text-accent" />
                  Modes de paiement
                </CardTitle>
                <CardDescription>
                  Libellés proposés lors des ventes (espèces, mobile money, crédit, etc.). Modifiez la liste selon vos
                  canaux réels.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap gap-2">
                  {settings?.paymentMethods?.map((method) => (
                    <Badge key={method} variant="secondary" className="px-3 py-1 flex items-center gap-2 text-sm">
                      {method}
                      <button onClick={() => removePaymentMethod(method)} className="hover:text-rose-500">
                        <X size={14} />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Separator />
                <div className="flex gap-2 max-w-sm">
                  <Input 
                    placeholder="Nouveau mode (ex: Orange Money)" 
                    value={newMethod}
                    onChange={(e) => setNewMethod(e.target.value)}
                  />
                  <Button variant="outline" size="icon" onClick={addPaymentMethod}><Plus size={16} /></Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
