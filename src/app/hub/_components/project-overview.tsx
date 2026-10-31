"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ProjectCover } from "@/app/hub/_components/project-cover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { Button } from "@/components/ui/button";
import { dayLabel, timeLabel } from "@/lib/calendar";
import type { HangoutCardInfo } from "@/lib/hangouts";
import type { ProjectSummary } from "@/lib/hub";
import {
  groupByInitiative,
  groupByQuarter,
  HANGOUT_STATUS_LABEL,
  projectInitials,
  sortBySoonestEnd,
  type ProjectGroup,
} from "@/lib/hub-format";
import { linkIcon, linkLabel } from "@/lib/hub-links";

const VIEWS = [
  { value: "list", label: "List" },
  { value: "quarter", label: "By quarter" },
  { value: "initiative", label: "By initiative" },
] as const;
type View = (typeof VIEWS)[number]["value"];

const MODES = [
  { value: "mixed", label: "Mixed" },
  { value: "separate", label: "Separate" },
] as const;
type Mode = (typeof MODES)[number]["value"];

const MAX_AVATARS = 5;

function persisted<T extends string>(key: string, values: readonly T[], fallback: T) {
  const listeners = new Set<() => void>();
  let memory = fallback;
  return {
    fallback,
    read(): T {
      try {
        const saved = localStorage.getItem(key);
        if (values.includes(saved as T)) return saved as T;
      } catch {}
      return memory;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    choose(next: T) {
      memory = next;
      try {
        localStorage.setItem(key, next);
      } catch {}
      listeners.forEach((listener) => listener());
    },
  };
}

type Store<T extends string> = ReturnType<typeof persisted<T>>;

const viewStore = persisted<View>(
  "hub-overview-view",
  VIEWS.map((option) => option.value),
  "list"
);
const modeStore = persisted<Mode>(
  "hub-overview-mode",
  MODES.map((option) => option.value),
  "mixed"
);

function usePersisted<T extends string>(store: Store<T>) {
  return useSyncExternalStore(store.subscribe, store.read, () => store.fallback);
}

type Item =
  | (ProjectSummary & { kind: "project" })
  | {
      kind: "hangout";
      id: string;
      title: string;
      startQuarter: string | null;
      endQuarter: string | null;
      initiativeName: string;
      hangout: HangoutCardInfo;
    };

function hangoutItem(hangout: HangoutCardInfo): Item {
  const quarter = hangout.startSlot
    ? `${hangout.startSlot.slice(0, 4)}-Q${Math.ceil(Number(hangout.startSlot.slice(5, 7)) / 3)}`
    : null;
  return {
    kind: "hangout",
    id: hangout.id,
    title: hangout.title,
    startQuarter: quarter,
    endQuarter: quarter,
    initiativeName: "Hangouts",
    hangout,
  };
}

function groupItems(items: Item[], view: View, undatedLabel: string): ProjectGroup<Item>[] {
  if (view === "quarter") return groupByQuarter(items, undatedLabel);
  if (view === "initiative") return groupByInitiative(items);
  return [{ label: "", projects: sortBySoonestEnd(items) }];
}

function isPast(item: Item) {
  return item.kind === "project"
    ? item.finished
    : item.hangout.phase === "CANCELLED" || item.hangout.phase === "DONE";
}

export function ProjectOverview({
  projects,
  hangouts = [],
}: {
  projects: ProjectSummary[];
  hangouts?: HangoutCardInfo[];
}) {
  const view = usePersisted(viewStore);
  const mode = usePersisted(modeStore);
  const [showPast, setShowPast] = useState(false);

  const projectItems = projects
    .map((project): Item => ({ ...project, kind: "project" }))
    .filter((item) => isPast(item) === showPast);
  const hangoutItems = hangouts.map(hangoutItem).filter((item) => isPast(item) === showPast);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedToggle label="Layout" options={MODES} value={mode} onChange={modeStore.choose} />
        <SegmentedToggle label="View" options={VIEWS} value={view} onChange={viewStore.choose} />
        <Button
          type="button"
          size="sm"
          className="sm:ml-auto"
          variant={showPast ? "default" : "outline"}
          aria-pressed={showPast}
          onClick={() => setShowPast((current) => !current)}
        >
          {showPast ? <Check aria-hidden="true" className="size-3.5" /> : null}
          Past
        </Button>
      </div>

      {mode === "mixed" ? (
        <ItemGroups
          groups={groupItems([...hangoutItems, ...projectItems], view, "No date")}
          empty={
            showPast
              ? "Nothing finished or cancelled yet."
              : "Nothing active. Finished and cancelled items are under Past."
          }
        />
      ) : (
        <>
          <section aria-label="Hangouts" className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Hangouts</h2>
            <ItemGroups
              groups={[{ label: "", projects: sortBySoonestEnd(hangoutItems) }]}
              empty={showPast ? "No cancelled hangouts." : "No hangouts planned."}
            />
          </section>
          <section aria-label="Projects" className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Projects</h2>
            <ItemGroups
              nested
              groups={groupItems(projectItems, view, "No quarter")}
              empty={
                showPast
                  ? "No finished projects yet."
                  : "No active projects. Finished ones are under Past."
              }
            />
          </section>
        </>
      )}
    </div>
  );
}

