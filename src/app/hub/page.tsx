import { redirect } from "next/navigation";
import { Compass } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { HubAdminActions } from "@/app/hub/_components/hub-admin-actions";
import { HubTabs } from "@/app/hub/_components/hub-tabs";
import { ProjectOverview } from "@/app/hub/_components/project-overview";
import { getCurrentUser } from "@/lib/get-current-user";
import { getHangoutSummaries } from "@/lib/hangouts";
import { getInitiativeOptions, getProjectSummaries } from "@/lib/hub";

export default async function HubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const isAdmin = user.role === "ADMIN";
  const [projects, initiatives, hangouts] = await Promise.all([
    getProjectSummaries(),
    isAdmin ? getInitiativeOptions() : Promise.resolve([]),
    getHangoutSummaries(user.id),
  ]);

  return (
    <div className="space-y-6">
      <HubTabs active="/hub" />
      {isAdmin ? <HubAdminActions initiatives={initiatives} /> : null}

      {projects.length === 0 && hangouts.length === 0 ? (
        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
              <Compass className="text-muted-foreground size-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">Nothing planned yet</h2>
              <p className="text-muted-foreground max-w-md text-sm leading-6">
                {isAdmin
                  ? "Create the first hangout or project to start planning."
                  : "Hangouts and projects the team is planning will show up here."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ProjectOverview projects={projects} hangouts={hangouts} />
      )}
    </div>
  );
}
