"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/** Aligné sur `use-mobile.tsx` : &lt; 768px */
const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

export type TableColumnDef = {
  id: string;
  label: string;
  required?: boolean;
  /** Classes pour l’en-tête de colonne (ex. text-right) */
  headerClassName?: string;
  /** Si false, masqué par défaut sur desktop (les colonnes `required` ignorent ce champ). */
  defaultVisible?: boolean;
  /**
   * Surcharge sur viewport mobile uniquement (aucune clé localStorage).
   * Utile pour réduire à ~3 colonnes utiles sur petit écran.
   */
  mobileVisible?: boolean;
};

function readIsMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

export function isColumnVisible(
  column: TableColumnDef,
  visibility: Record<string, boolean>
): boolean {
  if (column.required) return true;
  return visibility[column.id] !== false;
}

export function getVisibleColumns(
  columns: readonly TableColumnDef[],
  visibility: Record<string, boolean>
): TableColumnDef[] {
  return columns.filter((c) => isColumnVisible(c, visibility));
}

export function visibleColumnCount(
  columns: readonly TableColumnDef[],
  visibility: Record<string, boolean>
): number {
  return getVisibleColumns(columns, visibility).length;
}

/** Visibilité par défaut : ~4 colonnes sur desktop, ~3 sur mobile (via mobileVisible). */
export function buildDefaultVisibility(
  columns: readonly TableColumnDef[],
  mobile: boolean
): Record<string, boolean> {
  return Object.fromEntries(
    columns.map((c) => {
      if (c.required) return [c.id, true];
      if (mobile && c.mobileVisible !== undefined) {
        return [c.id, c.mobileVisible];
      }
      return [c.id, c.defaultVisible !== false];
    })
  );
}

/**
 * Persistance localStorage des colonnes affichées (clé stable par tableau).
 * `columns` doit être défini en constante module pour des deps stables.
 */
export function useTableColumnVisibility(
  storageKey: string,
  columns: readonly TableColumnDef[]
) {
  const columnIdsKey = columns.map((c) => c.id).join("\0");

  const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
    buildDefaultVisibility(columns, readIsMobileViewport())
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const mobile = readIsMobileViewport();
      const base = buildDefaultVisibility(columns, mobile);
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setVisibility(base);
      } else {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        const merged = { ...base };
        for (const key of Object.keys(base)) {
          if (typeof parsed[key] === "boolean") {
            merged[key] = parsed[key];
          }
        }
        setVisibility(merged);
      }
    } catch {
      setVisibility(buildDefaultVisibility(columns, false));
    } finally {
      setHydrated(true);
    }
  }, [storageKey, columnIdsKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(visibility));
    } catch {
      /* quota / private mode */
    }
  }, [hydrated, storageKey, visibility]);

  const setColumnVisible = useCallback(
    (id: string, visible: boolean) => {
      const col = columns.find((c) => c.id === id);
      if (col?.required) return;
      setVisibility((prev) => ({ ...prev, [id]: visible }));
    },
    [columns, columnIdsKey]
  );

  const visibleColumns = useMemo(
    () => getVisibleColumns(columns, visibility),
    [columns, columnIdsKey, visibility]
  );

  return { visibility, setColumnVisible, visibleColumns };
}
