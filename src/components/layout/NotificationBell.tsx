'use client';

import React, { useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  markAsRead,
  deleteNotification,
  markAllNotificationsRead,
} from '@/firebase/services/notification-service';
import { useRouter } from 'next/navigation';
import { useBoutiqueScope } from '@/contexts/boutique-scope';
import { NotificationRow } from '@/components/notifications/notification-row';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useNotificationsFeed } from '@/hooks/use-notifications-feed';

const BELL_LIMIT = 12;

export function NotificationBell() {
  const router = useRouter();
  const { toast } = useToast();
  const { activeBoutiqueId: boutiqueId, ready: boutiqueScopeReady } = useBoutiqueScope();
  const [markingAll, setMarkingAll] = useState(false);

  const { notifications } = useNotificationsFeed(boutiqueId, BELL_LIMIT);

  const unreadCount = notifications?.filter((n) => !n.isRead).length || 0;

  const handleMarkAll = () => {
    if (!boutiqueId || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      const n = markAllNotificationsRead(boutiqueId);
      toast({
        title: n > 0 ? 'Notifications marquées comme lues' : 'Rien à mettre à jour',
        description: n > 0 ? `${n} élément(s) traité(s).` : 'Toutes étaient déjà lues.',
      });
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: e instanceof Error ? e.message : 'Impossible de tout marquer comme lu.',
      });
    } finally {
      setMarkingAll(false);
    }
  };

  const noBoutique = boutiqueScopeReady && !boutiqueId;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-[1.125rem] w-[1.125rem]" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 flex h-4 min-w-4 justify-center p-0 px-0.5 text-[10px] tabular-nums"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className={cn('z-[220] w-[min(calc(100vw-2rem),20rem)] p-0')}
      >
        <DropdownMenuLabel className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-bold">Notifications</span>
          <div className="flex flex-wrap items-center gap-2">
            {unreadCount > 0 ? (
              <span className="text-xs text-muted-foreground">{unreadCount} non lue(s)</span>
            ) : null}
            {unreadCount > 0 && boutiqueId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={markingAll}
                onClick={(e) => {
                  e.preventDefault();
                  handleMarkAll();
                }}
              >
                {markingAll ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Tout marquer lu
              </Button>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[min(24rem,calc(100vh-8rem))] overflow-y-auto">
          {noBoutique ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Sélectionnez une boutique pour voir les alertes de ce magasin.
            </div>
          ) : notifications && notifications.length > 0 ? (
            notifications.map((notif) => (
              <NotificationRow
                key={notif.id}
                notif={notif}
                boutiqueId={boutiqueId}
                compact
                onRead={(bid, id) => markAsRead(bid, id)}
                onDelete={(bid, id) => deleteNotification(bid, id)}
                onNavigate={(href) => router.push(href)}
              />
            ))
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aucune notification pour le moment.
            </div>
          )}
        </div>
        <DropdownMenuSeparator />
        <Button
          variant="ghost"
          className="h-10 w-full rounded-none text-xs font-semibold"
          disabled={!boutiqueId}
          onClick={() => router.push('/notifications')}
        >
          Voir tout l&apos;historique
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
