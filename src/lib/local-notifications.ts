import type { NotificationType } from '@/firebase/services/notification-service';

const MAX_LOCAL = 120;

export type StoredLocalNotification = {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  link?: string;
  isRead?: boolean;
  createdAtMs: number;
};

function emitLocalChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('hoolo:local-notifs'));
}

function keyFor(boutiqueId: string): string {
  return `hoolo:local-notifications:${boutiqueId}`;
}

export function readLocalNotifications(boutiqueId: string): StoredLocalNotification[] {
  if (typeof window === 'undefined' || !boutiqueId) return [];
  try {
    const raw = window.localStorage.getItem(keyFor(boutiqueId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredLocalNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(boutiqueId: string, items: StoredLocalNotification[]): void {
  if (typeof window === 'undefined' || !boutiqueId) return;
  const trimmed = items.slice(0, MAX_LOCAL);
  window.localStorage.setItem(keyFor(boutiqueId), JSON.stringify(trimmed));
  emitLocalChanged();
}

export function appendLocalNotification(
  boutiqueId: string,
  item: Omit<StoredLocalNotification, 'createdAtMs'> & { createdAtMs?: number }
): void {
  const list = readLocalNotifications(boutiqueId);
  if (list.some((n) => n.id === item.id)) return;
  const row: StoredLocalNotification = {
    ...item,
    createdAtMs: item.createdAtMs ?? Date.now(),
    isRead: item.isRead ?? false,
  };
  writeLocal(boutiqueId, [row, ...list]);
}

export function updateLocalNotification(
  boutiqueId: string,
  id: string,
  patch: Partial<Pick<StoredLocalNotification, 'isRead'>>
): void {
  const list = readLocalNotifications(boutiqueId);
  const idx = list.findIndex((n) => n.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  writeLocal(boutiqueId, list);
}

export function removeLocalNotification(boutiqueId: string, id: string): void {
  writeLocal(
    boutiqueId,
    readLocalNotifications(boutiqueId).filter((n) => n.id !== id)
  );
}

export function markAllLocalRead(boutiqueId: string): void {
  const list = readLocalNotifications(boutiqueId).map((n) => ({ ...n, isRead: true }));
  writeLocal(boutiqueId, list);
}
