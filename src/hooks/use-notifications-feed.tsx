'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import type { WithId } from '@/firebase';
import type { BoutiqueNotificationDoc } from '@/firebase/services/notification-service';
import { readLocalNotifications, type StoredLocalNotification } from '@/lib/local-notifications';

function localToDocRow(l: StoredLocalNotification): WithId<BoutiqueNotificationDoc> {
  return {
    id: l.id,
    title: l.title,
    message: l.message,
    type: l.type,
    link: l.link,
    isRead: l.isRead === true,
    createdAt: Timestamp.fromMillis(l.createdAtMs),
  };
}

export function useNotificationsFeed(boutiqueId: string | null | undefined, pageLimit: number) {
  const [localTick, setLocalTick] = useState(0);
  const bump = useCallback(() => setLocalTick((t) => t + 1), []);

  useEffect(() => {
    const fn = () => bump();
    if (typeof window === 'undefined') return;
    window.addEventListener('hoolo:local-notifs', fn);
    window.addEventListener('storage', fn);
    return () => {
      window.removeEventListener('hoolo:local-notifs', fn);
      window.removeEventListener('storage', fn);
    };
  }, [bump]);

  const notifications = useMemo((): WithId<BoutiqueNotificationDoc>[] | null => {
    if (!boutiqueId) return null;
    void localTick;
    const raw = readLocalNotifications(boutiqueId);
    const rows = raw.map(localToDocRow);
    rows.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
    return rows.slice(0, pageLimit);
  }, [boutiqueId, localTick, pageLimit]);

  return {
    notifications,
    isLoading: false,
    error: null as Error | null,
    isFromCache: false,
    hasPendingWrites: false,
  };
}
