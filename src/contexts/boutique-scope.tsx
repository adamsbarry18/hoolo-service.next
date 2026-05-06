"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { collection, orderBy, query } from "firebase/firestore";
import { useCollection, useFirebase, useMemoFirebase } from "@/firebase";

const STORAGE_KEY = "hoolo:activeBoutiqueId";

export type BoutiqueScopeBoutique = {
  id: string;
  name?: string;
  isDefault?: boolean;
};

type BoutiqueScopeValue = {
  boutiques: BoutiqueScopeBoutique[];
  /** ID de la boutique utilisée pour stock, ventes, etc. */
  activeBoutiqueId: string | null;
  setActiveBoutiqueId: (id: string) => void;
  /** Prêt quand pas connecté, ou boutiques chargées (liste vide = pas de magasin). */
  ready: boolean;
  loading: boolean;
};

const BoutiqueScopeContext = createContext<BoutiqueScopeValue | null>(null);

export function BoutiqueScopeProvider({ children }: { children: ReactNode }) {
  const { firestore, user } = useFirebase();
  const [activeBoutiqueId, setActiveState] = useState<string | null>(null);

  const boutiquesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "boutiques"), orderBy("name", "asc"));
  }, [firestore, user]);

  const { data: boutiquesRaw, isLoading } = useCollection(boutiquesQuery);
  const boutiques = useMemo(
    () => (boutiquesRaw ?? []) as BoutiqueScopeBoutique[],
    [boutiquesRaw]
  );

  useEffect(() => {
    if (!user) {
      setActiveState(null);
      return;
    }
    if (isLoading) return;
    if (!boutiques.length) {
      setActiveState(null);
      return;
    }
    const ids = new Set(boutiques.map((b) => b.id));
    let fromStorage: string | null = null;
    try {
      const s = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (s && ids.has(s)) fromStorage = s;
    } catch {
      /* ignore */
    }
    const def =
      boutiques.find((b) => b.isDefault === true)?.id ?? boutiques[0]!.id;
    const next = fromStorage ?? def;
    setActiveState((prev) => {
      if (prev && ids.has(prev)) return prev;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [user, isLoading, boutiques]);

  const setActiveBoutiqueId = useCallback((id: string) => {
    setActiveState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo((): BoutiqueScopeValue => {
    const ready = !user || !isLoading;
    return {
      boutiques,
      activeBoutiqueId,
      setActiveBoutiqueId,
      ready,
      loading: !!user && isLoading,
    };
  }, [user, boutiques, activeBoutiqueId, setActiveBoutiqueId, isLoading]);

  return <BoutiqueScopeContext.Provider value={value}>{children}</BoutiqueScopeContext.Provider>;
}

export function useBoutiqueScope(): BoutiqueScopeValue {
  const ctx = useContext(BoutiqueScopeContext);
  if (!ctx) {
    throw new Error("useBoutiqueScope doit être utilisé sous BoutiqueScopeProvider.");
  }
  return ctx;
}

/** Libellé du magasin actif (pour en-têtes). */
export function useActiveBoutiqueLabel(): string | null {
  const { boutiques, activeBoutiqueId } = useBoutiqueScope();
  if (!activeBoutiqueId) return null;
  const b = boutiques.find((x) => x.id === activeBoutiqueId);
  return b?.name?.trim() || activeBoutiqueId;
}
