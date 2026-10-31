"use client";

import { useState, type ReactNode } from "react";
import { Mic, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import {
  STATS_RANGES,
  formatDay,
  formatMinutes,
  type DiscordStats,
  type LeaderboardRow,
  type StatsRange,
} from "@/lib/discord-stats-format";
import { projectInitials } from "@/lib/hub-format";

const TRACKING_NOTE_RANGE: Record<StatsRange, string> = {
  week: "this week",
  month: "this month",
  year: "this year",
};

function Leaderboard({
  heading,
  icon: Icon,
  rows,
  unit,
  empty,
  note,
}: {
  heading: string;
  icon: typeof Mic;
  rows: LeaderboardRow[];
  unit: (total: number) => ReactNode;
  empty: string;
  note?: string | null;
}) {
  const max = rows[0]?.total ?? 1;

  return (
    <Card className="border-border/70 bg-background/85 min-w-0 rounded-3xl shadow-none">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-base leading-none font-semibold">
          <Icon aria-hidden="true" className="text-muted-foreground size-4" />
          {heading}
        </h3>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <ol className="space-y-3">
            {rows.map((row, index) => (
              <li
                key={row.discordId}
                className="grid grid-cols-[1.5rem_2rem_minmax(0,1fr)] items-center gap-3"
              >
                <span className="text-muted-foreground text-center text-sm font-semibold tabular-nums">
                  {index + 1}
                </span>
                <Avatar className="size-8">
                  <AvatarImage src={row.avatarUrl ?? undefined} alt="" />
                  <AvatarFallback className="text-[10px]">
                    {projectInitials(row.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium" title={row.name}>
                      {row.name}
                    </p>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {unit(row.total)}
                    </span>
                  </div>
                  <div
                    className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full"
                    aria-hidden="true"
                  >
                    <div
                      className="bg-foreground h-full rounded-full"
                      style={{ width: `${Math.max(4, Math.round((row.total / max) * 100))}%` }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

function voiceNote(stats: DiscordStats) {
  if (!stats.voiceTrackedSince) return "Voice time starts counting once voice tracking is on.";
  return `Voice time counted since ${formatDay(stats.voiceTrackedSince)}. Earlier time is not available.`;
}

export function DiscordLeaderboards({ stats }: { stats: Record<StatsRange, DiscordStats> }) {
  const [range, setRange] = useState<StatsRange>("week");
  const current = stats[range];

  return (
    <section aria-labelledby="discord-stats-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="discord-stats-heading" className="text-xl font-semibold tracking-tight">
          {current.title} on Discord
        </h2>
        <SegmentedToggle
          label="Time range"
          options={STATS_RANGES}
          value={range}
          onChange={setRange}
        />
      </div>

      <p role="status" className="sr-only">
        Showing {current.title.toLowerCase()}
      </p>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <Leaderboard
          heading="Top senders"
          icon={MessageSquare}
          rows={current.messages}
          unit={(total) => (
            <>
              {total.toLocaleString("en-US")}
              <span className="sr-only"> messages</span>
              <span aria-hidden="true"> msgs</span>
            </>
          )}
          empty={`No messages counted ${TRACKING_NOTE_RANGE[range]} yet.`}
        />
        <Leaderboard
          heading="Top in voice"
          icon={Mic}
          rows={current.voice}
          unit={formatMinutes}
          empty={`No voice time counted ${TRACKING_NOTE_RANGE[range]} yet.`}
          note={voiceNote(current)}
        />
      </div>
    </section>
  );
}