function ItemGroups({
  groups,
  empty,
  nested = false,
}: {
  groups: ProjectGroup<Item>[];
  empty: string;
  nested?: boolean;
}) {
  const Heading = nested ? "h3" : "h2";
  if (groups.every((group) => group.projects.length === 0)) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }
  return groups.map((group) => (
    <section key={group.label || "all"} aria-label={group.label || undefined} className="space-y-3">
      {group.label ? <Heading className="text-sm font-medium">{group.label}</Heading> : null}
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {group.projects.map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            {item.kind === "project" ? (
              <ProjectCard project={item} />
            ) : (
              <HangoutCard hangout={item.hangout} />
            )}
          </li>
        ))}
      </ul>
    </section>
  ));
}

const DEADLINE = {
  timeZone: "America/Toronto",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;

/** The one line that says what a hangout needs from you: when it is, or whether to fill in availability. */
function hangoutWhen(hangout: HangoutCardInfo) {
  if (hangout.phase === "COLLECTING") {
    const due = hangout.availabilityDeadline ? new Date(hangout.availabilityDeadline) : null;
    const deadline =
      due && due.getTime() >= Date.now()
        ? ` · fill in by ${due.toLocaleString("en-US", DEADLINE)}`
        : "";
    return `${hangout.responded ? "You've responded" : "You haven't responded"}${deadline}`;
  }
  if (hangout.startSlot) {
    const [day, time] = hangout.startSlot.split("T");
    return `${dayLabel(day, { weekday: "short", month: "short", day: "numeric" })} · ${timeLabel(time)}`;
  }
  return null;
}

function deadlinePassed(hangout: HangoutCardInfo) {
  return (
    hangout.phase === "COLLECTING" &&
    hangout.availabilityDeadline !== null &&
    new Date(hangout.availabilityDeadline).getTime() < Date.now()
  );
}

function HangoutCard({ hangout }: { hangout: HangoutCardInfo }) {
  return (
    <Link
      href={`/hub/hangouts/${hangout.id}`}
      className="border-border/70 bg-background/85 hover:bg-muted/40 focus-visible:ring-ring flex h-full items-start gap-4 rounded-3xl border p-5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <ProjectCover title={hangout.title} coverImageUrl={hangout.coverImageUrl} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-1">
          <p className="truncate font-medium">{hangout.title}</p>
          <p className="text-muted-foreground text-xs">Hangout</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={hangout.phase === "CANCELLED" ? "outline" : "secondary"}>
            {HANGOUT_STATUS_LABEL[hangout.phase]}
          </Badge>
          {hangout.phase === "SETTLING_UP" ? (
            <Badge variant="outline">
              {hangout.toConfirm > 0
                ? `${hangout.unpaid - hangout.toConfirm} unpaid · ${hangout.toConfirm} to confirm`
                : `${hangout.unpaid} unpaid`}
            </Badge>
          ) : null}
          {deadlinePassed(hangout) ? <Badge variant="outline">Deadline passed</Badge> : null}
        </div>
        {hangoutWhen(hangout) ? <p className="text-sm">{hangoutWhen(hangout)}</p> : null}
      </div>
    </Link>
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
          <p className="text-muted-foreground line-clamp-2 text-xs">
            {project.initiativeName ?? "No initiative"}
            {project.quarterLabel ? ` · ${project.quarterLabel}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {project.currentPhase ? <Badge variant="secondary">{project.currentPhase}</Badge> : null}
          {project.finished ? <Badge variant="outline">Finished</Badge> : null}
          {project.linkUrls.length > 0 ? (
            <span className="flex items-center gap-2">
              <span className="sr-only">
                Links: {project.linkUrls.map((url) => linkLabel(url)).join(", ")}
              </span>
              {project.linkUrls.map((url, index) => {
                const Icon = linkIcon(url);
                return (
                  <Icon
                    key={`${url}-${index}`}
                    className="text-muted-foreground size-4"
                    aria-hidden="true"
                  />
                );
              })}
            </span>
          ) : null}
        </div>
        {project.participants.length > 0 ? (
          <div
            role="img"
            className="flex items-center -space-x-2"
            aria-label={`${project.participants.length} ${project.participants.length === 1 ? "participant" : "participants"}: ${project.participants.map((participant) => participant.name).join(", ")}`}
          >
            {project.participants.slice(0, MAX_AVATARS).map((participant) => (
              <Avatar key={participant.id} className="border-background size-7 border-2">
                <AvatarImage src={participant.avatarUrl ?? undefined} alt="" />
                <AvatarFallback className="text-[10px]">
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
