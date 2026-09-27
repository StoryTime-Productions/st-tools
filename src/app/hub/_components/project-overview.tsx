"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ProjectCover } from "@/app/hub/_components/project-cover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProjectSummary } from "@/lib/hub";
import {
  groupByInitiative,
  groupByQuarter,
  projectInitials,
  sortBySoonestEnd,
  type ProjectGroup,
} from "@/lib/hub-format";
import { linkIcon } from "@/lib/hub-links";

const VIEWS = [
  { value: "list", label: "List" },
  { value: "quarter", label: "By quarter" },
  { value: "initiative", label: "By initiative" },
] as const;
type View = (typeof VIEWS)[number]["value"];

const VIEW_KEY = "hub-overview-view";
const MAX_AVATARS = 5;

const viewListeners = new Set<() => void>();
let memoryView: View = "list";

function readView(): View {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (VIEWS.some((option) => option.value === saved)) return saved as View;
  } catch {}
  return memoryView;
}

function subscribeView(listener: () => void) {
  viewListeners.add(listener);
  return () => viewListeners.delete(listener);
}

function chooseView(next: View) {
  memoryView = next;
  try {
    localStorage.setItem(VIEW_KEY, next);
  } catch {}
  viewListeners.forEach((listener) => listener());
}

function groupProjects(projects: ProjectSummary[], view: View): ProjectGroup<ProjectSummary>[] {
  if (view === "quarter") return groupByQuarter(projects);
  if (view === "initiative") return groupByInitiative(projects);
  return [{ label: "", projects: sortBySoonestEnd(projects) }];
}

export function ProjectOverview({ projects }: { projects: ProjectSummary[] }) {
  const view = useSyncExternalStore(subscribeView, readView, () => "list" as View);
  const [showPast, setShowPast] = useState(false);

  const visible = projects.filter((project) => project.finished === showPast);
  const groups = groupProjects(visible, view);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="View" className="bg-muted inline-flex rounded-xl p-1">
          {VIEWS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={view === option.value ? "default" : "ghost"}
              aria-pressed={view === option.value}
              onClick={() => chooseView(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant={showPast ? "default" : "outline"}
          aria-pressed={showPast}
          onClick={() => setShowPast((current) => !current)}
        >
          Past
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {showPast
            ? "No finished projects yet."
            : "No active projects. Finished ones are under Past."}
        </p>
      ) : (
        groups.map((group) => (
          <section
            key={group.label || "all"}
            aria-label={group.label || undefined}
            className="space-y-3"
          >
            {group.label ? <h3 className="text-sm font-medium">{group.label}</h3> : null}
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.projects.map((project) => (
                <li key={project.id}>
                  <ProjectCard project={project} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const extra = project.participants.length - MAX_AVATARS;

  return (
    <Link
      href={`/hub/projects/${project.id}`}
      className="border-border/70 bg-background/85 hover:bg-muted/40 focus-visible:ring-ring flex h-full items-start gap-4 rounded-3xl border p-5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <ProjectCover title={project.title} coverImageUrl={project.coverImageUrl} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-1">
          <p className="truncate font-medium">{project.title}</p>
          <p className="text-muted-foreground truncate text-xs">
            {project.initiativeName ?? "No initiative"}
            {project.quarterLabel ? ` · ${project.quarterLabel}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {project.currentPhase ? <Badge variant="secondary">{project.currentPhase}</Badge> : null}
          {project.finished ? <Badge variant="outline">Finished</Badge> : null}
          {project.linkUrls.map((url) => {
            const Icon = linkIcon(url);
            return <Icon key={url} className="text-muted-foreground size-4" aria-hidden="true" />;
          })}
        </div>
        {project.participants.length > 0 ? (
          <div
            className="flex items-center -space-x-2"
            aria-label={`${project.participants.length} participants`}
          >
            {project.participants.slice(0, MAX_AVATARS).map((participant) => (
              <Avatar key={participant.id} className="border-background size-7 border-2">
                <AvatarImage src={participant.avatarUrl ?? undefined} alt="" />
                <AvatarFallback className="text-[10px]" title={participant.name}>
                  {projectInitials(participant.name)}
                </AvatarFallback>
              </Avatar>
            ))}
            {extra > 0 ? (
              <span className="text-muted-foreground pl-3 text-xs">+{extra}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
