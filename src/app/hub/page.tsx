import Link from "next/link";
import { redirect } from "next/navigation";
import { Compass } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { HangoutDialog } from "@/app/hub/_components/hangout-dialog";
import { HubTabs } from "@/app/hub/_components/hub-tabs";
import { ManageInitiativesDialog } from "@/app/hub/_components/manage-initiatives-dialog";
import { NewProjectDialog } from "@/app/hub/_components/new-project-dialog";
import { ProjectCover } from "@/app/hub/_components/project-cover";
import { ProjectOverview } from "@/app/hub/_components/project-overview";
import { getCurrentUser } from "@/lib/get-current-user";
import { getHangoutSummaries, HANGOUT_STATUS_LABEL } from "@/lib/hangouts";
import { getInitiativeOptions, getProjectSummaries } from "@/lib/hub";

export default async function HubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const isAdmin = user.role === "ADMIN";
  const [projects, initiatives, hangouts] = await Promise.all([
    getProjectSummaries(),
    isAdmin ? getInitiativeOptions() : Promise.resolve([]),
    getHangoutSummaries(),
  ]);

  return (
    <div className="space-y-6">
      <HubTabs active="/hub" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Hangouts</h2>
        {isAdmin ? <HangoutDialog /> : null}
      </div>
      {hangouts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hangouts planned yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hangouts.map((hangout) => (
            <li key={hangout.id}>
              <Link
                href={`/hub/hangouts/${hangout.id}`}
                className="border-border/70 bg-background/85 hover:bg-muted/40 flex items-center gap-3 rounded-3xl border p-4"
              >
                <ProjectCover title={hangout.title} coverImageUrl={hangout.coverImageUrl} />
                <span className="min-w-0 space-y-1">
                  <span className="block truncate font-medium">{hangout.title}</span>
                  <Badge variant="secondary">{HANGOUT_STATUS_LABEL[hangout.status]}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Projects</h2>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <ManageInitiativesDialog initiatives={initiatives} />
            <NewProjectDialog initiatives={initiatives} />
          </div>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
              <Compass className="text-muted-foreground size-7" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold tracking-tight">No projects yet</h3>
              <p className="text-muted-foreground max-w-md text-sm leading-6">
                {isAdmin
                  ? "Create the first project to start planning phases, links and boards."
                  : "Projects the team is working on will show up here."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ProjectOverview projects={projects} />
      )}
    </div>
  );
}
