import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Clock3,
  FolderKanban,
  Home,
  LogOut,
  Settings,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/get-current-user";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveTimeWeather } from "./_components/live-time-weather";
import { PuppyOfTheDayCard } from "./_components/puppy-of-the-day";

type DashboardBadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";

type SidebarItem = {
  href: string;
  label: string;
  caption: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  badgeVariant?: DashboardBadgeVariant;
};

type ModuleItem = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badge: string;
  badgeVariant: DashboardBadgeVariant;
  disabled?: boolean;
};

type MetricItem = {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
};

function initials(name?: string | null, email?: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return (email?.[0] ?? "?").toUpperCase();
}

function SidebarNavItem({ item }: { item: SidebarItem }) {
  const Icon = item.icon;
  const badgeVariant = item.badgeVariant ?? "outline";

  const content = (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-2xl border px-3 py-3 transition-colors",
        item.active
          ? "bg-foreground text-background border-transparent shadow-sm"
          : "hover:border-border/70 hover:bg-background/80 border-transparent",
        item.disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-xl",
          item.active ? "bg-background/15 text-background" : "bg-muted text-foreground"
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{item.label}</p>
          {item.badge ? (
            <Badge
              variant={badgeVariant}
              className={cn(item.active && "border-white/20 bg-white/10 text-white")}
            >
              {item.badge}
            </Badge>
          ) : null}
        </div>
        <p
          className={cn(
            "truncate text-xs",
            item.active ? "text-background/70" : "text-muted-foreground"
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

function ModuleCard({ item }: { item: ModuleItem }) {
  const Icon = item.icon;

  const content = (
    <Card
      className={cn(
        "border-border/70 bg-background/80 h-full rounded-3xl shadow-none transition duration-200",
        item.disabled ? "opacity-70" : "hover:-translate-y-0.5 hover:shadow-lg"
      )}
    >
      <CardHeader className="gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="bg-muted text-foreground flex size-12 items-center justify-center rounded-2xl">
            <Icon className="size-5" />
          </div>
          <Badge variant={item.badgeVariant}>{item.badge}</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle className="text-base">{item.title}</CardTitle>
          <CardDescription className="leading-6">{item.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
        <span>{item.disabled ? "Planned area" : "Open area"}</span>
        {!item.disabled ? <ArrowUpRight className="size-4" /> : null}
      </CardContent>
    </Card>
  );

  if (item.disabled) {
    return content;
  }

  return (
    <Link href={item.href} className="block h-full">
      {content}
    </Link>
  );
}

function MetricCard({ item }: { item: MetricItem }) {
  const Icon = item.icon;

  return (
    <Card className="border-border/70 bg-background/80 rounded-3xl shadow-none">
      <CardHeader className="gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardDescription className="text-xs tracking-[0.22em] uppercase">
              {item.label}
            </CardDescription>
            <CardTitle className="mt-3 text-2xl tracking-tight">{item.value}</CardTitle>
          </div>
          <div className="bg-muted text-foreground flex size-11 items-center justify-center rounded-2xl">
            <Icon className="size-5" />
          </div>
        </div>
        <CardDescription className="leading-6">{item.note}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const isAdmin = user.role === "ADMIN";
  const firstName = user.name?.split(" ")[0] ?? user.email.split("@")[0] ?? "there";
  const memberSince = user.createdAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const primaryNavItems: SidebarItem[] = [
    {
      href: "/dashboard",
      label: "Overview",
      caption: "Home and workspace status",
      icon: Home,
      active: true,
    },
    {
      href: "/settings/profile",
      label: "Profile",
      caption: "Identity and avatar settings",
      icon: Settings,
    },
  ];

  if (isAdmin) {
    primaryNavItems.push({
      href: "/admin/members",
      label: "Members",
      caption: "Roles and access control",
      icon: Users,
    });
  }

  const upcomingNavItems: SidebarItem[] = [
    {
      href: "#",
      label: "Boards",
      caption: "Visual project planning",
      icon: FolderKanban,
      disabled: true,
      badge: "Soon",
    },
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

  const workspaceModules: ModuleItem[] = [
    {
      href: "/settings/profile",
      title: "Profile settings",
      description: "Update your name and avatar so the workspace stays accurate and recognizable.",
      icon: User,
      badge: "Live",
      badgeVariant: "secondary",
    },
    {
      href: isAdmin ? "/admin/members" : "#",
      title: "Member access",
      description: isAdmin
        ? "Review roles, keep permissions tight, and manage who can administer the workspace."
        : "Reserved for admins to manage roles and workspace access when needed.",
      icon: Users,
      badge: isAdmin ? "Live" : "Admin",
      badgeVariant: isAdmin ? "secondary" : "outline",
      disabled: !isAdmin,
    },
    {
      href: "#",
      title: "Kanban boards",
      description: "Organize work with boards, columns, and cards in a familiar project flow.",
      icon: FolderKanban,
      badge: "Soon",
      badgeVariant: "outline",
      disabled: true,
    },
    {
      href: "#",
      title: "Pomodoro",
      description:
        "Track deep-work sessions and personal productivity directly from the workspace.",
      icon: Clock3,
      badge: "Soon",
      badgeVariant: "outline",
      disabled: true,
    },
    {
      href: "#",
      title: "Knowledge base",
      description: "Capture internal documentation and make team context easier to find.",
      icon: BookOpen,
      badge: "Soon",
      badgeVariant: "outline",
      disabled: true,
    },
  ];

  const metrics: MetricItem[] = [
    {
      label: "Access level",
      value: isAdmin ? "Admin" : "Member",
      note: isAdmin
        ? "You can review roles and workspace access."
        : "Standard workspace access is active.",
      icon: ShieldCheck,
    },
    {
      label: "Member since",
      value: memberSince,
      note: "Your account was provisioned automatically from Supabase authentication.",
      icon: CalendarDays,
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
                {primaryNavItems.map((item) => (
                  <SidebarNavItem key={item.label} item={item} />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-muted-foreground px-2 text-xs font-medium tracking-[0.24em] uppercase">
                Coming next
              </p>
              <div className="space-y-1">
                {upcomingNavItems.map((item) => (
                  <SidebarNavItem key={item.label} item={item} />
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-border/70 bg-background/85 sticky top-0 z-20 border-b backdrop-blur">
            <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-6">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs font-medium tracking-[0.24em] uppercase lg:hidden">
                  StoryTime Tools
                </p>
                <h1 className="truncate text-lg font-semibold tracking-tight">Dashboard</h1>
              </div>

              <div className="flex items-center gap-2 md:gap-3">
                <div className="border-border/70 bg-background hidden items-center gap-3 rounded-2xl border px-3 py-2 md:flex">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {initials(user.name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.name ?? firstName}</p>
                    <p className="text-muted-foreground truncate text-xs">{user.email}</p>
                  </div>
                </div>
                <form action={signOutAction}>
                  <Button type="submit" variant="ghost" size="sm">
                    <LogOut className="size-4" />
                    <span className="hidden sm:inline">Sign out</span>
                  </Button>
                </form>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 md:px-6 md:py-8">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <Card className="overflow-hidden rounded-4xl border-0 bg-slate-950 text-white shadow-xl shadow-slate-950/10">
                  <CardContent className="p-6 md:p-8">
                    <LiveTimeWeather firstName={firstName} />
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  {metrics.map((item) => (
                    <MetricCard key={item.label} item={item} />
                  ))}
                </div>

                <section className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium tracking-[0.24em] uppercase">
                      Workspace areas
                    </p>
                    <h3 className="text-2xl font-semibold tracking-tight">Quick access</h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {workspaceModules.map((item) => (
                      <ModuleCard key={item.title} item={item} />
                    ))}
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
                  <CardHeader className="gap-5">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-14 w-14 rounded-2xl">
                        <AvatarImage src={user.avatarUrl ?? undefined} />
                        <AvatarFallback className="rounded-2xl text-sm">
                          {initials(user.name, user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-lg">{user.name ?? firstName}</CardTitle>
                        <CardDescription className="truncate text-sm">{user.email}</CardDescription>
                      </div>
                    </div>

                    <div className="bg-muted/70 grid gap-3 rounded-2xl p-4 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Role</span>
                        <Badge variant="secondary">{isAdmin ? "Admin" : "Member"}</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Joined</span>
                        <span className="font-medium">{memberSince}</span>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <PuppyOfTheDayCard />
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
