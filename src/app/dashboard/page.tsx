import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { Card, CardContent } from "@/components/ui/card";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getDiscordStats, getVoiceNow, getWordleStreak } from "@/lib/discord-stats";
import type { DiscordStats, StatsRange } from "@/lib/discord-stats-format";
import { AutoRefresh } from "./_components/auto-refresh";
import { DiscordLeaderboards } from "./_components/discord-leaderboards";
import { LiveTimeWeather } from "./_components/live-time-weather";
import { OnlineUsersCard } from "./_components/online-users-card";
import { PlaylistWidget } from "./_components/playlist-widget";
import { RightNow } from "./_components/right-now";

export const dynamic = "force-dynamic";

async function loadDiscord() {
  try {
    const [voice, wordle, week, month, year] = await Promise.all([
      getVoiceNow(),
      getWordleStreak(),
      getDiscordStats("week"),
      getDiscordStats("month"),
      getDiscordStats("year"),
    ]);
    const stats: Record<StatsRange, DiscordStats> = { week, month, year };
    return { loaded: true as const, voice, wordle, stats };
  } catch (error) {
    console.error("Discord stats failed to load", error);
    return { loaded: false as const };
  }
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const firstName = user.name?.split(" ")[0] ?? user.email.split("@")[0] ?? "there";
  const discord = await loadDiscord();

  return (
    <WorkspaceShell user={user} activeNav="overview" title="Dashboard">
      <AutoRefresh />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card className="overflow-hidden rounded-4xl border-0 bg-slate-950 text-white shadow-xl shadow-slate-950/10">
            <CardContent className="p-6 md:p-8">
              <LiveTimeWeather firstName={firstName} />
            </CardContent>
          </Card>

          <RightNow
            loaded={discord.loaded}
            voice={discord.loaded ? discord.voice : []}
            wordle={discord.loaded ? discord.wordle : null}
          />

          {discord.loaded ? <DiscordLeaderboards stats={discord.stats} /> : null}
        </div>

        <div className="space-y-6">
          <OnlineUsersCard
            currentUser={{
              id: user.id,
              name: user.name,
              email: user.email,
              avatarUrl: user.avatarUrl,
            }}
          />
          <PlaylistWidget discordId={user.discordId} />
        </div>
      </div>
    </WorkspaceShell>
  );
}
