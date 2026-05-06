"use client";

import React, { memo } from "react";
import { CloudOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";

/**
 * Bandeau visible lorsque le navigateur signale l’absence de réseau.
 * Firestore continue de lire le cache persistant et met en file les écritures.
 */
export const OfflineBanner = memo(function OfflineBanner() {
  const online = useOnlineStatus();

  if (online !== false) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-amber-950",
        "text-xs sm:text-sm sm:px-4"
      )}
    >
      <CloudOff className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      <p className="min-w-0 leading-snug">
        <span className="font-semibold">Hors ligne</span>
        <span className="text-amber-900/90">
          {" "}
          - Consultation des données déjà synchronisées. Les enregistrements seront envoyés automatiquement au
          retour du réseau.
        </span>
      </p>
    </div>
  );
});
