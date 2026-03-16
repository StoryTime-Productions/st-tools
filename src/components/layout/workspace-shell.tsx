import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import type { Role } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Clock3, FolderKanban, Home, LogOut, Settings, Users } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WorkspaceNavKey = "overview" | "boards" | "profile" | "members";

export interface WorkspaceShellUser {
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: Role;
}

interface WorkspaceShellProps {
  user: WorkspaceShellUser;
  activeNav: WorkspaceNavKey;
  title: string;
  description: string;
  children: ReactNode;
}

interface SidebarItemConfig {
  href: string;
  label: string;
  caption: string;
  icon: LucideIcon;
  key?: WorkspaceNavKey;
  disabled?: boolean;
  badge?: string;
}

function getInitials(name?: string | null, email?: string): string {
  if (name) {
    return name
      .split(" ")
      .map((chunk) => chunk[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return (email?.[0] ?? "?").toUpperCase();
}

function SidebarItem({ item, isActive }: { item: SidebarItemConfig; isActive: boolean }) {
  const Icon = item.icon;

  const content = (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-2xl border px-3 py-3 transition-colors",
        isActive
          ? "bg-foreground text-background border-transparent shadow-sm"
          : "hover:border-border/70 hover:bg-background/80 border-transparent",
        item.disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-xl",
          isActive ? "bg-background/15 text-background" : "bg-muted text-foreground"
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{item.label}</p>
          {item.badge ? (
            <Badge
              variant="outline"
              className={cn(isActive && "border-white/20 bg-white/10 text-white")}
            >
              {item.badge}
            </Badge>
          ) : null}
        </div>
        <p
          className={cn(
            "truncate text-xs",
            isActive ? "text-background/70" : "text-muted-foreground"
          )}
        >
          {item.caption}
        </p>
      </div>
    </div>
  );

  if (item.disabled) {
    return content;
  }

  return (
    <Link href={item.href} className="block">
      {content}
    </Link>
  );
}

export function WorkspaceShell({
  user,
  activeNav,
  title,
  description,
  children,
}: WorkspaceShellProps) {
  const isAdmin = user.role === "ADMIN";

  const primaryItems: SidebarItemConfig[] = [
    {
      href: "/dashboard",
      label: "Overview",
      caption: "Home and workspace status",
      icon: Home,
      key: "overview",
    },
    {
      href: "/boards",
      label: "Boards",
      caption: "Personal Kanban planning",
      icon: FolderKanban,
      key: "boards",
    },
    {
      href: "/settings/profile",
      label: "Profile",
      caption: "Identity and avatar settings",
      icon: Settings,
      key: "profile",
    },
  ];

  if (isAdmin) {
    primaryItems.push({
      href: "/admin/members",
      label: "Members",
      caption: "Roles and access control",
      icon: Users,
      key: "members",
    });
  }

  const upcomingItems: SidebarItemConfig[] = [
    {
      href: "#",
      label: "Focus",
      caption: "Pomodoro sessions",
      icon: Clock3,
      disabled: true,
      badge: "Soon",
    },
    {
      href: "#",
      label: "Docs",
      caption: "Shared knowledge base",
      icon: BookOpen,
      disabled: true,
      badge: "Soon",
    },
  ];

  return (
    <div className="bg-muted/30 min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="border-border/70 bg-background/90 hidden w-72 shrink-0 border-r px-4 py-5 backdrop-blur lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2 py-2">
            <Image
              src="/icon.jpg"
              alt="StoryTime Tools"
              width={44}
              height={44}
              className="size-11 rounded-2xl object-cover"
            />
            <div>
              <p className="text-sm font-semibold tracking-tight">StoryTime Tools</p>
              <p className="text-muted-foreground text-xs">Internal workspace</p>
            </div>
          </div>

          <div className="mt-8 space-y-6">
            <div className="space-y-2">
              <p className="text-muted-foreground px-2 text-xs font-medium tracking-[0.24em] uppercase">
                Workspace
              </p>
              <div className="space-y-1">
                {primaryItems.map((item) => (
                  <SidebarItem key={item.label} item={item} isActive={item.key === activeNav} />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-muted-foreground px-2 text-xs font-medium tracking-[0.24em] uppercase">
                Coming next
              </p>
              <div className="space-y-1">
                {upcomingItems.map((item) => (
                  <SidebarItem key={item.label} item={item} isActive={false} />
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-border/70 bg-background/85 sticky top-0 z-20 border-b backdrop-blur">
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-2 md:px-6">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs font-medium tracking-[0.24em] uppercase lg:hidden">
                  StoryTime Tools
                </p>
                <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
                <p className="text-muted-foreground truncate text-sm">{description}</p>
              </div>

              <div className="flex items-center gap-2 md:gap-3">
                <div className="border-border/70 bg-background hidden items-center gap-3 rounded-2xl border px-3 py-2 md:flex">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {getInitials(user.name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.name ?? user.email}</p>
                    <p className="text-muted-foreground truncate text-xs">{user.email}</p>
                  </div>
                </div>
                <form action={signOutAction}>
                  <Button type="submit" variant="ghost" size="sm" className="gap-2">
                    <LogOut className="size-4" />
                    <span className="hidden sm:inline">Sign out</span>
                  </Button>
                </form>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
