"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { SidebarInset } from "@/components/ui/sidebar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { OfflineBanner } from "./OfflineBanner";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-svh w-full bg-sidebar">
        <AppSidebar />
        <SidebarInset
          className={cn(
            "flex min-h-svh min-w-0 flex-1 flex-col bg-sidebar",
            "md:peer-data-[variant=inset]:m-1 md:peer-data-[variant=inset]:ml-0",
            "md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-1",
            "md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-none"
          )}
        >
          <AppHeader />
          <OfflineBanner />
          <div className="flex min-h-0 flex-1 flex-col px-1 pb-2 pt-0.5 md:px-2 md:pb-3 md:pt-1">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                <div className="mx-auto w-full max-w-7xl p-4 md:p-8">
                  {children}
                </div>
              </div>
            </div>
          </div>
        </SidebarInset>
      </div>
    </AuthGuard>
  );
}
