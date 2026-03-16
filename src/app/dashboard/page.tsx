import { redirect } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, BookOpen, Clock3, FolderKanban, User, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/get-current-user";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { LiveTimeWeather } from "./_components/live-time-weather";
import { PuppyOfTheDayCard } from "./_components/puppy-of-the-day";

type DashboardBadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";

type ModuleItem = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badge: string;
  badgeVariant: DashboardBadgeVariant;
  disabled?: boolean;
};

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
      href: "/boards",
      title: "Kanban boards",
      description: "Organize work with boards, columns, and cards in a familiar project flow.",
      icon: FolderKanban,
      badge: "Live",
      badgeVariant: "secondary",
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

  return (
    <WorkspaceShell
      user={user}
      activeNav="overview"
      title="Dashboard"
      description="Overview of workspace status, access, and quick links."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card className="overflow-hidden rounded-4xl border-0 bg-slate-950 text-white shadow-xl shadow-slate-950/10">
            <CardContent className="p-6 md:p-8">
              <LiveTimeWeather firstName={firstName} />
            </CardContent>
          </Card>

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
          <PuppyOfTheDayCard />
        </div>
      </div>
    </WorkspaceShell>
  );
}
