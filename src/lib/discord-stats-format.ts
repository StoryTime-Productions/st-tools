export type StatsRange = "week" | "month" | "year";

export const STATS_RANGES: ReadonlyArray<{ value: StatsRange; label: string }> = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export const RANGE_TITLE: Record<StatsRange, string> = {
  week: "This week",
  month: "This month",
  year: "This year",
};

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

/** 125 -> "2h 5m", 45 -> "45m", 0 -> "0m". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}
