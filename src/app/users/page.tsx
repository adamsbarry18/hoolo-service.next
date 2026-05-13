
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  UserPlus, 
  Shield, 
  Mail,
  Phone,
  MoreVertical, 
  Edit, 
  Trash2, 
  Loader2,
  Check,
} from "lucide-react";
import { useCollection, useFirestore, useUser, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, doc, deleteDoc, updateDoc, serverTimestamp, deleteField } from "firebase/firestore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { TableColumnDef } from "@/hooks/use-table-column-visibility";
import { useTableColumnVisibility } from "@/hooks/use-table-column-visibility";
import { TableColumnToggle } from "@/components/table/table-column-toggle";
import { ListSearchBar } from "@/components/table/list-search-bar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { rowMatchesSearch } from "@/lib/list-search";
import { toUserFacingErrorMessage } from "@/lib/user-facing-error";

const USERS_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "user", label: "Utilisateur", required: true },
  { id: "role", label: "Rôle" },
  { id: "contact", label: "Contact", defaultVisible: false },
  {
    id: "actions",
    label: "Actions",
    required: true,
    headerClassName: "text-right",
  },
];

type UserRow = {
  id: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  role?: string;
  boutiqueId?: string;
  email?: string;
};

/** Nom affiché : firstName + lastName, ou displayName hérité. */
function userFullName(u: UserRow): string {
  const f = (u.firstName ?? "").trim();
  const l = (u.lastName ?? "").trim();
  if (f || l) return [f, l].filter(Boolean).join(" ");
  return (u.displayName ?? "").trim() || "Sans nom";
}

function userInitial(u: UserRow): string {
  const name = userFullName(u);
  return name.substring(0, 1).toUpperCase() || "?";
}

function buildDisplayName(firstName: string, lastName: string, email: string): string {
  const full = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  if (full) return full;
  return email.trim().split("@")[0] || "";
}

/** Remplit prénom / nom depuis les champs explicites ou l’ancien displayName. */
function nameFieldsFromUser(u: UserRow): { firstName: string; lastName: string } {
  const fn = (u.firstName ?? "").trim();
  const ln = (u.lastName ?? "").trim();
  if (fn || ln) return { firstName: fn, lastName: ln };
  const raw = (u.displayName ?? "").trim();
  if (!raw) return { firstName: "", lastName: "" };
  const parts = raw.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0] as string, lastName: parts.slice(1).join(" ") };
}

