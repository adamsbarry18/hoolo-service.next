import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Timestamp } from 'firebase/firestore';

export function formatNotificationRelative(createdAt: Timestamp | undefined): string {
  if (!createdAt?.toDate) return "À l'instant";
  try {
    return formatDistanceToNow(createdAt.toDate(), { addSuffix: true, locale: fr });
  } catch {
    return "À l'instant";
  }
}

export function formatNotificationAbsolute(createdAt: Timestamp | undefined): string {
  if (!createdAt?.toDate) return '-';
  try {
    return createdAt.toDate().toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '-';
  }
}
