
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Phone,
  Mail,
  CreditCard,
  History,
  UserPlus,
  MoreVertical,
  Loader2,
  Trash2,
  Plus,
  Pencil,
  TrendingDown,
  UserCheck,
} from "lucide-react";
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase";
import { useBoutiqueScope } from "@/contexts/boutique-scope";
import {
  collection,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
  where,
  limit,
} from "firebase/firestore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListSearchBar } from "@/components/table/list-search-bar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { rowMatchesSearch } from "@/lib/list-search";
import { creditUsagePercent } from "@/firebase/services/credit-service";
import { updateClientProfile } from "@/firebase/services/client-service";
import type { TableColumnDef } from "@/hooks/use-table-column-visibility";
import { useTableColumnVisibility } from "@/hooks/use-table-column-visibility";
import { TableColumnToggle } from "@/components/table/table-column-toggle";
import { useToast } from "@/hooks/use-toast";
import { toUserFacingErrorMessage } from "@/lib/user-facing-error";

const CUSTOMERS_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "client", label: "Client", required: true },
  { id: "contact", label: "Contact", mobileVisible: false },
  { id: "debt", label: "Encours" },
  { id: "limit", label: "Plafond", defaultVisible: false },
  { id: "notes", label: "Notes", defaultVisible: false, mobileVisible: false },
  { id: "status", label: "Statut", defaultVisible: false },
  {
    id: "actions",
    label: "Actions",
    required: true,
    headerClassName: "text-right",
  },
];

type CustomerRow = {
  id: string;
  name?: string;
  phoneNumber?: string;
  email?: string;
  notes?: string;
  currentDebt?: number;
  creditLimit?: number;
};

type CreditFilter = "all" | "debt" | "risk" | "healthy";

