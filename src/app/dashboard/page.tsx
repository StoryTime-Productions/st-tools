import { redirect } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, BookOpen, Clock3, Compass, FolderKanban, User, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/get-current-user";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { LiveTimeWeather } from "./_components/live-time-weather";
import { OnlineUsersCard } from "./_components/online-users-card";
import { PlaylistWidget } from "./_components/playlist-widget";

type DashboardBadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";

type ModuleItem = {
  href: string;
  title: string;
  icon: LucideIcon;
  badge: string;
  badgeVariant: DashboardBadgeVariant;
  disabled?: boolean;
};

function ModuleCard({ item }: { item: ModuleItem }) {
  const Icon = item.icon;
  const badgeClassName =
    item.badge === "Live"
      ? "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/30 dark:text-emerald-300"
      : undefined;

  const content = (
    <Card
      aria-disabled={item.disabled ? true : undefined}
      className={cn(
        "border-border/70 bg-background/80 h-full rounded-3xl shadow-none transition duration-200",
        item.disabled ? "bg-muted/40" : "hover:shadow-lg motion-safe:hover:-translate-y-0.5"
      )}
    >
      <CardHeader className="gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="bg-muted text-foreground flex size-12 items-center justify-center rounded-2xl">
            <Icon className="size-5" />
          </div>
          <Badge variant={item.badgeVariant} className={badgeClassName}>
            {item.badge}
          </Badge>
        </div>
        <CardTitle className="text-base">{item.title}</CardTitle>
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

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const isAdmin = user.role === "ADMIN";
  const firstName = user.name?.split(" ")[0] ?? user.email.split("@")[0] ?? "there";

  const workspaceModules: ModuleItem[] = [
    {
      href: "/settings/profile",
      title: "Profile settings",
      icon: User,
      badge: "Live",
      badgeVariant: "secondary",
    },
    ...(isAdmin
      ? [
          {
            href: "/admin/members",
            title: "Member access",
            icon: Users,
            badge: "Live",
            badgeVariant: "secondary" as const,
          },
        ]
      : []),
    {
      href: "/boards",
      title: "Kanban boards",
      icon: FolderKanban,
      badge: "Live",
      badgeVariant: "secondary",
    },
    {
      href: "/hub",
      title: "Hub",
      icon: Compass,
      badge: "Live",
      badgeVariant: "secondary",
    },
    {
      href: "/timer",
      title: "Pomodoro",
      icon: Clock3,
      badge: "Live",
      badgeVariant: "secondary",
    },
    {
      href: "#",
      title: "Knowledge base",
      icon: BookOpen,
      badge: "Soon",
      badgeVariant: "outline",
      disabled: true,
    },
  ];

  return (
    <WorkspaceShell user={user} activeNav="overview" title="Dashboard">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card className="overflow-hidden rounded-4xl border-0 bg-slate-950 text-white shadow-xl shadow-slate-950/10">
            <CardContent className="p-6 md:p-8">
              <LiveTimeWeather firstName={firstName} />
            </CardContent>
          </Card>

          <section className="space-y-4">
            <div>
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
          <OnlineUsersCard
            currentUser={{
              id: user.id,
              name: user.name,
              email: user.email,
              avatarUrl: user.avatarUrl,
            }}
          />
          <PlaylistWidget discordId={user.discordId} />
        </div>
      </div>
    </WorkspaceShell>
  );
}