function renderUserCells(
  col: TableColumnDef,
  u: UserRow,
  ctx: { onEdit: (user: UserRow) => void; onDelete: (id: string) => void }
) {
  switch (col.id) {
    case "user":
      return (
        <TableCell key={col.id}>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              {userInitial(u)}
            </div>
            <span className="font-semibold">{userFullName(u)}</span>
          </div>
        </TableCell>
      );
    case "role":
      return (
        <TableCell key={col.id}>
          <Badge variant={u.role === "Admin" ? "default" : "secondary"}>
            {u.role === "Admin" ? <Shield className="h-3 w-3 mr-1" /> : null}
            {u.role}
          </Badge>
        </TableCell>
      );
    case "contact":
      return (
        <TableCell key={col.id}>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Mail size={12} className="shrink-0" />
              <span className="truncate">{u.email}</span>
            </div>
            {u.phoneNumber?.trim() ? (
              <div className="flex items-center gap-2">
                <Phone size={12} className="shrink-0" />
                <span>{u.phoneNumber.trim()}</span>
              </div>
            ) : null}
          </div>
        </TableCell>
      );
    case "actions":
      return (
        <TableCell key={col.id} className="text-right">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => {
                  window.setTimeout(() => ctx.onEdit(u), 0);
                }}
              >
                <Edit className="mr-2 h-4 w-4" /> Modifier
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-rose-600 focus:text-rose-600"
                onSelect={() => {
                  window.setTimeout(() => ctx.onDelete(u.id), 0);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      );
    default:
      return null;
  }
}

export default function UsersPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "Admin" | "Vendeur">("all");
  /** Hôte du portail Radix Select dans la modale (évite aria-hidden + gel au fermeture). */
  const [dialogFormEl, setDialogFormEl] = useState<HTMLFormElement | null>(null);

  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    phoneNumber: "",
    role: "Vendeur",
  });

  const firestore = useFirestore();
  const { profile } = useUser();
  const { toast } = useToast();

  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'users'), orderBy('displayName', 'asc'));
  }, [firestore]);

  const { data: users, isLoading } = useCollection(usersQuery);

  const { visibility, setColumnVisible, visibleColumns } = useTableColumnVisibility(
    "hoolo:table:users:v3",
    USERS_TABLE_COLUMNS
  );
  const colSpan = visibleColumns.length;

  const handleOpenEditDialog = (user: UserRow) => {
    setSelectedUser(user);
    const { firstName, lastName } = nameFieldsFromUser(user);
    setFormData({
      email: user.email || "",
      firstName,
      lastName,
      phoneNumber: (user.phoneNumber ?? "").trim(),
      role: user.role || "Vendeur",
    });
    setIsDialogOpen(true);
  };

  const handleUserDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setSelectedUser(null);
      setDialogFormEl(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !selectedUser) return;
    setIsSubmitting(true);

    try {
      const displayName = buildDisplayName(
        formData.firstName,
        formData.lastName,
        formData.email
      );
      const payload = {
        email: formData.email.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        displayName,
        role: formData.role,
      };

      const userRef = doc(firestore, "users", selectedUser.id);
      await updateDoc(userRef, {
        ...payload,
        boutiqueId: deleteField(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Utilisateur mis à jour" });
      handleUserDialogOpenChange(false);
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

  const handleDelete = async (userId: string) => {
    if (!firestore || !window.confirm("Supprimer cet utilisateur ?")) return;
    try {
      await deleteDoc(doc(firestore, 'users', userId));
      toast({ title: "Utilisateur supprimé" });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Suppression impossible",
        description: toUserFacingErrorMessage(error),
      });
    }
  };

  const debouncedSearch = useDebouncedValue(searchTerm, 280);

  const filteredUsers = useMemo(() => {
    if (!users?.length) return null;
    return users.filter((u) => {
      if (roleFilter !== "all" && (u.role || "") !== roleFilter) return false;
      const { firstName, lastName } = nameFieldsFromUser(u);
      return rowMatchesSearch(debouncedSearch, [
        firstName,
        lastName,
        u.displayName,
        u.email,
        u.phoneNumber,
        u.id,
        u.role,
      ]);
    });
  }, [users, debouncedSearch, roleFilter]);

  const resultHint =
    users?.length != null && filteredUsers
      ? `${filteredUsers.length} / ${users.length}`
      : undefined;

  if (profile?.role !== "Admin") {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
          <Shield size={48} className="text-rose-500" />
          <h2 className="text-2xl font-bold">Accès Restreint</h2>
          <p className="text-muted-foreground">Seuls les administrateurs peuvent gérer le personnel.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-primary sm:text-3xl">Gestion du Personnel</h1>
            <p className="mt-1 text-pretty text-sm text-muted-foreground sm:text-base">
              Administrez les comptes utilisateurs et leurs permissions.
            </p>
          </div>
          <Button asChild className="w-full shrink-0 bg-primary sm:w-auto">
            <Link href="/users/new">
              <UserPlus className="mr-2 h-4 w-4" /> Ajouter un Utilisateur
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm md:flex-row md:flex-wrap md:items-center">
          <ListSearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Nom, e-mail, téléphone, rôle…"
            resultHint={resultHint ? `${resultHint} utilisateur(s)` : undefined}
            className="md:flex-1"
          />
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
            <SelectTrigger className="h-10 w-full md:w-[180px]">
              <SelectValue placeholder="Rôle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les rôles</SelectItem>
              <SelectItem value="Admin">Administrateurs</SelectItem>
              <SelectItem value="Vendeur">Vendeurs</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <CardTitle>Liste des Utilisateurs</CardTitle>
            <TableColumnToggle
              columns={USERS_TABLE_COLUMNS}
              visibility={visibility}
              onColumnVisibleChange={setColumnVisible}
              className="w-full sm:w-auto"
            />
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
                    <TableCell colSpan={colSpan} className="text-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : !filteredUsers?.length ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} className="text-center py-10 text-muted-foreground">
                      {users?.length
                        ? "Aucun utilisateur ne correspond à ces critères."
                        : "Aucun utilisateur."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      {visibleColumns.map((col) =>
                        renderUserCells(col, u, {
                          onEdit: handleOpenEditDialog,
                          onDelete: handleDelete,
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

        <Dialog open={isDialogOpen} onOpenChange={handleUserDialogOpenChange}>
          <DialogContent className="sm:max-w-lg z-[100]">
            <DialogHeader>
              <DialogTitle>Modifier l&apos;utilisateur</DialogTitle>
              <DialogDescription>
                Modifiez l’identité, le contact et les permissions de l’employé.
              </DialogDescription>
            </DialogHeader>
            <form
              ref={setDialogFormEl}
              onSubmit={handleSubmit}
              className="space-y-4 py-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Prénom</Label>
                  <Input
                    id="firstName"
                    required
                    autoComplete="given-name"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Nom</Label>
                  <Input
                    id="lastName"
                    required
                    autoComplete="family-name"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Téléphone (optionnel)</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+224 …"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  disabled
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Rôle</Label>
                <Select
                  value={formData.role}
                  onValueChange={(val) => setFormData({ ...formData, role: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un rôle" />
                  </SelectTrigger>
                  <SelectContent container={dialogFormEl} className="z-[200]">
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Vendeur">Vendeur</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  L’accès aux boutiques ne dépend plus du compte : chaque utilisateur choisit le magasin actif dans l’en-tête.
                </p>
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="ghost" onClick={() => handleUserDialogOpenChange(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Enregistrer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