function CustomerRowActions({
  client,
  profile,
  onDelete,
  onEdit,
  onHistory,
}: {
  client: CustomerRow;
  profile: { role?: string } | null | undefined;
  onDelete: (id: string) => void;
  onEdit: (c: CustomerRow) => void;
  onHistory: (c: CustomerRow) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Actions client">
          <MoreVertical size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem className="cursor-pointer" onClick={() => onEdit(client)}>
          <Pencil className="mr-2 h-4 w-4" /> Modifier
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/credits" className="flex cursor-pointer items-center">
            <CreditCard className="mr-2 h-4 w-4" /> Crédits
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={`/sales?client=${encodeURIComponent(client.id)}`}
            className="flex cursor-pointer items-center"
          >
            <UserCheck className="mr-2 h-4 w-4" /> Nouvelle vente
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" onClick={() => onHistory(client)}>
          <History className="mr-2 h-4 w-4" /> Ventes (ce magasin)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-rose-600 focus:text-rose-600"
          onClick={() => onDelete(client.id)}
          disabled={profile?.role !== "Admin"}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function creditStatusLabel(client: CustomerRow): { label: string; className: string } {
  const debt = client.currentDebt || 0;
  const lim = client.creditLimit || 0;
  const usage = creditUsagePercent(client);

  if (lim <= 0 && debt > 0) {
    return {
      label: "Encours sans plafond",
      className: "border-amber-200 bg-amber-50 text-amber-900",
    };
  }
  if (lim <= 0 && debt <= 0) {
    return { label: "Sans encours", className: "border-muted bg-muted/50 text-muted-foreground" };
  }
  if (usage >= 100) {
    return { label: "Bloqué", className: "border-rose-200 bg-rose-100 text-rose-800" };
  }
  if (usage > 80) {
    return { label: "Risque", className: "border-orange-200 bg-orange-100 text-orange-800" };
  }
  return { label: "Sain", className: "border-emerald-200 bg-emerald-100 text-emerald-800" };
}

function renderCustomerCells(
  col: TableColumnDef,
  client: CustomerRow,
  profile: { role?: string } | null | undefined,
  onDelete: (id: string) => void,
  onEdit: (c: CustomerRow) => void,
  onHistory: (c: CustomerRow) => void
) {
  const phone = client.phoneNumber?.trim();
  const email = client.email?.trim();

  switch (col.id) {
    case "client":
      return (
        <TableCell key={col.id}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
              {(client.name?.trim() || "?").substring(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">{client.name?.trim() || "Sans nom"}</p>
              <p className="text-[10px] text-muted-foreground">Réf. {client.id.substring(0, 8)}…</p>
            </div>
          </div>
        </TableCell>
      );
    case "contact":
      return (
        <TableCell key={col.id}>
          {!phone && !email ? (
            <span className="text-muted-foreground text-xs">-</span>
          ) : (
            <div className="space-y-1">
              {phone ? (
                <div className="flex items-center gap-2 text-xs">
                  <Phone size={12} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{phone}</span>
                </div>
              ) : null}
              {email ? (
                <div className="flex items-center gap-2 text-xs">
                  <Mail size={12} className="shrink-0 text-muted-foreground" />
                  <span className="max-w-[180px] truncate">{email}</span>
                </div>
              ) : null}
            </div>
          )}
        </TableCell>
      );
    case "debt": {
      const debt = client.currentDebt || 0;
      const debtClass =
        debt <= 0
          ? "font-mono font-semibold tabular-nums text-muted-foreground"
          : "font-mono font-bold tabular-nums text-rose-600";
      return (
        <TableCell key={col.id} className={debtClass}>
          {debt.toLocaleString()} GNF
        </TableCell>
      );
    }
    case "limit":
      return (
        <TableCell key={col.id} className="font-mono text-muted-foreground text-sm">
          {(client.creditLimit || 0) > 0
            ? `${(client.creditLimit || 0).toLocaleString()} GNF`
            : "Non défini"}
        </TableCell>
      );
    case "notes":
      return (
        <TableCell key={col.id} className="max-w-[200px]">
          {client.notes?.trim() ? (
            <span className="line-clamp-2 text-xs text-muted-foreground">{client.notes.trim()}</span>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          )}
        </TableCell>
      );
    case "status": {
      const st = creditStatusLabel(client);
      return (
        <TableCell key={col.id}>
          <Badge variant="outline" className={st.className}>
            {st.label}
          </Badge>
        </TableCell>
      );
    }
    case "actions":
      return (
        <TableCell key={col.id} className="text-right">
          <CustomerRowActions
            client={client}
            profile={profile}
            onDelete={onDelete}
            onEdit={onEdit}
            onHistory={onHistory}
          />
        </TableCell>
      );
    default:
      return null;
  }
}

type SaleRow = {
  id: string;
  clientId?: string;
  totalAmount?: number;
  paymentType?: string;
  status?: string;
  saleDate?: { toDate?: () => Date };
};

export default function CustomersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [creditFilter, setCreditFilter] = useState<CreditFilter>("all");
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newClient, setNewClient] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    creditLimit: 0,
    notes: "",
  });
  const [editOpen, setEditOpen] = useState(false);
  const [editClient, setEditClient] = useState<CustomerRow | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    creditLimit: 0,
    notes: "",
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySubject, setHistorySubject] = useState<CustomerRow | null>(null);

  const firestore = useFirestore();
  const { profile } = useUser();
  const { activeBoutiqueId } = useBoutiqueScope();
  const { toast } = useToast();
  const boutiqueId = activeBoutiqueId?.trim() || "";

  const clientsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "clients"), orderBy("name", "asc"));
  }, [firestore]);

  const { data: clients, isLoading } = useCollection(clientsQuery);

  const clientSalesQuery = useMemoFirebase(() => {
    if (!firestore || !boutiqueId || !historyOpen || !historySubject?.id) return null;
    return query(
      collection(firestore, "boutiques", boutiqueId, "sales"),
      where("clientId", "==", historySubject.id),
      limit(50)
    );
  }, [firestore, boutiqueId, historyOpen, historySubject?.id]);

  const { data: clientSalesRaw, isLoading: loadingClientSales } = useCollection(clientSalesQuery);

  const clientSalesSorted = useMemo(() => {
    if (!clientSalesRaw?.length) return [];
    return [...clientSalesRaw].sort((a, b) => {
      const ta = (a as SaleRow).saleDate?.toDate?.()?.getTime() ?? 0;
      const tb = (b as SaleRow).saleDate?.toDate?.()?.getTime() ?? 0;
      return tb - ta;
    }) as SaleRow[];
  }, [clientSalesRaw]);

  const openEdit = (c: CustomerRow) => {
    setEditClient(c);
    setEditForm({
      name: c.name ?? "",
      email: c.email ?? "",
      phoneNumber: c.phoneNumber ?? "",
      creditLimit: c.creditLimit ?? 0,
      notes: typeof c.notes === "string" ? c.notes : "",
    });
    setEditOpen(true);
  };

  const openHistory = (c: CustomerRow) => {
    if (!boutiqueId) {
      toast({
        variant: "destructive",
        title: "Boutique requise",
        description: "Choisissez un magasin dans le menu en haut de l’écran.",
      });
      return;
    }
    setHistorySubject(c);
    setHistoryOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !editClient) return;
    setIsSubmitting(true);
    try {
      await updateClientProfile(firestore, editClient.id, {
        name: editForm.name,
        email: editForm.email,
        phoneNumber: editForm.phoneNumber,
        creditLimit: editForm.creditLimit,
        notes: editForm.notes,
      });
      toast({ title: "Fiche mise à jour", description: editForm.name.trim() });
      setEditOpen(false);
      setEditClient(null);
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

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore) return;

    if (!newClient.name.trim() || !newClient.phoneNumber.trim()) {
      toast({
        variant: "destructive",
        title: "Champs requis",
        description: "Le nom et le téléphone sont obligatoires.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(firestore, "clients"), {
        name: newClient.name.trim(),
        email: newClient.email.trim(),
        phoneNumber: newClient.phoneNumber.trim(),
        creditLimit: Math.max(0, Math.floor(Number(newClient.creditLimit) || 0)),
        currentDebt: 0,
        notes: newClient.notes.trim() || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Client ajouté",
        description: `${newClient.name.trim()} a été enregistré.`,
      });

      setIsAdding(false);
      setNewClient({ name: "", email: "", phoneNumber: "", creditLimit: 0, notes: "" });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Ajout impossible",
        description: toUserFacingErrorMessage(error, "Impossible d’ajouter le client."),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!firestore) return;
    const row = clients?.find((c) => c.id === id);
    const debt = row?.currentDebt || 0;
    if (debt > 0) {
      toast({
        variant: "destructive",
        title: "Suppression impossible",
        description: "Enregistrez d’abord un remboursement pour solder l’encours de ce client.",
      });
      return;
    }
    if (!window.confirm("Supprimer définitivement cette fiche client ?")) return;
    try {
      await deleteDoc(doc(firestore, "clients", id));
      toast({ title: "Client supprimé" });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Suppression impossible",
        description: toUserFacingErrorMessage(error),
      });
    }
  };

  const { visibility, setColumnVisible, visibleColumns } = useTableColumnVisibility(
    "hoolo:table:customers:v3",
    CUSTOMERS_TABLE_COLUMNS
  );

  const debouncedSearch = useDebouncedValue(searchTerm, 280);

  const filteredClients = useMemo(() => {
    if (clients == null || clients === undefined) return null;
    if (clients.length === 0) return [];
    return clients.filter((c) => {
      const usage = creditUsagePercent(c);
      const debt = c.currentDebt || 0;
      if (creditFilter === "debt" && debt <= 0) return false;
      if (creditFilter === "risk" && !(usage > 80)) return false;
      if (creditFilter === "healthy" && !(usage <= 80)) return false;
      return rowMatchesSearch(debouncedSearch, [
        c.name,
        c.phoneNumber,
        c.email,
        c.id,
        typeof (c as CustomerRow).notes === "string" ? (c as CustomerRow).notes : "",
      ]);
    });
  }, [clients, debouncedSearch, creditFilter]);

  const resultHint =
    clients != null && filteredClients != null
      ? `${filteredClients.length}/${clients.length}`
      : undefined;

  const totalClients = clients?.length ?? 0;
  const withDebt = clients?.filter((c) => (c.currentDebt || 0) > 0).length ?? 0;
  const atRisk = clients?.filter((c) => creditUsagePercent(c) > 80).length ?? 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 max-w-full space-y-1">
            <h1 className="text-2xl font-bold leading-tight text-primary sm:text-3xl">Clients</h1>
            <p className="text-pretty text-sm text-muted-foreground sm:text-base">Coordonnées et encours crédit.</p>
          </div>
          <Dialog open={isAdding} onOpenChange={setIsAdding}>
            <DialogTrigger asChild>
              <Button className="w-full shrink-0 bg-primary sm:w-auto sm:self-center">
                <UserPlus className="mr-2 h-4 w-4" /> Nouveau client
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Nouveau client</DialogTitle>
                <DialogDescription>0 GNF au plafond = non renseigné (pas de suivi %).</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddClient} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="clientName">Nom complet *</Label>
                  <Input
                    id="clientName"
                    required
                    value={newClient.name}
                    onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                    placeholder="Ex. Mariam Barry"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="clientPhone">Téléphone *</Label>
                    <Input
                      id="clientPhone"
                      required
                      value={newClient.phoneNumber}
                      onChange={(e) => setNewClient({ ...newClient, phoneNumber: e.target.value })}
                      placeholder="+224 …"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clientEmail">E-mail</Label>
                    <Input
                      id="clientEmail"
                      type="email"
                      value={newClient.email}
                      onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                      placeholder="contact@…"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientLimit">Plafond crédit (GNF)</Label>
                  <Input
                    id="clientLimit"
                    type="number"
                    min={0}
                    step={1}
                    value={newClient.creditLimit}
                    onChange={(e) => setNewClient({ ...newClient, creditLimit: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientNotes">Notes</Label>
                  <Textarea
                    id="clientNotes"
                    rows={2}
                    value={newClient.notes}
                    onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                    placeholder="Interne - non visible client"
                  />
                </div>
                <DialogFooter className="gap-2 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsAdding(false)}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="min-w-[140px] bg-primary">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enregistrement…
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Créer
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 pt-5">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold tabular-nums">{totalClients}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-5">
              <div className="rounded-lg bg-rose-500/10 p-2 text-rose-700">
                <TrendingDown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Avec encours</p>
                <p className="text-2xl font-bold tabular-nums">{withDebt}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-2 lg:col-span-1">
            <CardContent className="flex items-center gap-3 pt-5">
              <div className="rounded-lg bg-orange-500/10 p-2 text-orange-800">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Risque (&gt;80&nbsp;%)</p>
                <p className="text-2xl font-bold tabular-nums">{atRisk}</p>
                <p className="text-[11px] text-muted-foreground">du plafond utilisé</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm lg:flex-row lg:flex-wrap lg:items-end">
          <ListSearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher nom, tél., e-mail…"
            resultHint={resultHint ? `${resultHint.replace("/", " / ")} clients` : undefined}
            className="min-w-0 lg:min-w-[200px] lg:flex-1"
          />
          <Select value={creditFilter} onValueChange={(v) => setCreditFilter(v as CreditFilter)}>
            <SelectTrigger className="h-10 w-full lg:w-[min(100%,14rem)]">
              <SelectValue placeholder="Filtre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="debt">Encours &gt; 0</SelectItem>
              <SelectItem value="risk">Plafond &gt; 80&nbsp;%</SelectItem>
              <SelectItem value="healthy">Plafond ≤ 80&nbsp;%</SelectItem>
            </SelectContent>
          </Select>
          <TableColumnToggle
            columns={CUSTOMERS_TABLE_COLUMNS}
            visibility={visibility}
            onColumnVisibleChange={setColumnVisible}
            className="w-full lg:ml-auto lg:w-auto"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Liste</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredClients != null && filteredClients.length === 0 && clients?.length === 0 ? (
              <div className="px-4 py-12 text-center text-muted-foreground">
                <p className="mb-4">Aucun client pour l’instant.</p>
                <Button type="button" className="bg-primary" onClick={() => setIsAdding(true)}>
                  <UserPlus className="mr-2 h-4 w-4" /> Nouveau client
                </Button>
              </div>
            ) : filteredClients != null && filteredClients.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground">
                Aucun résultat - élargissez le filtre ou la recherche.
              </p>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {filteredClients?.map((raw) => {
                    const client = raw as CustomerRow;
                    const debt = client.currentDebt || 0;
                    const debtClass =
                      debt <= 0
                        ? "font-semibold tabular-nums text-muted-foreground"
                        : "font-bold tabular-nums text-rose-600";
                    const phone = client.phoneNumber?.trim();
                    return (
                      <div key={client.id} className="rounded-lg border bg-card p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                            {(client.name?.trim() || "?").substring(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold leading-snug text-foreground">
                              {client.name?.trim() || "Sans nom"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Réf. {client.id.substring(0, 8)}…</p>
                            {phone ? (
                              <p className="mt-1 truncate text-xs text-muted-foreground">{phone}</p>
                            ) : null}
                          </div>
                          <CustomerRowActions
                            client={client}
                            profile={profile}
                            onDelete={handleDeleteClient}
                            onEdit={openEdit}
                            onHistory={openHistory}
                          />
                        </div>
                        <div className="mt-3 border-t pt-3">
                          <p className="text-xs text-muted-foreground">Encours</p>
                          <p className={`font-mono text-sm ${debtClass}`}>{debt.toLocaleString()} GNF</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block">
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
                      {filteredClients?.map((client) => (
                        <TableRow key={client.id}>
                          {visibleColumns.map((col) =>
                            renderCustomerCells(
                              col,
                              client as CustomerRow,
                              profile,
                              handleDeleteClient,
                              openEdit,
                              openHistory
                            )
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Modifier le client</DialogTitle>
              <DialogDescription>L’encours est mis à jour par les ventes.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditSave} className="space-y-3 py-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nom *</Label>
                <Input
                  id="edit-name"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Téléphone *</Label>
                  <Input
                    id="edit-phone"
                    required
                    value={editForm.phoneNumber}
                    onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">E-mail</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-limit">Plafond crédit (GNF)</Label>
                <Input
                  id="edit-limit"
                  type="number"
                  min={0}
                  step={1}
                  value={editForm.creditLimit}
                  onChange={(e) => setEditForm({ ...editForm, creditLimit: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-primary">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Ventes - {historySubject?.name?.trim() || "Client"}</DialogTitle>
              <DialogDescription>Magasin sélectionné en haut de page. Sans client lié, la vente n’apparaît pas ici.</DialogDescription>
            </DialogHeader>
            {loadingClientSales ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : clientSalesSorted.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Aucune vente enregistrée pour ce client dans ce magasin.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Règlement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientSalesSorted.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">
                        {s.saleDate?.toDate?.()?.toLocaleString("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }) ?? "-"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {(s.totalAmount ?? 0).toLocaleString()} GNF
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="font-normal">
                          {s.paymentType === "credit"
                            ? "Crédit"
                            : s.paymentType === "mobile_money"
                              ? "Mobile"
                              : s.paymentType === "cash"
                                ? "Espèces"
                                : (s.paymentType ?? "-")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <DialogFooter>
              <Button variant="outline" asChild>
                <Link href={historySubject ? `/sales?client=${encodeURIComponent(historySubject.id)}` : "/sales"}>
                  Ouvrir les ventes
                </Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
