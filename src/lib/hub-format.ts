import type { HangoutPhase } from "@/lib/lifecycle";

export function formatQuarter(quarter: string): string {
  const [year, q] = quarter.split("-");
  return `${q} ${year}`;
}

export function formatQuarterRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  if (!end || end === start) return formatQuarter(start);
  return `${formatQuarter(start)} – ${formatQuarter(end)}`;
}

export function quarterOptions(now = new Date()): string[] {
  const year = now.getFullYear();
  const options: string[] = [];
  for (let y = year - 1; y <= year + 2; y += 1) {
    for (let q = 1; q <= 4; q += 1) {
      options.push(`${y}-Q${q}`);
    }
  }
  return options;
}

export function projectInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function quartersBetween(start: string, end: string): string[] {
  const toIndex = (quarter: string) => {
    const [year, q] = quarter.split("-Q").map(Number);
    return year * 4 + q - 1;
  };
  const quarters: string[] = [];
  for (let index = toIndex(start); index <= toIndex(end); index += 1) {
    quarters.push(`${Math.floor(index / 4)}-Q${(index % 4) + 1}`);
  }
  return quarters;
}

interface Groupable {
  title: string;
  startQuarter: string | null;
  endQuarter: string | null;
  initiativeName: string | null;
}

export interface ProjectGroup<T> {
  label: string;
  projects: T[];
}

export function sortBySoonestEnd<T extends Groupable>(projects: T[]): T[] {
  return [...projects].sort((left, right) => {
    const a = left.endQuarter ?? "~";
    const b = right.endQuarter ?? "~";
    return a === b ? left.title.localeCompare(right.title) : a < b ? -1 : 1;
  });
}

export const HANGOUT_STATUS_LABEL: Record<HangoutPhase, string> = {
  COLLECTING: "Collecting availability",
  SCHEDULED: "Scheduled",
  SETTLING_UP: "Settling up",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export function groupByQuarter<T extends Groupable>(
  projects: T[],
  undatedLabel = "No quarter"
): ProjectGroup<T>[] {
  const groups = new Map<string, T[]>();
  const undated: T[] = [];
  for (const project of sortBySoonestEnd(projects)) {
    if (!project.startQuarter) {
      undated.push(project);
      continue;
    }
    for (const quarter of quartersBetween(
      project.startQuarter,
      project.endQuarter ?? project.startQuarter
    )) {
      groups.set(quarter, [...(groups.get(quarter) ?? []), project]);
    }
  }
  const dated = [...groups.keys()]
    .sort()
    .map((quarter) => ({ label: formatQuarter(quarter), projects: groups.get(quarter)! }));
  return undated.length > 0 ? [...dated, { label: undatedLabel, projects: undated }] : dated;
}

export function groupByInitiative<T extends Groupable>(projects: T[]): ProjectGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const project of sortBySoonestEnd(projects)) {
    const key = project.initiativeName ?? "";
    groups.set(key, [...(groups.get(key) ?? []), project]);
  }
  return [...groups.keys()]
    .sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map((key) => ({ label: key || "No initiative", projects: groups.get(key)! }));
}
