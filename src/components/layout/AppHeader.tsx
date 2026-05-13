"use client";

import React, { memo } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut, UserCircle, Store } from "lucide-react";
import { useUser, useAuth } from "@/firebase";
import { signOut } from "firebase/auth";
import { cn } from "@/lib/utils";
import { userAvatarInlineStyle, userInitialsFromProfile } from "@/lib/user-avatar";
import { getUserFirstNameLabel } from "@/lib/user-display";
import Link from "next/link";
import { NotificationBell } from "./NotificationBell";
import { ConnectivityIndicator } from "./ConnectivityIndicator";
import { useBoutiqueScope } from "@/contexts/boutique-scope";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const AppHeader = memo(function AppHeader() {
  const { user, profile, isUserLoading } = useUser();
  const auth = useAuth();
  const { boutiques, activeBoutiqueId, setActiveBoutiqueId, ready: boutiqueScopeReady } =
    useBoutiqueScope();

  const shortName = getUserFirstNameLabel(profile, user) || "Utilisateur";

  const headerInitials = userInitialsFromProfile(profile, user);
  const headerAvatarStyle = userAvatarInlineStyle(user?.uid);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3",
        "bg-sidebar px-3 text-sidebar-foreground",
        "sm:gap-4 sm:px-4 md:px-6"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <SidebarTrigger
          className={cn(
            "h-9 w-auto shrink-0 rounded-lg border-0 text-sidebar-foreground",
            "md:w-9 md:min-w-9 md:justify-center",
            "bg-transparent hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground"
          )}
        />
        {user && boutiqueScopeReady && boutiques.length > 0 ? (
          <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5">
            <Select
              value={activeBoutiqueId ?? undefined}
              onValueChange={setActiveBoutiqueId}
            >
              <SelectTrigger
                className={cn(
                  "h-8 min-h-8 w-auto max-w-[min(calc(100vw-9.5rem),240px)] shrink-0 rounded-lg border-sidebar-border",
                  "sm:h-9 sm:min-h-9",
                  "bg-transparent text-sidebar-foreground",
                  "hover:bg-sidebar-accent/80 hover:data-[state=open]:bg-sidebar-accent/80",
                  "hover:text-sidebar-accent-foreground",
                  "justify-start gap-1 px-1 py-0 text-sm",
                  "[&>span]:min-w-0 [&>span]:shrink [&>span]:truncate",
                  "[&>svg]:size-3.5 [&>svg]:shrink-0"
                )}
                aria-label="Boutique active"
              >
                <Store className="opacity-80" aria-hidden />
                <SelectValue placeholder="Magasin" />
              </SelectTrigger>
              <SelectContent align="start" className="z-[200]">
                {boutiques.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name?.trim() || b.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="shrink-0">
              <ConnectivityIndicator />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "h-9 gap-2 rounded-lg px-2 text-sidebar-foreground",
                "hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
                "sm:pl-2 sm:pr-2.5"
              )}
              aria-label="Menu du compte"
            >
              <Avatar className="h-8 w-8 border border-sidebar-border">
                <AvatarFallback
                  className="text-[11px] font-semibold"
                  style={headerAvatarStyle}
                >
                  {headerInitials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">
                {isUserLoading ? "Chargement…" : shortName}
              </span>
              <ChevronDown
                className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block"
                aria-hidden
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" sideOffset={8}>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="truncate text-sm font-medium leading-none">
                  {isUserLoading ? "…" : shortName}
                </p>
                {user?.email ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                ) : null}
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {isUserLoading ? "…" : profile?.role || "Utilisateur"}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              asChild
              className="cursor-pointer focus:bg-sidebar-accent focus:text-sidebar-accent-foreground data-[highlighted]:bg-sidebar-accent data-[highlighted]:text-sidebar-accent-foreground"
            >
              <Link href="/profil" className="cursor-pointer">
                <UserCircle className="h-4 w-4" />
                Mon profil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:bg-sidebar-accent focus:text-destructive data-[highlighted]:bg-sidebar-accent data-[highlighted]:text-destructive"
              onClick={() => signOut(auth)}
            >
              <LogOut className="h-4 w-4" />
              Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
});
