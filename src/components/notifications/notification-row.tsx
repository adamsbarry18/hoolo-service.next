'use client';

import React from 'react';
import {
  AlertTriangle,
  Wrench,
  CreditCard,
  Info,
  Circle,
  CheckCheck,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WithId } from '@/firebase';
import type { BoutiqueNotificationDoc, NotificationType } from '@/firebase/services/notification-service';
import { formatNotificationRelative } from '@/lib/format-notification-time';
import { cn } from '@/lib/utils';

const TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  stock_low: AlertTriangle,
  repair_ready: Wrench,
  credit_alert: CreditCard,
  system: Info,
};

const TYPE_COLORS: Record<NotificationType, string> = {
  stock_low: 'text-rose-500',
  repair_ready: 'text-emerald-500',
  credit_alert: 'text-orange-500',
  system: 'text-primary',
};

const TYPE_LABELS: Record<NotificationType, string> = {
  stock_low: 'Stock',
  repair_ready: 'Réparation',
  credit_alert: 'Crédit',
  system: 'Système',
};

export type NotificationRowItem = WithId<BoutiqueNotificationDoc>;

type NotificationRowProps = {
  notif: NotificationRowItem;
  boutiqueId: string | null | undefined;
  compact?: boolean;
  onRead: (boutiqueId: string, id: string) => void;
  onDelete: (boutiqueId: string, id: string) => void;
  onNavigate: (href: string) => void;
};

export function NotificationRow({
  notif,
  boutiqueId,
  compact = false,
  onRead,
  onDelete,
  onNavigate,
}: NotificationRowProps) {
  const t = (notif.type ?? 'system') as NotificationType;
  const Icon = TYPE_ICONS[t] ?? Info;
  const link = typeof notif.link === 'string' && notif.link.trim() ? notif.link.trim() : '';
  const unread = !notif.isRead;

  const handleRowClick = () => {
    if (link) {
      onNavigate(link);
      if (unread && boutiqueId) onRead(boutiqueId, notif.id);
    }
  };

  return (
    <div
      role={link ? 'button' : undefined}
      tabIndex={link ? 0 : undefined}
      onKeyDown={
        link
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleRowClick();
              }
            }
          : undefined
      }
      className={cn(
        'flex gap-3 border-b p-4 transition-colors',
        link && 'cursor-pointer hover:bg-muted/50',
        unread && 'bg-primary/5',
        compact && 'p-3'
      )}
      onClick={link ? handleRowClick : undefined}
    >
      <div className={cn('mt-0.5 shrink-0', TYPE_COLORS[t] ?? 'text-muted-foreground')}>
        <Icon className={compact ? 'h-4 w-4' : 'h-[18px] w-[18px]'} aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{TYPE_LABELS[t] ?? 'Info'}</p>
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm font-semibold leading-tight', unread && 'text-primary')}>{notif.title}</p>
          {unread ? <Circle className="mt-1 h-2 w-2 shrink-0 fill-primary text-primary" aria-label="Non lue" /> : null}
        </div>
        <p className="line-clamp-3 text-xs text-muted-foreground">{notif.message}</p>
        <p className="text-[10px] text-muted-foreground">{formatNotificationRelative(notif.createdAt)}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-1 self-start">
        {unread ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            title="Marquer comme lu"
            onClick={(e) => {
              e.stopPropagation();
              if (boutiqueId) onRead(boutiqueId, notif.id);
            }}
          >
            <CheckCheck className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          title="Supprimer"
          onClick={(e) => {
            e.stopPropagation();
            if (boutiqueId) onDelete(boutiqueId, notif.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
