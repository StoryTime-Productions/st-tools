import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectCover } from "@/app/hub/_components/project-cover";
import { ProjectBoards } from "@/app/hub/projects/[projectId]/_components/project-boards";
import { ProjectAdminControls } from "@/app/hub/projects/[projectId]/_components/project-admin-controls";
import { getCurrentUser } from "@/lib/get-current-user";
import {
  getInitiativeOptions,
  getProjectDetail,
  getProjectWork,
  getStandaloneBoardOptions,
} from "@/lib/hub";
import { formatQuarterRange, projectInitials } from "@/lib/hub-format";
import { linkIcon } from "@/lib/hub-links";
import { prisma } from "@/lib/prisma";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const { projectId } = await params;
  const project = await getProjectDetail(projectId);
  if (!project) notFound();

  const isAdmin = user.role === "ADMIN";
  const [initiatives, tagOptions, standaloneBoards] = isAdmin
    ? await Promise.all([
        getInitiativeOptions(),
        prisma.tag
          .findMany({ select: { name: true }, orderBy: { name: "asc" } })
          .then((tags) => tags.map((tag) => tag.name)),
        getStandaloneBoardOptions(),
      ])
    : [[], [], null];
  const work = await getProjectWork(project.id, user);
  const quarterLabel = formatQuarterRange(project.startQuarter, project.endQuarter);

  return (
    <div className="space-y-6">
      <Link
        href="/hub"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft className="size-4" />
        All projects
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <ProjectCover
            title={project.title}
            coverImageUrl={project.coverImageUrl}
            className="size-16 text-lg"
          />
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">{project.title}</h2>
            <p className="text-muted-foreground text-sm">
              {project.initiativeName ?? "No initiative"}
              {quarterLabel ? ` · ${quarterLabel}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {project.finished ? <Badge variant="outline">Finished</Badge> : null}
              {project.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {isAdmin ? (
          <ProjectAdminControls
            project={project}
            initiatives={initiatives}
            tagOptions={tagOptions}
          />
        ) : null}
      </div>

      {project.description ? (
        <p className="max-w-3xl text-sm leading-6 whitespace-pre-line">{project.description}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Phases</CardTitle>
          </CardHeader>
          <CardContent>
            {project.phases.length === 0 ? (
              <p className="text-muted-foreground text-sm">No phases yet.</p>
            ) : (
              <ol className="space-y-2">
                {project.phases.map((phase, index) => {
                  const isCurrent = index === project.currentPhaseIndex;
                  return (
                    <li
                      key={`${index}-${phase}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-2 text-sm"
                      aria-current={isCurrent ? "step" : undefined}
                    >
                      <span>
                        <span className="text-muted-foreground mr-2">{index + 1}.</span>
                        {phase}
                      </span>
                      {isCurrent ? <Badge>Current</Badge> : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Links</CardTitle>
          </CardHeader>
          <CardContent>
            {project.links.length === 0 ? (
              <p className="text-muted-foreground text-sm">No links yet.</p>
            ) : (
              <ul className="space-y-2">
                {project.links.map((link) => {
                  const Icon = linkIcon(link.url);
                  return (
                    <li key={`${link.label}-${link.url}`}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:bg-muted/40 flex items-center gap-3 rounded-2xl border px-4 py-2 text-sm"
                      >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{link.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Boards</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectBoards
              projectId={project.id}
              boards={work.boards}
              standaloneBoards={standaloneBoards}
              accessRequests={work.accessRequests}
            />
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Participants</CardTitle>
          </CardHeader>
          <CardContent>
            {work.participants.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Members of this project&apos;s boards show up here.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-3">
                {work.participants.map((participant) => (
                  <li key={participant.id} className="flex items-center gap-2 text-sm">
                    <Avatar className="size-8">
                      <AvatarImage src={participant.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback>{projectInitials(participant.name)}</AvatarFallback>
                    </Avatar>
                    {participant.name}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Available tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {work.availableTasks.length === 0 ? (
              <p className="text-muted-foreground text-sm">No unassigned cards.</p>
            ) : (
              <ul className="space-y-2">
                {work.availableTasks.map((task) => (
                  <li key={task.id}>
                    <Link
                      href={`/boards/${task.boardId}?card=${task.id}`}
                      className="hover:bg-muted/40 flex items-center justify-between gap-3 rounded-2xl border px-4 py-2 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{task.title}</span>
                        <span className="text-muted-foreground text-xs">{task.boardTitle}</span>
                      </span>
                      {task.dueDate ? (
                        <span className="text-muted-foreground shrink-0 text-xs">
                          Due{" "}
                          {task.dueDate.toLocaleDateString("en-CA", {
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          })}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
