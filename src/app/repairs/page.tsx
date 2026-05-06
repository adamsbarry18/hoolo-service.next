"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus,
  Wrench,
  Loader2,
  Smartphone,
  Hash,
  Clock,
  User,
  Package,
  FileText,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useUser, useCollection, useMemoFirebase } from "@/firebase";
import { useBoutiqueScope } from "@/contexts/boutique-scope";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { createRepair, updateRepairStatus, type RepairStatus } from "@/firebase/services/repair-service";
import { generatePDF, PDFData } from "@/lib/pdf-service";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TableColumnDef } from "@/hooks/use-table-column-visibility";
import { useTableColumnVisibility } from "@/hooks/use-table-column-visibility";
import { TableColumnToggle } from "@/components/table/table-column-toggle";
import { ListSearchBar } from "@/components/table/list-search-bar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { rowMatchesSearch } from "@/lib/list-search";
import { RepairDetailDialog, type RepairDetailRow } from "@/components/repairs/repair-detail-dialog";

const DEVICE_TYPES = ["Smartphone", "Tablette", "Ordinateur", "Accessoire", "Console", "Autre"];

const STATUS_LABELS: Record<RepairStatus, { label: string; color: string }> = {
  reçu: { label: "Reçu", color: "bg-slate-100 text-slate-700" },
  en_diagnostic: { label: "Diagnostic", color: "bg-orange-100 text-orange-700" },
  devis_envoyé: { label: "Devis envoyé", color: "bg-blue-100 text-blue-700" },
  en_cours: { label: "En réparation", color: "bg-indigo-100 text-indigo-700" },
  terminé: { label: "Terminé", color: "bg-emerald-100 text-emerald-700" },
  prêt_à_retirer: { label: "Prêt à retirer", color: "bg-emerald-500 text-white" },
  retiré: { label: "Retiré", color: "bg-gray-100 text-gray-500" },
  annulé: { label: "Annulé", color: "bg-rose-100 text-rose-700" },
};

const REPAIRS_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "sheet", label: "N° fiche", defaultVisible: false },
  { id: "client_device", label: "Client & appareil", required: true },
  { id: "status", label: "Statut" },
  { id: "cost", label: "Coût total", mobileVisible: false },
  { id: "updated", label: "Dernière MAJ", defaultVisible: false },
  {
    id: "actions",
    label: "Actions",
    required: true,
    headerClassName: "text-right",
  },
];

type RepairRow = RepairDetailRow;

