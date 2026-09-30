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

function torontoOffsetMs(at: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Toronto",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(at)
      .map((part) => [part.type, Number(part.value)])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - at;
}

/** The instant a Toronto wall-clock time (day key + minutes after midnight) happens. */
export function torontoToUtc(key: string, minutes: number) {
  const naive = toDate(key).getTime() + minutes * 60_000;
  return new Date(naive - torontoOffsetMs(naive - torontoOffsetMs(naive)));
}

export function hourLabel(hour: number) {
  if (hour % 24 === 0) return hour === 0 ? "12 AM" : "Midnight";
  return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}

/** `14:30` -> `2:30 PM`; `24:00` reads as midnight. */
export function timeLabel(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const [hour, half] = hourLabel(hours % 24).split(" ");
  return `${hour}:${String(minutes).padStart(2, "0")} ${half}`;
}

/** A `datetime-local` value (YYYY-MM-DDTHH:mm) for an instant, in Toronto time. */
export function torontoInputValue(at: Date) {
  return at.toLocaleString("sv-SE", { timeZone: "America/Toronto" }).slice(0, 16).replace(" ", "T");
}
