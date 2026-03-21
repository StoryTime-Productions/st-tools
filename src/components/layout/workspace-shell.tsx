import Link from "next/link";
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { Role } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Clock3, FolderKanban, Home, LogOut, Settings, Users } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { OnlinePresenceTracker } from "@/components/layout/online-presence-tracker";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WorkspaceNavKey = "overview" | "boards" | "focus" | "profile" | "members";

export interface WorkspaceShellUser {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: Role;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundMode?: "NONE" | "COLOR" | "IMAGE";
  backgroundColor?: string | null;
  backgroundImageUrl?: string | null;
  backgroundImageStyle?: "STRETCH" | "PATTERN";
  backgroundPatternScale?: number;
  backgroundImageOpacity?: number;
}

interface WorkspaceShellProps {
  user: WorkspaceShellUser;
  activeNav: WorkspaceNavKey;
  title: string;
  description?: string;
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

type CssVariableStyle = CSSProperties & Record<`--${string}`, string>;

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const DEFAULT_BACKGROUND_PATTERN_SCALE = 100;

function normalizeHexColor(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!HEX_COLOR_PATTERN.test(prefixed)) {
    return null;
  }

  if (prefixed.length === 4) {
    return `#${prefixed[1]}${prefixed[1]}${prefixed[2]}${prefixed[2]}${prefixed[3]}${prefixed[3]}`.toLowerCase();
  }

  return prefixed.toLowerCase();
}

function getReadableForegroundColor(backgroundColor: string): string {
  const normalized = normalizeHexColor(backgroundColor);
  if (!normalized) {
    return "#ffffff";
  }

  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);

  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}

function clampBackgroundOpacity(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 45;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampBackgroundPatternScale(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_BACKGROUND_PATTERN_SCALE;
  }

  return Math.max(10, Math.min(300, Math.round(value)));
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
  const primaryColor = normalizeHexColor(user.primaryColor);
  const secondaryColor = normalizeHexColor(user.secondaryColor);
  const backgroundMode = user.backgroundMode ?? "NONE";
  const backgroundColor =
    backgroundMode === "COLOR" ? normalizeHexColor(user.backgroundColor) : null;
  const backgroundImageUrl =
    backgroundMode === "IMAGE" && user.backgroundImageUrl ? user.backgroundImageUrl : null;
  const backgroundImageStyle = user.backgroundImageStyle ?? "STRETCH";
  const backgroundPatternScale = clampBackgroundPatternScale(user.backgroundPatternScale);
  const backgroundImageOpacity = clampBackgroundOpacity(user.backgroundImageOpacity);
  const hasImageBackground = Boolean(backgroundImageUrl);
  const patternBackgroundSize =
    backgroundPatternScale === DEFAULT_BACKGROUND_PATTERN_SCALE
      ? "auto"
      : `${backgroundPatternScale}% auto`;

  const shellStyle: CssVariableStyle = {};

  if (primaryColor) {
    const primaryForeground = getReadableForegroundColor(primaryColor);
    shellStyle["--primary"] = primaryColor;
    shellStyle["--primary-foreground"] = primaryForeground;
    shellStyle["--ring"] = primaryColor;
    shellStyle["--sidebar-primary"] = primaryColor;
    shellStyle["--sidebar-primary-foreground"] = primaryForeground;
  }

  if (secondaryColor) {
    shellStyle["--secondary"] = secondaryColor;
    shellStyle["--secondary-foreground"] = getReadableForegroundColor(secondaryColor);
  }

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
      href: "/timer",
      label: "Focus",
      caption: "Pomodoro sessions",
      icon: Clock3,
      key: "focus",
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
      label: "Docs",
      caption: "Shared knowledge base",
      icon: BookOpen,
      disabled: true,
      badge: "Soon",
    },
  ];

  return (
    <div data-workspace-shell className="relative min-h-screen" style={shellStyle}>
      {backgroundImageUrl ? (
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage: `url(${backgroundImageUrl})`,
            backgroundPosition: "center",
            backgroundRepeat: backgroundImageStyle === "PATTERN" ? "repeat" : "no-repeat",
            backgroundSize:
              backgroundImageStyle === "PATTERN" ? patternBackgroundSize : "100% 100%",
            opacity: backgroundImageOpacity / 100,
          }}
        />
      ) : null}

      <div
        data-workspace-content-layer
        className={cn(
          "min-h-screen",
          backgroundColor ? "" : hasImageBackground ? "bg-transparent" : "bg-muted/30"
        )}
        style={backgroundColor ? { backgroundColor } : undefined}
      >
        {activeNav === "overview" ? null : (
          <OnlinePresenceTracker
            user={{
              id: user.id,
              name: user.name,
              email: user.email,
              avatarUrl: user.avatarUrl,
            }}
          />
        )}
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
                  {description ? (
                    <p className="text-muted-foreground truncate text-sm">{description}</p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 md:gap-3">
                  <ThemeToggle />
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
    </div>
  );
}
