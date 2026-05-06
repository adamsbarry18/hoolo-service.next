"use client";

import React, { memo, useMemo } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Bell,
  ShoppingCart,
  Package,
  Wrench,
  Users,
  CreditCard,
  Building2,
  BarChart3,
  ArrowLeftRight,
  ShieldCheck,
  SlidersHorizontal,
  Settings,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { BRAND_LOGO_MARK } from "@/lib/brand-assets";
import { usePathname } from "next/navigation";
import { useUser } from "@/firebase";
import { cn } from "@/lib/utils";

type NavItem = {
  title: string;
  icon: LucideIcon;
  href: string;
  roles?: string[];
};

const mainNavItems: NavItem[] = [
  { title: "Tableau de bord", icon: LayoutDashboard, href: "/" },
  {
    title: "Ventes",
    icon: ShoppingCart,
    href: "/sales",
    roles: ["Admin", "Vendeur"],
  },
  {
    title: "Stock & produits",
    icon: Package,
    href: "/inventory",
    roles: ["Admin", "Vendeur"],
  },
  {
    title: "Transferts stock",
    icon: ArrowLeftRight,
    href: "/transfers",
    roles: ["Admin", "Vendeur"],
  },
  {
    title: "Réparations",
    icon: Wrench,
    href: "/repairs",
    roles: ["Admin", "Vendeur"],
  },
  {
    title: "Crédits clients",
    icon: CreditCard,
    href: "/credits",
    roles: ["Admin", "Vendeur"],
  },
  {
    title: "Clients",
    icon: Users,
    href: "/customers",
    roles: ["Admin", "Vendeur"],
  },
  {
    title: "Comptabilité",
    icon: BarChart3,
    href: "/accounting",
    roles: ["Admin"],
  },
  {
    title: "Notifications",
    icon: Bell,
    href: "/notifications",
    roles: ["Admin", "Vendeur"],
  },
];

const settingsNavItems: NavItem[] = [
  {
    title: "Configuration",
    icon: SlidersHorizontal,
    href: "/settings",
    roles: ["Admin"],
  },
  { title: "Personnel", icon: ShieldCheck, href: "/users", roles: ["Admin"] },
  { title: "Boutiques", icon: Building2, href: "/boutiques", roles: ["Admin"] },
];

function filterByRole(items: NavItem[], role: string | undefined) {
  return items.filter(
    (item) => !item.roles || (role != null && item.roles.includes(role))
  );
}

function navItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const AppSidebar = memo(function AppSidebar() {
  const pathname = usePathname();
  const { profile, isUserLoading } = useUser();
  const { isMobile, setOpenMobile } = useSidebar();

  const closeMobileNav = () => {
    if (isMobile) setOpenMobile(false);
  };

  const filteredMain = useMemo(
    () => filterByRole(mainNavItems, profile?.role),
    [profile?.role]
  );
  const filteredSettings = useMemo(
    () => filterByRole(settingsNavItems, profile?.role),
    [profile?.role]
  );

  const showSettingsGroup = filteredSettings.length > 0;

  const settingsSectionActive = filteredSettings.some((item) =>
    navItemActive(pathname, item.href)
  );

  return (
    <Sidebar collapsible="icon" variant="inset" className="border-0 p-1">
      <SidebarHeader className="gap-2 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary shadow-sm",
              "ring-1 ring-inset ring-black/5"
            )}
          >
            <Image
              src={BRAND_LOGO_MARK}
              alt=""
              width={36}
              height={36}
              className="object-contain p-0.5"
              priority
            />
          </div>
          <div className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-bold tracking-tight text-sidebar-foreground">
              Hoolo Service
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              Gestion commerciale
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-1.5 pt-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu>
              {isUserLoading ? (
                <>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <SidebarMenuItem key={i}>
                      <SidebarMenuSkeleton showIcon />
                    </SidebarMenuItem>
                  ))}
                </>
              ) : (
                filteredMain.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={navItemActive(pathname, item.href)}
                      tooltip={item.title}
                    >
                      <Link href={item.href} onClick={closeMobileNav}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!isUserLoading &&
          filteredMain.length === 0 &&
          !showSettingsGroup && (
            <p className="px-4 py-3 text-xs italic text-muted-foreground">
              Profil non configuré. Contactez l&apos;administrateur.
            </p>
          )}
      </SidebarContent>

      {showSettingsGroup ? (
        <SidebarFooter className="border-t border-sidebar-border p-2">
          <SidebarMenu>
            {isMobile ? (
              <SidebarMenuItem>
                <Collapsible
                  defaultOpen={settingsSectionActive}
                  className="group/coll-settings w-full"
                >
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={settingsSectionActive}
                      title="Paramètres"
                      className={cn(
                        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        "group-data-[state=open]/coll-settings:bg-[hsl(var(--sidebar-active))]",
                        "group-data-[state=open]/coll-settings:text-sidebar-accent-foreground",
                        "group-data-[state=open]/coll-settings:shadow-sm group-data-[state=open]/coll-settings:ring-1",
                        "group-data-[state=open]/coll-settings:ring-primary/20"
                      )}
                    >
                      <Settings className="h-4 w-4 shrink-0" />
                      <span className="truncate">Paramètres</span>
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/coll-settings:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {filteredSettings.map((item) => (
                        <SidebarMenuSubItem key={item.href}>
                          <SidebarMenuSubButton
                            asChild
                            size="md"
                            isActive={navItemActive(pathname, item.href)}
                          >
                            <Link
                              href={item.href}
                              className="cursor-pointer"
                              onClick={closeMobileNav}
                            >
                              <item.icon className="text-muted-foreground" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
            ) : (
              <SidebarMenuItem>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      isActive={settingsSectionActive}
                      title="Paramètres"
                      className={cn(
                        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        "data-[state=open]:bg-[hsl(var(--sidebar-active))]",
                        "data-[state=open]:text-sidebar-accent-foreground",
                        "data-[state=open]:shadow-sm data-[state=open]:ring-1",
                        "data-[state=open]:ring-primary/20"
                      )}
                    >
                      <Settings className="h-4 w-4 shrink-0" />
                      <span className="truncate">Paramètres</span>
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-52 rounded-lg shadow-md"
                    side="top"
                    align="start"
                    sideOffset={8}
                  >
                    {filteredSettings.map((item) => (
                      <DropdownMenuItem
                        key={item.href}
                        asChild
                        className="focus:bg-sidebar-accent focus:text-sidebar-accent-foreground data-[highlighted]:bg-sidebar-accent data-[highlighted]:text-sidebar-accent-foreground"
                      >
                        <Link
                          href={item.href}
                          className="cursor-pointer gap-2"
                          onClick={closeMobileNav}
                        >
                          <item.icon className="h-4 w-4 text-muted-foreground" />
                          <span>{item.title}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarFooter>
      ) : null}
    </Sidebar>
  );
});
