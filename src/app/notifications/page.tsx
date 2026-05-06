'use client';

import React, { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useBoutiqueScope } from '@/contexts/boutique-scope';
import {
  markAsRead,
  deleteNotification,
  markAllNotificationsRead,
} from '@/firebase/services/notification-service';
import { useRouter } from 'next/navigation';
import { NotificationRow } from '@/components/notifications/notification-row';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useNotificationsFeed } from '@/hooks/use-notifications-feed';

const PAGE_LIMIT = 100;

export default function NotificationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { activeBoutiqueId: boutiqueId, ready: boutiqueScopeReady } = useBoutiqueScope();
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const { notifications } = useNotificationsFeed(boutiqueId, PAGE_LIMIT);

  const filtered = useMemo(() => {
    if (!notifications?.length) return [];
    if (tab === 'unread') return notifications.filter((n) => !n.isRead);
    return notifications;
  }, [notifications, tab]);

  const unreadTotal = useMemo(() => notifications?.filter((n) => !n.isRead).length ?? 0, [notifications]);

  const handleMarkAll = () => {
    if (!boutiqueId || unreadTotal === 0) return;
    setMarkingAll(true);
    try {
      const n = markAllNotificationsRead(boutiqueId);
      toast({
        title: n > 0 ? 'Tout marquer comme lu' : 'Déjà à jour',
        description: n > 0 ? `${n} notification(s) mise(s) à jour.` : 'Aucune notification non lue.',
      });
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: e instanceof Error ? e.message : 'Échec de la mise à jour.',
      });
    } finally {
      setMarkingAll(false);
    }
  };

  if (boutiqueScopeReady && !boutiqueId) {
    return (
      <AppLayout>
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell /> Notifications
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Choisissez un magasin dans le sélecteur en haut de l&apos;écran pour consulter l&apos;historique des
              alertes de ce magasin.
            </p>
          </CardHeader>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-primary sm:text-3xl">Notifications</h1>
            <p className="mt-1 text-pretty text-sm text-muted-foreground sm:text-base">
              Alertes pour la boutique active - conservées sur cet appareil (navigateur). Changez de magasin pour
              voir un autre fil.
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              disabled={!boutiqueId || unreadTotal === 0 || markingAll}
              onClick={() => handleMarkAll()}
            >
              {markingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
              Tout marquer comme lu
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Historique</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-wrap gap-1 border-b px-3 py-2 sm:px-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-9 rounded-md',
                  tab === 'all' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                )}
                onClick={() => setTab('all')}
              >
                Toutes
                {notifications != null ? (
                  <span className="ml-1.5 tabular-nums text-xs opacity-80">({notifications.length})</span>
                ) : null}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-9 rounded-md',
                  tab === 'unread' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                )}
                onClick={() => setTab('unread')}
              >
                Non lues
                {unreadTotal > 0 ? (
                  <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 text-xs font-medium tabular-nums text-primary">
                    {unreadTotal}
                  </span>
                ) : null}
              </Button>
            </div>
            {filtered.length > 0 ? (
              <div className="divide-y">
                {filtered.map((notif) => (
                  <NotificationRow
                    key={notif.id}
                    notif={notif}
                    boutiqueId={boutiqueId}
                    onRead={(bid, id) => markAsRead(bid, id)}
                    onDelete={(bid, id) => deleteNotification(bid, id)}
                    onNavigate={(href) => router.push(href)}
                  />
                ))}
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-muted-foreground">
                {tab === 'unread'
                  ? 'Aucune notification non lue pour cette boutique.'
                  : 'Aucune notification pour le moment. Les alertes apparaissent lors des ventes (stock bas), des réparations prêtes, etc.'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
