import { addDays, todayKey, torontoToUtc } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";

export type StatsRange = "week" | "month" | "year";

export const STATS_RANGES: ReadonlyArray<{ value: StatsRange; label: string }> = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

const RANGE_TITLE: Record<StatsRange, string> = {
  week: "This week",
  month: "This month",
  year: "This year",
};

export interface RangeBounds {
  /** First Toronto day (YYYY-MM-DD) in the range. */
  startDay: string;
  /** First Toronto day after the range. */
  endDay: string;
  start: Date;
  end: Date;
  title: string;
}

/** Calendar-aligned Toronto days: Monday to Sunday, the calendar month, the calendar year. */
export function rangeBounds(range: StatsRange, now: Date = new Date()): RangeBounds {
  const today = todayKey(now);
  let startDay: string;
  let endDay: string;

  if (range === "week") {
    const dayOfWeek = new Date(`${today}T00:00:00Z`).getUTCDay();
    startDay = addDays(today, -((dayOfWeek + 6) % 7));
    endDay = addDays(startDay, 7);
  } else if (range === "month") {
    startDay = `${today.slice(0, 7)}-01`;
    const next = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1));
    endDay = next.toISOString().slice(0, 10);
  } else {
    startDay = `${today.slice(0, 4)}-01-01`;
    endDay = `${Number(today.slice(0, 4)) + 1}-01-01`;
  }

  return {
    startDay,
    endDay,
    start: torontoToUtc(startDay, 0),
    end: torontoToUtc(endDay, 0),
    title: RANGE_TITLE[range],
  };
}

export interface LeaderboardRow {
  discordId: string;
  name: string;
  /** Messages, or whole minutes in voice. */
  total: number;
  avatarUrl: string | null;
}

export interface DiscordStats {
  range: StatsRange;
  title: string;
  messages: LeaderboardRow[];
  voice: LeaderboardRow[];
  /** When the first voice session was recorded: earlier voice time is unknown (Discord keeps none). */
  voiceTrackedSince: string | null;
}

export interface VoiceNowRow {
  discordId: string;
  name: string;
  channelName: string;
  joinedAt: Date;
  avatarUrl: string | null;
}

function top(totals: Map<string, { name: string; total: number }>, limit: number) {
  return [...totals.entries()]
    .filter(([, value]) => value.total > 0)
    .sort((a, b) => b[1].total - a[1].total || a[1].name.localeCompare(b[1].name))
    .slice(0, limit)
    .map(([discordId, value]) => ({ discordId, name: value.name, total: value.total }));
}

async function avatarsFor(discordIds: string[]) {
  if (discordIds.length === 0) return new Map<string, string | null>();
  const users = await prisma.user.findMany({
    where: { discordId: { in: discordIds } },
    select: { discordId: true, avatarUrl: true },
  });
  return new Map(users.map((user) => [user.discordId as string, user.avatarUrl]));
}

export async function getDiscordStats(
  range: StatsRange,
  now: Date = new Date(),
  limit = 5
): Promise<DiscordStats> {
  const bounds = rangeBounds(range, now);

  const [days, sessions, first] = await Promise.all([
    prisma.discordMessageDay.findMany({
      where: { day: { gte: bounds.startDay, lt: bounds.endDay } },
      select: { discordId: true, name: true, day: true, count: true },
    }),
    prisma.discordVoiceSession.findMany({
      where: {
        joinedAt: { lt: bounds.end },
        OR: [{ leftAt: null }, { leftAt: { gt: bounds.start } }],
      },
      select: { discordId: true, name: true, joinedAt: true, leftAt: true },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.discordVoiceSession.findFirst({
      orderBy: { joinedAt: "asc" },
      select: { joinedAt: true },
    }),
  ]);

  const messageTotals = new Map<string, { name: string; total: number; day: string }>();
  for (const row of days) {
    const entry = messageTotals.get(row.discordId) ?? { name: row.name, total: 0, day: "" };
    entry.total += row.count;
    if (row.day >= entry.day) {
      entry.day = row.day;
      entry.name = row.name;
    }
    messageTotals.set(row.discordId, entry);
  }

  // Sessions still open count up to now, never past the end of the range.
  const upTo = Math.min(now.getTime(), bounds.end.getTime());
  const voiceMs = new Map<string, { name: string; ms: number }>();
  for (const session of sessions) {
    const from = Math.max(session.joinedAt.getTime(), bounds.start.getTime());
    const to = Math.min(session.leftAt?.getTime() ?? upTo, upTo);
    const entry = voiceMs.get(session.discordId) ?? { name: session.name, ms: 0 };
    entry.name = session.name;
    entry.ms += Math.max(0, to - from);
    voiceMs.set(session.discordId, entry);
  }
  const voiceTotals = new Map(
    [...voiceMs.entries()].map(([id, value]) => [
      id,
      { name: value.name, total: Math.floor(value.ms / 60_000) },
    ])
  );

  const messageTop = top(messageTotals, limit);
  const voiceTop = top(voiceTotals, limit);
  const avatars = await avatarsFor([
    ...new Set([...messageTop, ...voiceTop].map((r) => r.discordId)),
  ]);
  const withAvatar = (row: Omit<LeaderboardRow, "avatarUrl">): LeaderboardRow => ({
    ...row,
    avatarUrl: avatars.get(row.discordId) ?? null,
  });

  return {
    range,
    title: bounds.title,
    messages: messageTop.map(withAvatar),
    voice: voiceTop.map(withAvatar),
    voiceTrackedSince: first ? todayKey(first.joinedAt) : null,
  };
}

/** Who is in a counted voice channel right now (open sessions), longest first. */
export async function getVoiceNow(): Promise<VoiceNowRow[]> {
  const open = await prisma.discordVoiceSession.findMany({
    where: { leftAt: null },
    orderBy: { joinedAt: "asc" },
    select: { discordId: true, name: true, channelName: true, joinedAt: true },
  });
  const avatars = await avatarsFor(open.map((session) => session.discordId));
  return open.map((session) => ({ ...session, avatarUrl: avatars.get(session.discordId) ?? null }));
}

export async function getWordleStreak() {
  const row = await prisma.discordWordleStreak.findUnique({ where: { id: 1 } });
  return row ? { streak: row.streak, postedOn: row.postedOn } : null;
}
