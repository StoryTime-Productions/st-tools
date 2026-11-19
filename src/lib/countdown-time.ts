const ZONE = "America/Toronto";

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function wallParts(ms: number) {
  const get = Object.fromEntries(PARTS.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return {
    year: Number(get.year),
    month: Number(get.month),
    day: Number(get.day),
    hour: Number(get.hour),
    minute: Number(get.minute),
  };
}

/** Minutes Toronto is ahead of UTC at this instant (-300 in winter, -240 in summer). */
function offsetMinutes(ms: number) {
  const w = wallParts(ms);
  return (
    (Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - Math.floor(ms / 60_000) * 60_000) /
    60_000
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The value a datetime-local input shows for this instant, read as Toronto wall time. */
export function isoToTorontoLocal(iso: string) {
  const w = wallParts(Date.parse(iso));
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** A datetime-local value ("2026-11-14T15:00") read as Toronto wall time, as a UTC ISO string; null if malformed. */
export function torontoLocalToIso(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const first = wall - offsetMinutes(wall) * 60_000;
  const second = wall - offsetMinutes(first) * 60_000;
  return new Date(second).toISOString();
}

/** "Sat, Nov 14, 3:00 PM" in Toronto time. */
export function formatCountdownDate(date: Date) {
  return date.toLocaleString("en-US", {
    timeZone: ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
