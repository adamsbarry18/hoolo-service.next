'use client';

import type { Timestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import {
  appendLocalNotification,
  markAllLocalRead,
  readLocalNotifications,
  removeLocalNotification,
  updateLocalNotification,
} from '@/lib/local-notifications';

export type NotificationType = 'stock_low' | 'repair_ready' | 'credit_alert' | 'system';

export interface NotificationData {
  title: string;
  message: string;
  type: NotificationType;
  link?: string;
  boutiqueId: string;
}

/** Document affiché dans la liste (données locales + horodatage Firestore pour compat UI). */
export interface BoutiqueNotificationDoc {
  title: string;
  message: string;
  type: NotificationType;
  link?: string;
  isRead?: boolean;
  createdAt?: Timestamp;
}

/**
 * Notification lorsque le stock **traverse** le seuil vers le bas (évite doublons si déjà en alerte).
 */
export function notifyStockLowCrossing(
  boutiqueId: string,
  productId: string,
  previousQty: number,
  newQty: number,
  threshold: number
): void {
  if (newQty > threshold) return;
  if (previousQty <= threshold) return;
  createNotification({
    title: 'Alerte stock faible',
    message: `Stock passé sous le seuil (${newQty} unité(s), seuil ${threshold}) - réf. ${productId}.`,
    type: 'stock_low',
    boutiqueId,
    link: '/inventory',
  });
}

/**
 * Enregistre une notification pour le magasin (localStorage + toast Sonner si pertinent).
 */
export function createNotification(data: NotificationData): string {
  const id = `n-${crypto.randomUUID()}`;
  appendLocalNotification(data.boutiqueId, {
    id,
    title: data.title,
    message: data.message,
    type: data.type,
    link: data.link || '',
    isRead: false,
  });
  if (data.type !== 'stock_low') {
    toast.success(data.title, { description: data.message.slice(0, 140) });
  }
  return id;
}

export function markAsRead(boutiqueId: string, notificationId: string): void {
  updateLocalNotification(boutiqueId, notificationId, { isRead: true });
}

/** Retourne le nombre de notifications passées en « lues ». */
export function markAllNotificationsRead(boutiqueId: string): number {
  const unread = readLocalNotifications(boutiqueId).filter((n) => n.isRead !== true).length;
  markAllLocalRead(boutiqueId);
  return unread;
}

export function deleteNotification(boutiqueId: string, notificationId: string): void {
  removeLocalNotification(boutiqueId, notificationId);
}
