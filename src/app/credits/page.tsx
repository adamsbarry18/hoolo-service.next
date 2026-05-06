
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Banknote, ShieldCheck, User, UserPlus, SlidersHorizontal, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase";
import { useBoutiqueScope } from "@/contexts/boutique-scope";
import { collection, query, orderBy } from "firebase/firestore";
import {
  calculateReliabilityScore,
  creditUsagePercent,
  processRepayment,
  updateClientCreditLimit,
} from "@/firebase/services/credit-service";
import { getAppSettings } from "@/firebase/services/settings-service";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
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

const CREDITS_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "client", label: "Client", required: true },
  { id: "debt_limit", label: "Encours / Plafond" },
  { id: "usage", label: "Utilisation", mobileVisible: false },
  { id: "reliability", label: "Fiabilité", defaultVisible: false },
  { id: "status", label: "Statut", defaultVisible: false },
  {
    id: "actions",
    label: "Actions",
    required: true,
    headerClassName: "text-right",
  },
];

type CreditFilter = "active_credit" | "all" | "debt" | "risk" | "healthy";

type CreditClientRow = {
  id: string;
  name?: string;
  currentDebt: number;
  creditLimit: number;
};

function repaymentMethodLabel(method: string): string {
  switch (method) {
    case "cash":
      return "Espèces";
    case "mobile_money":
      return "Mobile financier";
    case "credit":
      return "Crédit";
    default:
      return method;
  }
}

function normalizeClient(c: Record<string, unknown> & { id: string }): CreditClientRow {
  return {
    id: c.id,
    name: typeof c.name === "string" ? c.name : undefined,
    currentDebt: Number(c.currentDebt) || 0,
    creditLimit: Number(c.creditLimit) || 0,
  };
}

function renderCreditCells(
  col: TableColumnDef,
  client: CreditClientRow,
  usage: number,
  score: number,
  canAct: boolean,
  onRepay: () => void,
  onAdjustLimit: () => void
) {
  const limit = client.creditLimit;

  switch (col.id) {
    case "client":
      return (
        <TableCell key={col.id}>
          <div className="flex items-center gap-2">
            <User size={16} className="text-muted-foreground" />
            <span className="font-semibold">{client.name ?? "Sans nom"}</span>
          </div>
        </TableCell>
      );
    case "debt_limit":
      return (
        <TableCell key={col.id}>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono font-bold text-rose-600">
              {client.currentDebt.toLocaleString()} GNF
            </span>
            {limit > 0 ? (
              <span className="text-[10px] text-muted-foreground">
                Plafond : {limit.toLocaleString()} GNF
              </span>
            ) : (
              <span className="text-[10px] text-amber-800">Plafond non défini</span>
            )}
          </div>
        </TableCell>
      );
    case "usage":
      return (
        <TableCell key={col.id} className="w-[150px]">
          <div className="space-y-1">
            <Progress value={Math.min(usage, 100)} className={usage > 90 ? "bg-rose-100" : ""} />
            <span className="text-[10px] text-muted-foreground">
              {limit > 0 ? `${usage.toFixed(0)} % du plafond` : client.currentDebt > 0 ? "Sans plafond" : "-"}
            </span>
          </div>
        </TableCell>
      );
    case "reliability":
      return (
        <TableCell key={col.id}>
          {limit > 0 ? (
            <div className="flex items-center gap-2">
              <ShieldCheck
                size={14}
                className={
                  score > 80 ? "text-emerald-500" : score > 50 ? "text-orange-500" : "text-rose-500"
                }
              />
              <span className="text-xs font-medium">{score} %</span>
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          )}
        </TableCell>
      );
    case "status":
      return (
        <TableCell key={col.id}>
          <Badge
            variant="outline"
            className={
              usage >= 100
                ? "border-rose-200 bg-rose-100 text-rose-700"
                : usage > 80
                  ? "border-orange-200 bg-orange-100 text-orange-700"
                  : "border-emerald-200 bg-emerald-100 text-emerald-700"
            }
          >
            {usage >= 100 ? "Bloqué" : usage > 80 ? "Risque" : "Sain"}
          </Badge>
        </TableCell>
      );
    case "actions":
      return (
        <TableCell key={col.id} className="text-right">
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canAct || client.currentDebt <= 0}
              onClick={onRepay}
            >
              <Banknote size={14} className="mr-2" /> Rembourser
            </Button>
            <Button variant="secondary" size="sm" disabled={!canAct} onClick={onAdjustLimit}>
              <SlidersHorizontal size={14} className="mr-2" /> Plafond
            </Button>
          </div>
        </TableCell>
      );
    default:
      return null;
  }
}

