
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Plus,
  MapPin,
  Phone,
  Mail,
  Users,
  Edit,
  Trash2,
  Loader2,
  Copy,
  Hash,
  Star,
} from "lucide-react";
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase";
import { ensureDefaultBoutique, ensureSingleDefaultBoutique } from "@/firebase/services/boutique-default";
import {
  collection,
  query,
  orderBy,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ListSearchBar } from "@/components/table/list-search-bar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { rowMatchesSearch } from "@/lib/list-search";
import { toUserFacingErrorMessage } from "@/lib/user-facing-error";

type BoutiqueStatus = "active" | "inactive";

export type BoutiqueTenant = {
  name: string;
  address?: string;
  phoneNumber?: string;
  email?: string;
  /** Référence interne optionnelle (code magasin, etc.) */
  code?: string;
  status?: BoutiqueStatus;
  /** Boutique affichée par défaut dans l’en-tête et utilisée au bootstrap si besoin */
  isDefault?: boolean;
};

const defaultForm: BoutiqueTenant & { status: BoutiqueStatus; isDefault: boolean } = {
  name: "",
  address: "",
  phoneNumber: "",
  email: "",
  code: "",
  status: "active",
  isDefault: false,
};

function boutiqueIsActive(b: BoutiqueTenant & { id?: string }): boolean {
  return b.status !== "inactive";
}

