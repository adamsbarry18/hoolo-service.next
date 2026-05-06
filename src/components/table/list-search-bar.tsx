"use client";

import React, { memo } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ListSearchBarProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  /** Ex. « 5 / 24 résultats » - laisser vide pour masquer */
  resultHint?: string;
};

export const ListSearchBar = memo(function ListSearchBar({
  value,
  onChange,
  placeholder = "Rechercher…",
  className,
  id = "list-search",
  resultHint,
}: ListSearchBarProps) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center", className)}>
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={id}
          type="search"
          autoComplete="off"
          className="h-10 pl-10 pr-10"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={placeholder}
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => onChange("")}
            aria-label="Effacer la recherche"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      {resultHint ? (
        <p className="shrink-0 text-xs text-muted-foreground sm:text-right">{resultHint}</p>
      ) : null}
    </div>
  );
});
