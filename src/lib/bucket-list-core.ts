// Pure bucket-list rules and wording. No database access, so client components can import it.

export type BucketStatus = "TODO" | "IN_PLAN" | "DONE";
export type BucketSeason = "SPRING" | "SUMMER" | "FALL" | "WINTER";

export const MAX_BUCKET_TITLE = 80;
export const MAX_BUCKET_NOTES = 1000;
export const MIN_SEASON_YEAR = 2020;
export const MAX_SEASON_YEAR = 2100;

/** Column order on the list page. */
export const BUCKET_STATUSES: readonly BucketStatus[] = ["TODO", "IN_PLAN", "DONE"];
const SEASONS: readonly BucketSeason[] = ["SPRING", "SUMMER", "FALL", "WINTER"];
const STATUS_LABELS: Record<BucketStatus, string> = {
  TODO: "To do",
  IN_PLAN: "In plan",
  DONE: "Done",
};
const SEASON_LABELS: Record<BucketSeason, string> = {
  SPRING: "Spring",
  SUMMER: "Summer",
  FALL: "Fall",
  WINTER: "Winter",
};

export interface BucketItemView {
  id: string;
  title: string;
  notes: string | null;
  status: BucketStatus;
  season: BucketSeason | null;
  seasonYear: number | null;
  suggestedById: string | null;
  suggestedByName: string | null;
  hangoutId: string | null;
  hangoutTitle: string | null;
  /** The linked hangout's last stop has finished, so the item can be offered as "Mark as done?". */
  hangoutEnded: boolean;
  driveFolderId: string | null;
  doneAt: Date | null;
  createdAt: Date;
  tags: string[];
}

export interface BucketInput {
  title: string;
  notes: string | null;
  season: BucketSeason | null;
  seasonYear: number | null;
}

export type BucketInputResult = { ok: true; value: BucketInput } | { ok: false; error: string };

export function statusLabel(status: BucketStatus) {
  return STATUS_LABELS[status];
}

/** "Summer 2027", "Summer" (no year), or null when no season is set. */
export function seasonLabel(season: BucketSeason | null, year: number | null) {
  if (!season) return null;
  return year ? `${SEASON_LABELS[season]} ${year}` : SEASON_LABELS[season];
}

/** "Sat, Dec 6" for a hangout's `YYYY-MM-DDTHH:mm` start, "No date yet" without one; tells same-titled options apart. */
export function slotDateLabel(startSlot: string | null) {
  if (!startSlot) return "No date yet";
  return new Date(`${startSlot.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function normalizeTitle(title: string) {
  return title.trim().replace(/\s+/g, " ").slice(0, MAX_BUCKET_TITLE);
}

export function normalizeNotes(notes: string | null | undefined) {
  const trimmed = (notes ?? "").trim().slice(0, MAX_BUCKET_NOTES);
  return trimmed === "" ? null : trimmed;
}

/** Tidies and checks what a member typed. A year without a season is refused, as is a year out of range. */
export function parseBucketInput(raw: {
  title: string;
  notes?: string | null;
  season?: string | null;
  seasonYear?: number | null;
}): BucketInputResult {
  const title = normalizeTitle(raw.title);
  if (title === "") return { ok: false, error: "Give it a title." };

  const season = raw.season ? (SEASONS.find((s) => s === raw.season) ?? null) : null;
  if (raw.season && !season) return { ok: false, error: "Pick a valid season." };

  const year = raw.seasonYear ?? null;
  if (year !== null) {
    if (!season) return { ok: false, error: "Pick a season to go with the year." };
    if (!Number.isInteger(year) || year < MIN_SEASON_YEAR || year > MAX_SEASON_YEAR) {
      return { ok: false, error: "Pick a valid year." };
    }
  }

  return {
    ok: true,
    value: { title, notes: normalizeNotes(raw.notes), season, seasonYear: year },
  };
}

interface Actor {
  id: string;
  role: "ADMIN" | "MEMBER";
}

/** Any member can add and tick Done; only the suggester or an admin edits or deletes (Q2). */
export function canManageItem(item: { suggestedById: string | null }, actor: Actor) {
  return actor.role === "ADMIN" || (item.suggestedById !== null && item.suggestedById === actor.id);
}

/** The list page columns, oldest first inside each; Done is newest first. */
export function groupByStatus(items: BucketItemView[]): Record<BucketStatus, BucketItemView[]> {
  const grouped: Record<BucketStatus, BucketItemView[]> = { TODO: [], IN_PLAN: [], DONE: [] };
  for (const item of items) grouped[item.status].push(item);
  const byCreated = (a: BucketItemView, b: BucketItemView) =>
    a.createdAt.getTime() - b.createdAt.getTime();
  grouped.TODO.sort(byCreated);
  grouped.IN_PLAN.sort(byCreated);
  grouped.DONE.sort(
    (a, b) => (b.doneAt ?? b.createdAt).getTime() - (a.doneAt ?? a.createdAt).getTime()
  );
  return grouped;
}
