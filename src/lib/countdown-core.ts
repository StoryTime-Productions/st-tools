// Pure countdown rules and wording. No database access, so client components can import it.

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** A personal countdown stays visible this long after it fires, so someone who was away still sees the alarm. */
export const PERSONAL_GRACE_MS = DAY_MS;
export const MAX_PERSONAL_COUNTDOWNS = 10;
export const MAX_COUNTDOWN_TITLE = 60;
/** The tab title only shows a countdown this close. */
export const TITLE_WINDOW_MS = DAY_MS;

export interface CountdownView {
  id: string;
  title: string;
  targetAt: Date;
  scope: "GLOBAL" | "PERSONAL";
  ownerId: string;
  /** null = everyone, otherwise the number of chosen members. */
  audienceCount: number | null;
  /** Who a filtered global countdown is for; only loaded for admins, who edit it. */
  audienceUserIds: string[];
  /** False when an admin is only seeing a countdown to manage it (it is for other people). */
  applies: boolean;
  dismissed: boolean;
}

/** Personal countdowns expire after the grace period; global ones never do. */
export function expiryFor(scope: CountdownView["scope"], targetAt: Date): Date | null {
  return scope === "PERSONAL" ? new Date(targetAt.getTime() + PERSONAL_GRACE_MS) : null;
}

export function normalizeTitle(title: string) {
  return title.trim().replace(/\s+/g, " ").slice(0, MAX_COUNTDOWN_TITLE);
}

export function hasReached(targetAt: Date, now: Date) {
  return targetAt.getTime() <= now.getTime();
}

/** Text only, never colour: "Reached", "in 3 days", "in 2 h 05 m", "in 12 min", "in under a minute". */
export function remainingLabel(targetAt: Date, now: Date) {
  const ms = targetAt.getTime() - now.getTime();
  if (ms <= 0) return "Reached";
  if (ms >= 2 * DAY_MS) return `in ${Math.floor(ms / DAY_MS)} days`;
  if (ms >= DAY_MS) return "in 1 day";
  if (ms >= HOUR_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
    return `in ${hours} h ${String(minutes).padStart(2, "0")} m`;
  }
  if (ms >= MINUTE_MS) return `in ${Math.floor(ms / MINUTE_MS)} min`;
  return "in under a minute";
}

/** Who sees a countdown, as a row label. */
export function audienceLabel(c: Pick<CountdownView, "scope" | "audienceCount">) {
  if (c.scope === "PERSONAL") return "Only you";
  if (c.audienceCount === null) return "Everyone";
  return c.audienceCount === 1 ? "1 person" : `${c.audienceCount} people`;
}

/** Global first, then by target time. */
export function sortCountdowns<T extends Pick<CountdownView, "scope" | "targetAt">>(list: T[]) {
  return [...list].sort(
    (a, b) =>
      Number(b.scope === "GLOBAL") - Number(a.scope === "GLOBAL") ||
      a.targetAt.getTime() - b.targetAt.getTime()
  );
}

/** The countdown the tab title shows: an unacknowledged fired alarm first, else the soonest within 24 h. */
export function pickTitleCountdown(list: CountdownView[], now: Date) {
  const mine = list.filter((c) => c.applies);
  const fired = mine
    .filter((c) => hasReached(c.targetAt, now) && !c.dismissed)
    .sort((a, b) => a.targetAt.getTime() - b.targetAt.getTime());
  if (fired.length) return { countdown: fired[0], reached: true };
  const soon = mine
    .filter(
      (c) => !hasReached(c.targetAt, now) && c.targetAt.getTime() - now.getTime() <= TITLE_WINDOW_MS
    )
    .sort((a, b) => a.targetAt.getTime() - b.targetAt.getTime());
  return soon.length ? { countdown: soon[0], reached: false } : null;
}
