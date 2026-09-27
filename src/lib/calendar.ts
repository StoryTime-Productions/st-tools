export type CalendarView = "month" | "week" | "day" | "agenda";

const DAY_MS = 86_400_000;

function toDate(key: string) {
  return new Date(`${key}T00:00:00Z`);
}

function toKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function todayKey(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

export function addDays(key: string, days: number) {
  return toKey(new Date(toDate(key).getTime() + days * DAY_MS));
}

function addMonths(key: string, months: number) {
  const date = toDate(key);
  return toKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)));
}

function startOfWeek(key: string) {
  return addDays(key, -toDate(key).getUTCDay());
}

function monthStart(key: string) {
  return `${key.slice(0, 7)}-01`;
}

function daysBetween(from: string, to: string) {
  const days: string[] = [];
  for (let key = from; key <= to; key = addDays(key, 1)) days.push(key);
  return days;
}

/** The days a view shows around `anchor`: month = whole Sunday-start weeks covering the month. */
export function visibleDays(view: CalendarView, anchor: string): string[] {
  if (view === "day") return [anchor];
  if (view === "week") return daysBetween(startOfWeek(anchor), addDays(startOfWeek(anchor), 6));
  const first = monthStart(anchor);
  const last = addDays(addMonths(anchor, 1), -1);
  if (view === "agenda") return daysBetween(first, last);
  return daysBetween(startOfWeek(first), addDays(startOfWeek(last), 6));
}

export function stepAnchor(view: CalendarView, anchor: string, direction: 1 | -1) {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, 7 * direction);
  return addMonths(anchor, direction);
}

function format(key: string, options: Intl.DateTimeFormatOptions) {
  return toDate(key).toLocaleDateString("en-US", { timeZone: "UTC", ...options });
}

export function rangeLabel(view: CalendarView, anchor: string) {
  if (view === "day") {
    return format(anchor, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  if (view === "week") {
    const [from, to] = [startOfWeek(anchor), addDays(startOfWeek(anchor), 6)];
    return `${format(from, { month: "short", day: "numeric" })} – ${format(to, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return format(anchor, { month: "long", year: "numeric" });
}

export function dayLabel(key: string, options: Intl.DateTimeFormatOptions) {
  return format(key, options);
}