export default function BoutiquesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(defaultForm);
  const [searchTerm, setSearchTerm] = useState("");

  const firestore = useFirestore();
  const { profile } = useUser();
  const { toast } = useToast();

  const boutiquesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "boutiques"), orderBy("name", "asc"));
  }, [firestore]);

  const { data: boutiques, isLoading } = useCollection<BoutiqueTenant>(boutiquesQuery);

  const sortedBoutiques = useMemo(() => {
    if (!boutiques?.length) return boutiques;
    return [...boutiques].sort((a, b) => {
      const ad = a.isDefault ? 0 : 1;
      const bd = b.isDefault ? 0 : 1;
      if (ad !== bd) return ad - bd;
      const ai = boutiqueIsActive(a) ? 0 : 1;
      const bi = boutiqueIsActive(b) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" });
    });
  }, [boutiques]);

  const debouncedSearch = useDebouncedValue(searchTerm, 280);

  const filteredBoutiques = useMemo(() => {
    if (!sortedBoutiques?.length) return null;
    return sortedBoutiques.filter((b) =>
      rowMatchesSearch(debouncedSearch, [
        b.name,
        b.code,
        b.address,
        b.email,
        b.phoneNumber,
        b.id,
      ])
    );
  }, [sortedBoutiques, debouncedSearch]);

  const boutiqueResultHint =
    sortedBoutiques?.length != null && filteredBoutiques
      ? `${filteredBoutiques.length} / ${sortedBoutiques.length}`
      : undefined;

  const boutiqueStats = useMemo(() => {
    const list = sortedBoutiques ?? [];
    return {
      total: list.length,
      active: list.filter((b) => boutiqueIsActive(b)).length,
      withDefaultFlag: list.filter((b) => b.isDefault).length,
    };
  }, [sortedBoutiques]);

  const openCreate = () => {
    setEditingId(null);
    setFormData(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (b: BoutiqueTenant & { id: string }) => {
    setEditingId(b.id);
    setFormData({
      name: b.name || "",
      address: b.address || "",
      phoneNumber: b.phoneNumber || "",
      email: b.email || "",
      code: b.code || "",
      status: boutiqueIsActive(b) ? "active" : "inactive",
      isDefault: Boolean(b.isDefault),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore) return;
    if (!formData.name.trim()) {
      toast({
        variant: "destructive",
        title: "Nom requis",
        description: "Indiquez le nom du point de vente.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        address: formData.address.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        email: formData.email.trim(),
        code: formData.code.trim(),
        status: formData.status,
        isDefault: formData.isDefault,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(firestore, "boutiques", editingId), payload);
        if (formData.isDefault) {
          await ensureSingleDefaultBoutique(firestore, editingId);
        }
        toast({
          title: "Boutique mise à jour",
          description: "Les informations du tenant ont été enregistrées.",
        });
      } else {
        const created = await addDoc(collection(firestore, "boutiques"), {
          ...payload,
          isDefault: false,
          createdAt: serverTimestamp(),
        });
        if (formData.isDefault) {
          await ensureSingleDefaultBoutique(firestore, created.id);
        }
        toast({
          title: "Boutique créée",
          description: "Le nouveau point de vente (tenant) a été ajouté.",
        });
      }
      setDialogOpen(false);
      setEditingId(null);
      setFormData(defaultForm);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Enregistrement impossible",
        description: toUserFacingErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (b: BoutiqueTenant & { id: string }) => {
    if (!firestore) return;
    const msg =
      `Supprimer définitivement « ${b.name} » ?\n\n` +
      `Le point de vente sera retiré de la liste. Les données associées (stocks, ventes, réparations, etc.) ` +
      `peuvent subsister côté serveur : faites le ménage avec l’aide d’un administrateur technique si nécessaire.`;
    if (!window.confirm(msg)) return;

    try {
      await deleteDoc(doc(firestore, "boutiques", b.id));
      if (b.isDefault) {
        await ensureDefaultBoutique(firestore, { promoteExistingWithoutFlag: true });
      }
      toast({
        title: "Boutique supprimée",
        description:
          "Vérifiez les transferts de stock et les données encore liées à ce point de vente si besoin.",
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Suppression impossible",
        description: toUserFacingErrorMessage(error),
      });
    }
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast({ title: "Identifiant copié", description: id });
    } catch {
      toast({
        variant: "destructive",
        title: "Copie impossible",
        description: "Autorisez le presse-papiers dans le navigateur.",
      });
    }
  };

  if (profile?.role !== "Admin") {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
          <div className="p-4 bg-rose-100 text-rose-600 rounded-full">
            <Building2 size={48} />
          </div>
          <h2 className="text-2xl font-bold">Accès Restreint</h2>
          <p className="text-muted-foreground max-w-md">
            Seuls les administrateurs peuvent gérer les boutiques (tenants) et les points de vente.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-w-0 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-primary sm:text-3xl">Gestion des boutiques</h1>
            <p className="mt-1 text-pretty text-sm text-muted-foreground sm:text-base">
              Points de vente (tenants) : coordonnées, statut et référence interne.
            </p>
          </div>
          <Button className="w-full shrink-0 bg-primary sm:w-auto" type="button" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Nouvelle boutique
          </Button>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <Card className="min-w-0 overflow-hidden">
            <CardContent className="flex items-center gap-3 pt-5">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Total</p>
                <p className="text-2xl font-bold tabular-nums">{boutiqueStats.total}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="min-w-0 overflow-hidden">
            <CardContent className="flex items-center gap-3 pt-5">
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-700">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Actives</p>
                <p className="text-2xl font-bold tabular-nums">{boutiqueStats.active}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="min-w-0 overflow-hidden">
            <CardContent className="space-y-3 pt-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="shrink-0 rounded-lg bg-amber-500/10 p-2 text-amber-800">
                  <Star className="h-5 w-5 fill-amber-500/30 text-amber-700" />
                </div>
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Par défaut</p>
                  <p className="text-2xl font-bold tabular-nums">{boutiqueStats.withDefaultFlag}</p>
                </div>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                <Button variant="outline" size="sm" className="h-auto min-h-9 w-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs sm:text-sm" asChild>
                  <Link href="/users">Personnel</Link>
                </Button>
                <Button variant="outline" size="sm" className="h-auto min-h-9 w-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs sm:text-sm" asChild>
                  <Link href="/settings" title="Ouvrir les paramètres globaux">
                    Paramètres
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Modifier la boutique" : "Nouvelle boutique"}
              </DialogTitle>
              <DialogDescription>
                {editingId
                  ? "Mettez à jour les informations de ce tenant."
                  : "Créez un point de vente. L’identifiant technique est généré automatiquement."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="boutique-name">Nom du point de vente</Label>
                <Input
                  id="boutique-name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex. Hoolo Matam"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="boutique-code">Code / référence interne (optionnel)</Label>
                <Input
                  id="boutique-code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Ex. MAT -001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="boutique-address">Adresse</Label>
                <Input
                  id="boutique-address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Rue, ville…"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="boutique-phone">Téléphone</Label>
                  <Input
                    id="boutique-phone"
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    placeholder="+224 …"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="boutique-email">Email</Label>
                  <Input
                    id="boutique-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="contact@…"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Statut</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) =>
                    setFormData({ ...formData, status: v as BoutiqueStatus })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Actif</SelectItem>
                    <SelectItem value="inactive">Inactif (fermé / archivé)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                <Checkbox
                  id="boutique-default"
                  checked={formData.isDefault}
                  onCheckedChange={(v) =>
                    setFormData({ ...formData, isDefault: v === true })
                  }
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="boutique-default" className="cursor-pointer font-medium">
                    Magasin par défaut
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    Utilisée au premier démarrage et comme magasin proposé par défaut dans l’en-tête. Une seule boutique
                    peut être « par défaut » à la fois.
                  </p>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-primary">
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : editingId ? (
                    "Enregistrer"
                  ) : (
                    "Créer"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <ListSearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Nom, code, adresse, téléphone, e-mail, id…"
          resultHint={boutiqueResultHint ? `${boutiqueResultHint} boutique(s)` : undefined}
          className="max-w-2xl"
        />

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : sortedBoutiques && sortedBoutiques.length > 0 ? (
          !filteredBoutiques?.length ? (
            <p className="text-muted-foreground text-center py-12 text-sm">
              Aucune boutique ne correspond à cette recherche.
            </p>
          ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredBoutiques.map((boutique) => {
              const active = boutiqueIsActive(boutique);
              const phone = boutique.phoneNumber?.trim() ?? "";
              const email = boutique.email?.trim() ?? "";
              const address = boutique.address?.trim() ?? "";
              const hasContact = Boolean(phone || email);
              return (
                <Card
                  key={boutique.id}
                  className={`transition-shadow hover:shadow-md ${
                    !active ? "border-muted opacity-90" : ""
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="rounded-lg bg-primary/10 p-2 text-primary">
                        <Building2 size={24} />
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {boutique.isDefault ? (
                          <Badge variant="secondary" className="gap-1 border-amber-200 bg-amber-50 text-amber-900">
                            <Star className="h-3 w-3 fill-amber-500 text-amber-600" />
                            Par défaut
                          </Badge>
                        ) : null}
                        <Badge
                          variant="outline"
                          className={
                            active
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-muted-foreground/30 bg-muted text-muted-foreground"
                          }
                        >
                          {active ? "Actif" : "Inactif"}
                        </Badge>
                      </div>
                    </div>
                    <CardTitle className="leading-tight">{boutique.name}</CardTitle>
                    {boutique.code?.trim() ? (
                      <p className="text-muted-foreground flex items-center gap-1 text-xs">
                        <Hash className="h-3 w-3 shrink-0" />
                        {boutique.code.trim()}
                      </p>
                    ) : null}
                    {address ? (
                      <CardDescription className="flex items-start gap-1">
                        <MapPin size={12} className="mt-0.5 shrink-0" />
                        <span>{address}</span>
                      </CardDescription>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-4 border-t pt-4">
                    {hasContact ? (
                      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        {phone ? (
                          <div className="text-muted-foreground flex min-w-0 items-center gap-2">
                            <Phone size={14} className="shrink-0" />
                            <span className="truncate">{phone}</span>
                          </div>
                        ) : null}
                        {email ? (
                          <div className="text-muted-foreground flex min-w-0 items-center gap-2">
                            <Mail size={14} className="shrink-0" />
                            <span className="truncate">{email}</span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div
                      className={`flex items-center justify-between ${hasContact ? "border-t pt-4" : ""}`}
                    >
                      <div className="flex max-w-[55%] items-center gap-2 text-xs font-semibold text-muted-foreground">
                        <Users size={14} className="shrink-0 text-primary" />
                        <span className="truncate font-mono" title={boutique.id}>
                          {boutique.id}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title="Copier l’identifiant"
                          onClick={() => copyId(boutique.id)}
                        >
                          <Copy size={14} />
                        </Button>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Modifier"
                          onClick={() => openEdit(boutique)}
                        >
                          <Edit size={14} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-rose-600"
                          title="Supprimer"
                          onClick={() => handleDelete(boutique)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          )
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Building2 className="mb-3 h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground max-w-sm">
                Aucune boutique enregistrée. Créez un premier point de vente pour isoler stocks, ventes et réparations
                par magasin.
              </p>
              <Button className="mt-4 bg-primary" type="button" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> Créer une boutique
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
