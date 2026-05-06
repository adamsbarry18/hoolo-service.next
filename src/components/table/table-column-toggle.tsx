"use client";

import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type TableColumnDef,
  isColumnVisible,
} from "@/hooks/use-table-column-visibility";

type TableColumnToggleProps = {
  columns: readonly TableColumnDef[];
  visibility: Record<string, boolean>;
  onColumnVisibleChange: (columnId: string, visible: boolean) => void;
  className?: string;
};

export function TableColumnToggle({
  columns,
  visibility,
  onColumnVisibleChange,
  className,
}: TableColumnToggleProps) {
  const optional = columns.filter((c) => !c.required);
  if (optional.length === 0) return null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={className}
          aria-label="Choisir les colonnes affichées"
        >
          <Columns3 className="h-4 w-4 shrink-0 max-md:mr-1.5 md:mr-2" aria-hidden />
          <span className="hidden md:inline">Colonnes</span>
          <span className="inline md:hidden">Affichage</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="max-h-[min(70dvh,22rem)] w-[min(calc(100vw-2rem),14rem)] overflow-y-auto"
      >
        <DropdownMenuLabel>Colonnes visibles</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {optional.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.id}
            checked={isColumnVisible(col, visibility)}
            onCheckedChange={(checked) =>
              onColumnVisibleChange(col.id, checked === true)
            }
            onSelect={(e) => e.preventDefault()}
          >
            {col.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