export default function CreditsPage() {
  const [isRepaymentOpen, setIsRepaymentOpen] = useState(false);
  const [isLimitOpen, setIsLimitOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<CreditClientRow | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [repaymentAmount, setRepaymentAmount] = useState("");
  const [repaymentNote, setRepaymentNote] = useState("");
  const [repaymentMethod, setRepaymentMethod] = useState("cash");
  const [repaymentMethodOptions, setRepaymentMethodOptions] = useState<string[]>(["cash", "mobile_money"]);
  const [limitInput, setLimitInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [creditFilter, setCreditFilter] = useState<CreditFilter>("active_credit");

  const firestore = useFirestore();
  const { user } = useUser();
  const { activeBoutiqueId } = useBoutiqueScope();
  const { toast } = useToast();
  const boutiqueId = activeBoutiqueId?.trim() || "";
  const canAct = Boolean(boutiqueId);

  const clientsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "clients"), orderBy("currentDebt", "desc"));
  }, [firestore]);

  const { data: clientsRaw, isLoading } = useCollection(clientsQuery);

  const clients = useMemo((): CreditClientRow[] | null => {
    if (clientsRaw === null || clientsRaw === undefined) return null;
    return clientsRaw.map((c) => normalizeClient(c as Record<string, unknown> & { id: string }));
  }, [clientsRaw]);

  const { visibility, setColumnVisible, visibleColumns } = useTableColumnVisibility(
    "hoolo:table:credits:v3",
    CREDITS_TABLE_COLUMNS
  );
  const colSpan = visibleColumns.length;

  useEffect(() => {
    if (!isRepaymentOpen || !firestore) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await getAppSettings(firestore);
        const opts = s.paymentMethods.filter((m) => m && m !== "credit");
        const next = opts.length ? opts : ["cash", "mobile_money"];
        if (!cancelled) {
          setRepaymentMethodOptions(next);
          setRepaymentMethod((prev) => (next.includes(prev) ? prev : next[0]!));
        }
      } catch {
        if (!cancelled) {
          const fallback = ["cash", "mobile_money"];
          setRepaymentMethodOptions(fallback);
          setRepaymentMethod((prev) => (fallback.includes(prev) ? prev : fallback[0]!));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isRepaymentOpen, firestore]);

  const openRepay = (c: CreditClientRow) => {
    setSelectedClient(c);
    setRepaymentAmount(c.currentDebt > 0 ? String(c.currentDebt) : "");
    setRepaymentNote("");
    setIsRepaymentOpen(true);
  };

  const openLimit = (c: CreditClientRow) => {
    setSelectedClient(c);
    setLimitInput(String(c.creditLimit > 0 ? c.creditLimit : ""));
    setIsLimitOpen(true);
  };

  const handleRepayment = async () => {
    if (!firestore || !user || !selectedClient || !boutiqueId) return;
    const raw = Number(repaymentAmount);
    if (!Number.isFinite(raw) || raw <= 0) {
      toast({ variant: "destructive", title: "Montant invalide", description: "Indiquez un montant positif." });
      return;
    }
    const maxPay = selectedClient.currentDebt;
    const applied = Math.min(raw, maxPay);

    setIsProcessing(true);
    try {
      await processRepayment(firestore, {
        clientId: selectedClient.id,
        amount: raw,
        paymentMethod: repaymentMethod,
        userId: user.uid,
        boutiqueId,
        description: repaymentNote.trim() || undefined,
      });
      toast({
        title: "Remboursement enregistré",
        description: `${applied.toLocaleString()} GNF imputés sur l'encours (trace en caisse boutique).`,
      });
      setIsRepaymentOpen(false);
      setRepaymentAmount("");
      setRepaymentNote("");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      toast({ variant: "destructive", title: "Erreur", description: message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLimitSave = async () => {
    if (!firestore || !selectedClient) return;
    const v = Number(limitInput);
    if (!Number.isFinite(v) || v < 0) {
      toast({ variant: "destructive", title: "Plafond invalide", description: "Utilisez un nombre positif ou 0." });
      return;
    }
    setIsProcessing(true);
    try {
      await updateClientCreditLimit(firestore, selectedClient.id, v);
      toast({ title: "Plafond mis à jour", description: `Nouveau plafond : ${Math.floor(v).toLocaleString()} GNF` });
      setIsLimitOpen(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      toast({ variant: "destructive", title: "Erreur", description: message });
    } finally {
      setIsProcessing(false);
    }
  };

  const totalDebt = clients?.reduce((acc, c) => acc + c.currentDebt, 0) ?? 0;
  const debtorCount = clients?.filter((c) => c.currentDebt > 0).length ?? 0;
  const clientsAtRisk = clients?.filter((c) => creditUsagePercent(c) > 80).length ?? 0;

  const debouncedSearch = useDebouncedValue(searchTerm, 280);

  const filteredClients = useMemo(() => {
    if (!clients?.length) return null;
    return clients.filter((c) => {
      const usage = creditUsagePercent(c);
      const debt = c.currentDebt;
      const limit = c.creditLimit;
      const hasCreditLine = debt > 0 || limit > 0;

      if (creditFilter === "active_credit" && !hasCreditLine) return false;
      if (creditFilter === "debt" && debt <= 0) return false;
      if (creditFilter === "risk" && !(usage > 80)) return false;
      if (creditFilter === "healthy" && !(usage <= 80)) return false;

      return rowMatchesSearch(debouncedSearch, [c.name, c.id, String(debt), String(limit)]);
    });
  }, [clients, debouncedSearch, creditFilter]);

  const resultHint =
    clients?.length != null && filteredClients
      ? `${filteredClients.length} / ${clients.length} client${clients.length > 1 ? "s" : ""}`
      : undefined;

  const averageReliability = useMemo(() => {
    if (!clients?.length) return null;
    const withLimit = clients.filter((c) => c.creditLimit > 0);
    if (withLimit.length === 0) return null;
    const sum = withLimit.reduce(
      (acc, c) => acc + calculateReliabilityScore(c.currentDebt, c.creditLimit),
      0
    );
    return Math.round(sum / withLimit.length);
  }, [clients]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-primary sm:text-3xl">Crédits &amp; créances</h1>
            <p className="mt-1 text-pretty text-sm text-muted-foreground sm:text-base">
              Encours, plafonds, remboursements tracés en boutique - aligné suivi client et ventes à crédit.
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button variant="outline" className="w-full sm:w-auto" asChild>
              <Link href="/customers">
                <UserPlus className="mr-2 h-4 w-4" />
                Fiches clients
              </Link>
            </Button>
            <Button className="w-full bg-primary sm:w-auto" asChild>
              <Link href="/sales">Nouvelle vente</Link>
            </Button>
          </div>
        </div>

        {!canAct ? (
          <Card className="border-amber-200 bg-amber-50/80">
            <CardHeader className="flex flex-row items-start gap-3 pb-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <CardTitle className="text-base text-amber-900">Magasin actif requis</CardTitle>
                <CardDescription className="text-amber-900/80">
                  Sélectionnez une boutique dans le menu « Boutique active » en haut de l’écran pour enregistrer des
                  remboursements (écriture dans la caisse de ce magasin). Les stocks et l’affichage des créances restent
                  consultables.
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-rose-100 bg-rose-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-rose-800">Total encours clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-900">{totalDebt.toLocaleString()} GNF</div>
              <p className="text-muted-foreground mt-1 text-xs">
                {debtorCount} débiteur{debtorCount > 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>
          <Card className="border-orange-100 bg-orange-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-orange-800">Clients à risque</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-900">{clientsAtRisk}</div>
              <p className="text-muted-foreground mt-1 text-xs">Utilisation du plafond &gt; 80 %</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-100 bg-emerald-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-emerald-800">Score moyen fiabilité</CardTitle>
            </CardHeader>
            <CardContent>
              {averageReliability != null ? (
                <div className="text-2xl font-bold text-emerald-900">{averageReliability} %</div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Définissez des plafonds sur les fiches clients pour estimer la fiabilité (dettes vs plafond).
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div className="min-w-0 space-y-1">
              <CardTitle>Encours et plafonds</CardTitle>
              <CardDescription>
                Filtrez par situation de crédit ; les remboursements alimentent la sous-collection paiements de votre
                boutique.
              </CardDescription>
            </div>
            <TableColumnToggle
              columns={CREDITS_TABLE_COLUMNS}
              visibility={visibility}
              onColumnVisibleChange={setColumnVisible}
              className="w-full shrink-0 sm:w-auto"
            />
          </CardHeader>
          <CardContent className="min-w-0 space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:flex-wrap sm:items-center">
              <ListSearchBar
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Client, identifiant, montants…"
                resultHint={resultHint}
                className="sm:flex-1"
              />
              <Select value={creditFilter} onValueChange={(v) => setCreditFilter(v as CreditFilter)}>
                <SelectTrigger className="h-10 w-full sm:w-[240px]">
                  <SelectValue placeholder="Filtrer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active_credit">Encours ou plafond défini</SelectItem>
                  <SelectItem value="all">Tous les clients</SelectItem>
                  <SelectItem value="debt">Avec encours (&gt; 0)</SelectItem>
                  <SelectItem value="risk">Utilisation &gt; 80 %</SelectItem>
                  <SelectItem value="healthy">Sans risque (≤ 80 %)</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
                      <TableCell colSpan={colSpan} className="text-center">
                        Chargement…
                      </TableCell>
                    </TableRow>
                  ) : !clients?.length ? (
                    <TableRow>
                      <TableCell colSpan={colSpan} className="text-muted-foreground px-4 py-12 text-center">
                        <p className="mb-4">
                          Aucun client enregistré. Créez des fiches depuis Clients pour suivre encours et plafonds.
                        </p>
                        <Button asChild className="bg-primary">
                          <Link href="/customers">
                            <UserPlus className="mr-2 h-4 w-4" />
                            Gérer les clients
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : !filteredClients?.length ? (
                    <TableRow>
                      <TableCell colSpan={colSpan} className="text-muted-foreground text-center py-10">
                        Aucun résultat pour ces critères. Élargissez le filtre (ex. &quot;Tous les clients&quot;) ou la
                        recherche.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredClients.map((client) => {
                      const usage = creditUsagePercent(client);
                      const score = calculateReliabilityScore(client.currentDebt, client.creditLimit);
                      return (
                        <TableRow key={client.id}>
                          {visibleColumns.map((col) =>
                            renderCreditCells(
                              col,
                              client,
                              usage,
                              score,
                              canAct,
                              () => openRepay(client),
                              () => openLimit(client)
                            )
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Dialog open={isRepaymentOpen} onOpenChange={setIsRepaymentOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enregistrer un remboursement</DialogTitle>
              <DialogDescription>
                Versement reçu de {selectedClient?.name ?? "client"} (maximum : l’encours actuel).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Encours actuel : {selectedClient?.currentDebt?.toLocaleString() ?? 0} GNF</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Montant du versement"
                  value={repaymentAmount}
                  onChange={(e) => setRepaymentAmount(e.target.value)}
                />
                {selectedClient && selectedClient.currentDebt > 0 ? (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() => setRepaymentAmount(String(selectedClient.currentDebt))}
                  >
                    Tout solder ({selectedClient.currentDebt.toLocaleString()} GNF)
                  </Button>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Mode de règlement</Label>
                <Select value={repaymentMethod} onValueChange={setRepaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {repaymentMethodOptions.map((m) => (
                      <SelectItem key={m} value={m}>
                        {repaymentMethodLabel(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="repay-note">Note (optionnel)</Label>
                <Textarea
                  id="repay-note"
                  rows={2}
                  placeholder="Référence reçu, commentaire…"
                  value={repaymentNote}
                  onChange={(e) => setRepaymentNote(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRepaymentOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={handleRepayment}
                disabled={isProcessing || !repaymentAmount || !canAct}
                className="bg-primary"
              >
                {isProcessing ? "Validation…" : "Confirmer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isLimitOpen} onOpenChange={setIsLimitOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Plafond de crédit</DialogTitle>
              <DialogDescription>
                Montant maximum d’encours autorisé pour {selectedClient?.name ?? "ce client"} (ventes à crédit).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="credit-limit">Plafond (GNF)</Label>
                <Input
                  id="credit-limit"
                  type="number"
                  min={0}
                  step={1}
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Encours actuel : {selectedClient?.currentDebt?.toLocaleString() ?? 0} GNF
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsLimitOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleLimitSave} disabled={isProcessing} className="bg-primary">
                {isProcessing ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
