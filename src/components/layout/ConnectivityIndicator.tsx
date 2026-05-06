'use client';

import React, { memo } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useOnlineStatus } from '@/hooks/use-online-status';

/**
 * Indicateur réseau + rappel du comportement Firestore hors ligne (persistant multi-onglets).
 */
export const ConnectivityIndicator = memo(function ConnectivityIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline === null) return null;

  const tooltipOnline =
    "Réseau disponible. Firestore synchronise en temps réel et conserve une copie locale des données " +
    "déjà consultées sur cet appareil (requêtes récentes restent consultables après une coupure).";

  const tooltipOffline =
    "Pas de réseau : vous voyez les données déjà mises en cache. Les nouvelles écritures " +
    "(ventes, stocks, etc.) sont enregistrées dans une file locale et envoyées automatiquement au " +
    "retour de la connexion.";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center">
            {isOnline ? (
              <Badge
                variant="outline"
                className="flex h-9 items-center gap-1.5 rounded-lg border-emerald-200 bg-emerald-50/95 px-2.5 text-emerald-800 shadow-none sm:px-3"
              >
                <Wifi size={14} className="shrink-0 text-emerald-600 animate-pulse" />
                <span className="hidden text-[10px] font-bold uppercase tracking-wide text-emerald-700 sm:inline">
                  En ligne
                </span>
              </Badge>
            ) : (
              <Badge
                variant="destructive"
                className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 shadow-none sm:px-3"
              >
                <WifiOff size={14} className="shrink-0" />
                <span className="hidden text-[10px] font-bold uppercase sm:inline">
                  Hors ligne
                </span>
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">
          {isOnline ? tooltipOnline : tooltipOffline}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
