'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Package,
  Loader2,
  Info,
} from 'lucide-react';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { useBoutiqueScope } from '@/contexts/boutique-scope';
import { collection, query, orderBy } from 'firebase/firestore';
import { validateTransfer, cancelTransfer } from '@/firebase/services/transfer-service';
import { useToast } from '@/hooks/use-toast';
import { toUserFacingErrorMessage } from '@/lib/user-facing-error';
import { CreateTransferDialog } from '@/components/transfers/CreateTransferDialog';
import type { TableColumnDef } from '@/hooks/use-table-column-visibility';
import { useTableColumnVisibility } from '@/hooks/use-table-column-visibility';
import { TableColumnToggle } from '@/components/table/table-column-toggle';
import { ListSearchBar } from '@/components/table/list-search-bar';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { rowMatchesSearch } from '@/lib/list-search';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const TRANSFERS_TABLE_COLUMNS: TableColumnDef[] = [
  { id: 'product', label: 'Produit', required: true },
  { id: 'route', label: 'Origine → Destination' },
  { id: 'quantity', label: 'Qté', defaultVisible: false },
  { id: 'date', label: 'Date', defaultVisible: false },
  { id: 'note', label: 'Commentaire', defaultVisible: false },
  { id: 'status', label: 'Statut', mobileVisible: false },
  {
    id: 'actions',
    label: 'Actions',
    required: true,
    headerClassName: 'text-right',
  },
];

type TransferRow = {
  id: string;
  productId?: string;
  productName?: string;
  fromBoutiqueId?: string;
  toBoutiqueId?: string;
  quantity?: number;
  status?: string;
  note?: string | null;
  createdAt?: { toDate?: () => Date };
  completionDate?: { toDate?: () => Date };
  updatedAt?: { toDate?: () => Date };
  requestorUserId?: string;
  approverUserId?: string;
};

function statusLabel(status?: string): string {
  switch (status) {
    case 'pending':
      return 'En attente';
    case 'completed':
      return 'Validé';
    case 'cancelled':
      return 'Annulé';
    default:
      return status ?? '-';
  }
}

type TransferCtx = {
  profile: { role?: string; boutiqueId?: string } | null | undefined;
  activeBoutiqueId: string | null;
  isProcessing: string | null;
  onValidate: (id: string) => void;
  onCancel: (id: string) => void;
  onDetail: (t: TransferRow) => void;
  boutiqueName: (id?: string) => string;
  productLabel: (t: TransferRow) => string;
};

function renderTransferCells(col: TableColumnDef, t: TransferRow, ctx: TransferCtx) {
  switch (col.id) {
    case 'product':
      return (
        <TableCell key={col.id}>
          <div className="flex max-w-[260px] flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <Package size={16} className="shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{ctx.productLabel(t)}</span>
            </div>
            <span className="pl-6 font-mono text-[11px] text-muted-foreground">{t.productId}</span>
          </div>
        </TableCell>
      );
    case 'route':
      return (
        <TableCell key={col.id}>
          <div className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-center">
            <span className="truncate font-semibold">{ctx.boutiqueName(t.fromBoutiqueId)}</span>
            <ArrowRight size={14} className="mx-1 hidden shrink-0 text-muted-foreground sm:inline" />
            <span className="truncate font-semibold">{ctx.boutiqueName(t.toBoutiqueId)}</span>
          </div>
        </TableCell>
      );
    case 'quantity':
      return (
        <TableCell key={col.id} className="font-bold">
          {t.quantity}
        </TableCell>
      );
    case 'date':
      return (
        <TableCell key={col.id} className="text-xs text-muted-foreground">
          {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
        </TableCell>
      );
    case 'note':
      return (
        <TableCell key={col.id} className="max-w-[180px] truncate text-xs text-muted-foreground">
          {t.note?.trim() ? t.note : '-'}
        </TableCell>
      );
    case 'status':
      return (
        <TableCell key={col.id}>
          <Badge
            variant={t.status === 'completed' ? 'secondary' : t.status === 'pending' ? 'outline' : 'destructive'}
            className={
              t.status === 'completed'
                ? 'bg-emerald-100 text-emerald-800'
                : t.status === 'pending'
                  ? 'bg-blue-50 text-blue-800'
                  : ''
            }
          >
            {t.status === 'pending' && <Clock size={12} className="mr-1" />}
            {t.status === 'completed' && <CheckCircle2 size={12} className="mr-1" />}
            {t.status === 'cancelled' && <XCircle size={12} className="mr-1" />}
            {statusLabel(t.status)}
          </Badge>
        </TableCell>
      );
    case 'actions':
      return (
        <TableCell key={col.id} className="text-right">
          <div className="flex flex-wrap justify-end gap-1">
            <Button variant="ghost" size="sm" className="h-8" onClick={() => ctx.onDetail(t)}>
              <Info className="mr-1 h-3.5 w-3.5" /> Détail
            </Button>
            {t.status === 'pending' && ctx.profile?.role === 'Admin' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => ctx.onValidate(t.id)}
                  disabled={ctx.isProcessing === t.id}
                >
                  {ctx.isProcessing === t.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 size={14} className="mr-1" /> Valider
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-rose-600"
                  onClick={() => ctx.onCancel(t.id)}
                  disabled={ctx.isProcessing === t.id}
                >
                  <XCircle size={14} className="mr-1" />
                  Refuser
                </Button>
              </>
            )}
            {t.status === 'pending' && ctx.profile?.role === 'Vendeur' && t.fromBoutiqueId === ctx.activeBoutiqueId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-rose-600"
                onClick={() => ctx.onCancel(t.id)}
                disabled={ctx.isProcessing === t.id}
              >
                Annuler
              </Button>
            )}
          </div>
        </TableCell>
      );
    default:
      return null;
  }
}

