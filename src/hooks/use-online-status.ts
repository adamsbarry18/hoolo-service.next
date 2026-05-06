"use client";

import { useEffect, useState } from "react";

/**
 * État réseau du navigateur (événements online / offline).
 * `null` avant hydratation client pour éviter les écarts SSR.
 */
export function useOnlineStatus(): boolean | null {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return isOnline;
}