function renderRepairCells(
  col: TableColumnDef,
  repair: RepairRow,
  ctx: {
    onStatusChange: (id: string, status: RepairStatus) => void;
    onPrint: (r: RepairRow) => void;
    onDetail: (r: RepairRow) => void;
  }
) {
  switch (col.id) {
    case "sheet":
      return (
        <TableCell key={col.id} className="font-mono text-xs font-bold">
          {repair.id.substring(0, 8)}
        </TableCell>
      );
    case "client_device":
      return (
        <TableCell key={col.id}>
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">{repair.customerName}</span>
            <span className="text-xs text-muted-foreground">
              {repair.deviceType ? `${repair.deviceType} · ` : ""}
              {repair.deviceBrand} {repair.deviceModel}
            </span>
            {repair.serialNumber && (
              <span className="text-[10px] text-muted-foreground">IMEI / S/N : {repair.serialNumber}</span>
            )}
          </div>
        </TableCell>
      );
    case "status":
      return (
        <TableCell key={col.id}>
          <Select
            value={repair.status}
            onValueChange={(val) => ctx.onStatusChange(repair.id, val as RepairStatus)}
          >
            <SelectTrigger
              className={`h-auto min-h-9 w-full max-w-[200px] whitespace-normal py-1.5 text-left ${STATUS_LABELS[repair.status as RepairStatus]?.color || ""}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(STATUS_LABELS) as [RepairStatus, { label: string }][]).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
      );
    case "cost":
      return (
        <TableCell key={col.id}>
          <div className="flex flex-col gap-0.5 font-mono text-sm">
            <span className="font-bold text-primary">{(repair.totalCost ?? 0).toLocaleString()} GNF</span>
            <span className="text-[10px] text-muted-foreground">
              MO {(repair.laborCost ?? 0).toLocaleString()} + pièces{" "}
              {(repair.partsCost ?? 0).toLocaleString()}
            </span>
          </div>
        </TableCell>
      );
    case "updated":
      return (
        <TableCell key={col.id} className="text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock size={12} />
            {repair.updatedAt?.toDate
              ? repair.updatedAt.toDate().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
              : "-"}
          </div>
        </TableCell>
      );
    case "actions":
      return (
        <TableCell key={col.id} className="text-right">
          <div className="flex flex-wrap justify-end gap-1">
            <Button variant="outline" size="sm" className="h-8" type="button" onClick={() => ctx.onDetail(repair)}>
              <Eye size={14} className="mr-1" /> Fiche
            </Button>
            <Button variant="ghost" size="icon" type="button" onClick={() => ctx.onPrint(repair)} aria-label="PDF">
              <FileText size={16} className="text-muted-foreground" />
            </Button>
          </div>
        </TableCell>
      );
    default:
      return null;
  }
}

const ACTIVE_STATUSES: RepairStatus[] = ["reçu", "en_diagnostic", "devis_envoyé", "en_cours"];

function RepairsPageInner() {
  const [isAdding, setIsAdding] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newRepair, setNewRepair] = useState({
    customerName: "",
    phoneNumber: "",
    deviceBrand: "",
    deviceModel: "",
    serialNumber: "",
    issueDescription: "",
    laborCost: 0,
    deviceType: "Smartphone",
    internalNotes: "",
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RepairStatus>("all");

  const firestore = useFirestore();
  const { user } = useUser();
  const { activeBoutiqueId } = useBoutiqueScope();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const boutiqueId = activeBoutiqueId;

  const repairsQuery = useMemoFirebase(() => {
    if (!firestore || !boutiqueId) return null;
    return query(collection(firestore, "boutiques", boutiqueId, "repairs"), orderBy("updatedAt", "desc"), limit(120));
  }, [firestore, boutiqueId]);

  const productsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "products"), orderBy("name", "asc"));
  }, [firestore]);

  const stocksQuery = useMemoFirebase(() => {
    if (!firestore || !boutiqueId) return null;
    return query(collection(firestore, "boutiques", boutiqueId, "stocks"));
  }, [firestore, boutiqueId]);

  const { data: repairs, isLoading } = useCollection(repairsQuery);
  const { data: products } = useCollection(productsQuery);
  const { data: stocks } = useCollection(stocksQuery);

  const detailRepair = useMemo((): RepairRow | null => {
    if (!detailId || !repairs?.length) return null;
    return (repairs.find((r) => r.id === detailId) as RepairRow) ?? null;
  }, [detailId, repairs]);

  useEffect(() => {
    const rid = searchParams.get("repair");
    if (!rid || !repairs?.length) return;
    if (repairs.some((r) => r.id === rid)) {
      setDetailId(rid);
    }
  }, [searchParams, repairs]);

  const clearRepairDeepLink = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    if (!sp.has("repair")) return;
    sp.delete("repair");
    const q = sp.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [router, searchParams, pathname]);

  const { visibility, setColumnVisible, visibleColumns } = useTableColumnVisibility(
    "hoolo:table:repairs:v3",
    REPAIRS_TABLE_COLUMNS
  );
  const colSpan = visibleColumns.length;

  const handleCreateRepair = async () => {
    if (!newRepair.customerName?.trim() || !newRepair.deviceModel?.trim()) {
      toast({
        variant: "destructive",
        title: "Champs requis",
        description: "Client et modèle d’appareil sont obligatoires.",
      });
      return;
    }
    if (!boutiqueId || !user) {
      toast({ variant: "destructive", title: "Session", description: "Boutique ou utilisateur manquant." });
      return;
    }
    if (!newRepair.issueDescription?.trim()) {
      toast({ variant: "destructive", title: "Problème requis", description: "Décrivez la panne signalée." });
      return;
    }

    try {
      await createRepair(firestore, {
        boutiqueId,
        userId: user.uid,
        customerName: newRepair.customerName,
        phoneNumber: newRepair.phoneNumber,
        deviceBrand: newRepair.deviceBrand,
        deviceModel: newRepair.deviceModel,
        deviceType: newRepair.deviceType,
        serialNumber: newRepair.serialNumber,
        issueDescription: newRepair.issueDescription,
        laborCost: newRepair.laborCost,
        internalNotes: newRepair.internalNotes,
      });
      toast({ title: "Fiche créée", description: "Prise en charge enregistrée (statut : reçu)." });
      setIsAdding(false);
      setNewRepair({
        customerName: "",
        phoneNumber: "",
        deviceBrand: "",
        deviceModel: "",
        serialNumber: "",
        issueDescription: "",
        laborCost: 0,
        deviceType: "Smartphone",
        internalNotes: "",
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur",
      });
    }
  };

  const handleStatusChange = async (repairId: string, status: RepairStatus) => {
    if (!boutiqueId) return;
    try {
      await updateRepairStatus(firestore, boutiqueId, repairId, status);
      toast({
        title: "Statut mis à jour",
        description: `Étape : ${STATUS_LABELS[status].label}`,
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur",
      });
    }
  };

  const handlePrintRepair = (repair: RepairRow) => {
    const pdfData: PDFData = {
      title: "Fiche réparation",
      id: repair.id.substring(0, 8).toUpperCase(),
      date: new Date().toLocaleDateString("fr-FR"),
      clientName: repair.customerName ?? "",
      clientPhone: repair.phoneNumber,
      boutiqueName: boutiqueId ? `Boutique ${boutiqueId}` : "Hoolo Service",
      items: [
        {
          description: `Réparation ${repair.deviceType ?? ""} ${repair.deviceBrand ?? ""} ${repair.deviceModel ?? ""} - ${repair.issueDescription ?? ""}`,
          quantity: 1,
          unitPrice: repair.laborCost ?? 0,
          total: repair.laborCost ?? 0,
        },
      ],
      totalAmount: repair.totalCost ?? repair.laborCost ?? 0,
      notes: [
        `Pièces (estimé dossier) : ${(repair.partsCost ?? 0).toLocaleString()} GNF`,
        `IMEI/SN : ${repair.serialNumber || "N/A"}`,
        `Statut : ${STATUS_LABELS[repair.status as RepairStatus]?.label ?? repair.status}`,
        repair.internalNotes ? `Notes atelier : ${repair.internalNotes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
    generatePDF(pdfData);
  };

  const debouncedSearch = useDebouncedValue(searchTerm, 280);

  const filteredRepairs = useMemo(() => {
    if (!repairs?.length) return null;
    return repairs.filter((r) => {
      const row = r as RepairRow;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return rowMatchesSearch(debouncedSearch, [
        row.customerName,
        row.phoneNumber,
        row.deviceBrand,
        row.deviceModel,
        row.deviceType,
        row.serialNumber,
        row.id,
        row.issueDescription,
        row.internalNotes,
      ]);
    });
  }, [repairs, debouncedSearch, statusFilter]);

  const resultHint =
    repairs?.length != null && filteredRepairs
      ? `${filteredRepairs.length} / ${repairs.length}`
      : undefined;

  const activePipeline = useMemo(
    () => repairs?.filter((r) => ACTIVE_STATUSES.includes(r.status as RepairStatus)).length ?? 0,
    [repairs]
  );

  const readyCount = useMemo(() => repairs?.filter((r) => r.status === "prêt_à_retirer").length ?? 0, [repairs]);

  if (!boutiqueId) {
    return (
      <AppLayout>
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench /> Réparations
            </CardTitle>
            <CardDescription>
              Choisissez un magasin dans le menu « Boutique active » en haut de l’écran, ou créez une boutique depuis
              l’administration.
            </CardDescription>
          </CardHeader>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-primary sm:text-3xl">Atelier réparation</h1>
            <p className="mt-1 text-pretty text-sm text-muted-foreground sm:text-base">
              Prise en charge, diagnostic, pièces depuis le stock et statuts jusqu’à la remise au client.
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button variant="outline" className="w-full sm:w-auto" asChild>
              <Link href="/inventory">
                <Package className="mr-2 h-4 w-4" /> Stocks &amp; pièces
              </Link>
            </Button>
            <Button
              className="w-full bg-primary hover:bg-primary/90 sm:w-auto"
              type="button"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="mr-2 h-4 w-4" /> Nouvelle fiche
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Dossiers actifs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{activePipeline}</div>
              <p className="text-xs text-muted-foreground">Reçu → en cours</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-emerald-50/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-emerald-900">Prêts à retirer</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-950">{readyCount}</div>
              <p className="text-xs text-emerald-800">Notifier le client</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Fiches chargées</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{repairs?.length ?? 0}</div>
              <p className="text-xs text-muted-foreground">120 dernières mises à jour</p>
            </CardContent>
          </Card>
        </div>

        <Dialog open={isAdding} onOpenChange={setIsAdding}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Ouverture de fiche</DialogTitle>
              <DialogDescription>Client, appareil et symptômes. Les pièces se ajoutent ensuite depuis la fiche détaillée.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-2">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nom du client *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-10"
                      placeholder="Ex. Jean Dupont"
                      value={newRepair.customerName}
                      onChange={(e) => setNewRepair({ ...newRepair, customerName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input
                    placeholder="+224 …"
                    value={newRepair.phoneNumber}
                    onChange={(e) => setNewRepair({ ...newRepair, phoneNumber: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type d’appareil</Label>
                  <Select
                    value={newRepair.deviceType}
                    onValueChange={(v) => setNewRepair({ ...newRepair, deviceType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEVICE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Marque</Label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-10"
                      placeholder="Apple, Samsung…"
                      value={newRepair.deviceBrand}
                      onChange={(e) => setNewRepair({ ...newRepair, deviceBrand: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Modèle *</Label>
                  <Input
                    placeholder="iPhone 13, Galaxy A54…"
                    value={newRepair.deviceModel}
                    onChange={(e) => setNewRepair({ ...newRepair, deviceModel: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>IMEI / n° série</Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-10"
                      placeholder="IMEI ou S/N"
                      value={newRepair.serialNumber}
                      onChange={(e) => setNewRepair({ ...newRepair, serialNumber: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Problème signalé par le client *</Label>
                <Textarea
                  placeholder="Écran cassé, ne charge pas, surchauffe…"
                  value={newRepair.issueDescription}
                  onChange={(e) => setNewRepair({ ...newRepair, issueDescription: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Notes atelier (interne, optionnel)</Label>
                <Textarea
                  rows={2}
                  className="text-sm"
                  placeholder="Observations de réception, éléments à vérifier…"
                  value={newRepair.internalNotes}
                  onChange={(e) => setNewRepair({ ...newRepair, internalNotes: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Estimation main d’œuvre (GNF)</Label>
                <Input
                  type="number"
                  min={0}
                  value={newRepair.laborCost || ""}
                  onChange={(e) => setNewRepair({ ...newRepair, laborCost: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" type="button" onClick={() => setIsAdding(false)}>
                Annuler
              </Button>
              <Button className="bg-primary" type="button" onClick={handleCreateRepair}>
                Enregistrer la prise en charge
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
          <ListSearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Client, tél., appareil, IMEI, notes, n° fiche…"
            resultHint={resultHint ? `${resultHint} fiche(s)` : undefined}
            className="sm:flex-1"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="h-10 w-full sm:w-[220px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {(Object.keys(STATUS_LABELS) as RepairStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TableColumnToggle
            columns={REPAIRS_TABLE_COLUMNS}
            visibility={visibility}
            onColumnVisibleChange={setColumnVisible}
            className="w-full sm:w-auto"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Interventions</CardTitle>
            <CardDescription>
              Modifier le statut depuis le tableau ou ouvrir la fiche pour pièces, montants et notes détaillées.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
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
                      <TableCell colSpan={colSpan} className="py-10 text-center">
                        <Loader2 className="mx-auto inline h-6 w-6 animate-spin" />
                      </TableCell>
                    </TableRow>
                  ) : !filteredRepairs?.length ? (
                    <TableRow>
                      <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                        {repairs?.length ? "Aucune fiche ne correspond à ces critères." : "Aucune fiche pour cette boutique."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRepairs.map((repair) => (
                      <TableRow key={repair.id} className="hover:bg-muted/30">
                        {visibleColumns.map((col) =>
                          renderRepairCells(col, repair as RepairRow, {
                            onStatusChange: handleStatusChange,
                            onPrint: handlePrintRepair,
                            onDetail: (r) => setDetailId(r.id),
                          })
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <RepairDetailDialog
          open={!!detailId}
          onOpenChange={(open) => {
            if (!open) {
              setDetailId(null);
              clearRepairDeepLink();
            }
          }}
          repair={detailRepair}
          boutiqueId={boutiqueId}
          products={products ?? undefined}
          stocks={stocks ?? undefined}
          statusMap={STATUS_LABELS}
          onStatusChange={handleStatusChange}
        />
      </div>
    </AppLayout>
  );
}

export default function RepairsPage() {
  return (
    <Suspense
      fallback={
        <AppLayout>
          <div className="flex h-[40vh] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Chargement de l’atelier…</p>
          </div>
        </AppLayout>
      }
    >
      <RepairsPageInner />
    </Suspense>
  );
}