const THIRTY_D_MS = 30 * 24 * 60 * 60 * 1000;

export default function TransfersPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'cancelled'>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'involved'>('all');
  const [detailTransfer, setDetailTransfer] = useState<TransferRow | null>(null);

  const firestore = useFirestore();
  const { profile, user } = useUser();
  const { activeBoutiqueId } = useBoutiqueScope();
  const { toast } = useToast();

  useEffect(() => {
    if (profile?.role === 'Vendeur') setScopeFilter('involved');
  }, [profile?.role]);

  const transfersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'transfers'), orderBy('createdAt', 'desc'));
  }, [firestore]);

  const boutiquesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'boutiques'), orderBy('name', 'asc'));
  }, [firestore]);

  const productsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'products'));
  }, [firestore]);

  const { data: transfers, isLoading } = useCollection(transfersQuery);
  const { data: boutiques } = useCollection(boutiquesQuery);
  const { data: products } = useCollection(productsQuery);

  const boutiqueNameMap = useMemo(() => {
    const m = new Map<string, string>();
    boutiques?.forEach((b) => m.set(b.id, (b as { name?: string }).name?.trim() || b.id));
    return m;
  }, [boutiques]);

  const productNameMap = useMemo(() => {
    const m = new Map<string, string>();
    products?.forEach((p) => m.set(p.id, (p as { name?: string }).name || p.id));
    return m;
  }, [products]);

  const boutiqueName = (id?: string) => (id ? boutiqueNameMap.get(id) ?? id : '-');

  const productLabel = (t: TransferRow) => {
    const n = t.productName?.trim();
    if (n) return n;
    if (t.productId) return productNameMap.get(t.productId) ?? t.productId;
    return '-';
  };

  const { visibility, setColumnVisible, visibleColumns } = useTableColumnVisibility(
    'hoolo:table:transfers:v3',
    TRANSFERS_TABLE_COLUMNS
  );
  const colSpan = visibleColumns.length;

  const handleValidate = async (transferId: string) => {
    if (!firestore || !user) return;
    setIsProcessing(transferId);
    try {
      await validateTransfer(firestore, transferId, user.uid);
      toast({
        title: 'Transfert validé',
        description: 'Les stocks source et destination ont été mis à jour.',
      });
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Validation impossible',
        description: toUserFacingErrorMessage(error),
      });
    } finally {
      setIsProcessing(null);
    }
  };

  const handleCancel = async (transferId: string) => {
    if (!firestore) return;
    setIsProcessing(transferId);
    try {
      await cancelTransfer(firestore, transferId);
      toast({
        title: 'Demande annulée',
        description: 'Aucun stock n’a été modifié.',
      });
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Annulation impossible',
        description: toUserFacingErrorMessage(error),
      });
    } finally {
      setIsProcessing(null);
    }
  };

  const debouncedSearch = useDebouncedValue(searchTerm, 280);

  const completedWithin30Days = useMemo(() => {
    if (!transfers?.length) return 0;
    const cut = Date.now() - THIRTY_D_MS;
    return transfers.filter((t) => {
      if (t.status !== 'completed') return false;
      const tr = t as TransferRow;
      const d = tr.completionDate?.toDate?.() ?? tr.updatedAt?.toDate?.();
      return d && d.getTime() >= cut;
    }).length;
  }, [transfers]);

  const filteredTransfers = useMemo(() => {
    if (!transfers?.length) return null;
    return transfers.filter((t) => {
      const st = (t.status || '').toLowerCase();
      if (statusFilter !== 'all' && st !== statusFilter) return false;

      if (scopeFilter === 'involved' && activeBoutiqueId) {
        if (t.fromBoutiqueId !== activeBoutiqueId && t.toBoutiqueId !== activeBoutiqueId) {
          return false;
        }
      }

      const tr = t as TransferRow;
      return rowMatchesSearch(debouncedSearch, [
        tr.productId,
        tr.productName,
        tr.fromBoutiqueId,
        tr.toBoutiqueId,
        boutiqueName(tr.fromBoutiqueId),
        boutiqueName(tr.toBoutiqueId),
        tr.id,
        String(tr.quantity ?? ''),
        tr.note ?? '',
      ]);
    });
  }, [transfers, debouncedSearch, statusFilter, scopeFilter, activeBoutiqueId, boutiqueNameMap]);

  const resultHint =
    transfers?.length != null && filteredTransfers
      ? `${filteredTransfers.length} / ${transfers.length}`
      : undefined;

  const pendingCount = transfers?.filter((t) => t.status === 'pending').length ?? 0;
  const cancelledCount = transfers?.filter((t) => t.status === 'cancelled').length ?? 0;

  const ctx: TransferCtx = {
    profile,
    activeBoutiqueId,
    isProcessing,
    onValidate: handleValidate,
    onCancel: handleCancel,
    onDetail: setDetailTransfer,
    boutiqueName,
    productLabel,
  };

  const d = detailTransfer;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-primary sm:text-3xl">Transferts de stock</h1>
            <p className="mt-1 text-pretty text-sm text-muted-foreground sm:text-base">
              Demandes inter-boutiques : le débit source est effectué uniquement après validation admin.
            </p>
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="w-full shrink-0 bg-primary sm:w-auto"
            type="button"
          >
            <Plus className="mr-2 h-4 w-4" /> Nouveau transfert
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-blue-100 bg-blue-50/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-900">En attente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-950">{pendingCount}</div>
              <p className="text-xs text-blue-800/80">À valider par un administrateur</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-100 bg-emerald-50/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-emerald-900">Validés (30 jours)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-950">{completedWithin30Days}</div>
              <p className="text-xs text-emerald-800/80">Selon la date de validation</p>
            </CardContent>
          </Card>
          <Card className="border-muted bg-muted/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Annulés (total)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{cancelledCount}</div>
              <p className="text-xs text-muted-foreground">Demandes retirées sans mouvement</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm md:flex-row md:flex-wrap md:items-center">
          <ListSearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Produit, boutiques, commentaire, id…"
            resultHint={resultHint ? `${resultHint} transfert(s)` : undefined}
            className="md:min-w-[200px] md:flex-1"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="h-10 w-full md:w-[190px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="completed">Validés</SelectItem>
              <SelectItem value="cancelled">Annulés</SelectItem>
            </SelectContent>
          </Select>
          <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as typeof scopeFilter)}>
            <SelectTrigger className="h-10 w-full md:w-[220px]">
              <SelectValue placeholder="Portée" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les boutiques</SelectItem>
              <SelectItem value="involved">Mes boutiques seulement</SelectItem>
            </SelectContent>
          </Select>
          <TableColumnToggle
            columns={TRANSFERS_TABLE_COLUMNS}
            visibility={visibility}
            onColumnVisibleChange={setColumnVisible}
            className="md:ml-auto"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Historique</CardTitle>
            <CardDescription>Détails des demandes et actions (valider / refuser).</CardDescription>
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
                        <Loader2 className="inline h-8 w-8 animate-spin text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : filteredTransfers && filteredTransfers.length > 0 ? (
                    filteredTransfers.map((t) => (
                      <TableRow key={t.id}>
                        {visibleColumns.map((col) => renderTransferCells(col, t as TransferRow, ctx))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                        {transfers?.length ? 'Aucun transfert ne correspond à ces critères.' : 'Aucun transfert enregistré.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <CreateTransferDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

        <Dialog open={!!d} onOpenChange={(o) => !o && setDetailTransfer(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Transfert #{d?.id.substring(0, 8)}</DialogTitle>
              <DialogDescription>
                État : <strong>{statusLabel(d?.status)}</strong>
              </DialogDescription>
            </DialogHeader>
            {d && (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Produit</p>
                  <p className="font-medium">{productLabel(d)}</p>
                  <p className="font-mono text-xs text-muted-foreground">{d.productId}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Itinéraire</p>
                  <p>
                    {boutiqueName(d.fromBoutiqueId)} → {boutiqueName(d.toBoutiqueId)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Quantité</p>
                  <p className="font-semibold">{d.quantity}</p>
                </div>
                {d.note && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Commentaire</p>
                    <p className="rounded-md border bg-muted/30 p-2">{d.note}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <p className="font-medium text-foreground">Créé</p>
                    <p>{d.createdAt?.toDate?.()?.toLocaleString('fr-FR') ?? '-'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Clôture</p>
                    <p>{d.completionDate?.toDate?.()?.toLocaleString('fr-FR') ?? '-'}</p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDetailTransfer(null)}>
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
