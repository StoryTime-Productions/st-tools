import { todayKey } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";

const DAY_MS = 86_400_000;

export interface UpcomingBirthday {
  discordId: string;
  name: string;
  avatarUrl: string | null;
  month: number;
  day: number;
  /** Whole Toronto days from today; 0 means today. */
  daysUntil: number;
}

function isLeap(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Feb 29 falls on Feb 28 in years without one. */
function occurrence(year: number, month: number, day: number) {
  const safeDay = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
  return Date.UTC(year, month - 1, safeDay);
}

export function daysUntilBirthday(today: string, month: number, day: number) {
  const year = Number(today.slice(0, 4));
  const start = Date.parse(`${today}T00:00:00Z`);
  let next = occurrence(year, month, day);
  if (next < start) next = occurrence(year + 1, month, day);
  return Math.round((next - start) / DAY_MS);
}

/** The next birthdays in Toronto time, soonest first (ties by name). */
export async function getUpcomingBirthdays(
  now: Date = new Date(),
  limit = 3
): Promise<UpcomingBirthday[]> {
  const today = todayKey(now);
  const rows = await prisma.discordBirthday.findMany();
  return rows
    .map((row) => ({ ...row, daysUntil: daysUntilBirthday(today, row.month, row.day) }))
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name))
    .slice(0, limit);
}
