import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import {
  DEFAULT_MINIGAME_KEY,
  MINIGAME_GAME_KEYS,
  getMinigameChampionsSnapshot,
  getMinigameLeaderboardSnapshot,
  getPomodoroCollaborationSnapshot,
  getPomodoroStatsSnapshot,
} from "@/lib/pomodoro";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { TimerClient } from "./_components/timer-client";

export const metadata = { title: "Focus timer" };

export default async function TimerPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const [stats, collaboration, leaderboard, champions] = await Promise.all([
    getPomodoroStatsSnapshot(user.id),
    getPomodoroCollaborationSnapshot(user.id),
    getMinigameLeaderboardSnapshot(DEFAULT_MINIGAME_KEY, user.id),
    getMinigameChampionsSnapshot(MINIGAME_GAME_KEYS),
  ]);

  return (
    <WorkspaceShell
      user={user}
      activeNav="focus"
      title="Focus timer"
      description="Run Pomodoro sessions and track your progress"
    >
      <TimerClient
        currentUserId={user.id}
        initialWorkMinutes={user.pomodoroWorkMin}
        initialShortBreakMinutes={user.pomodoroShortBreakMin}
        initialLongBreakMinutes={user.pomodoroLongBreakMin}
        initialStats={stats}
        initialCollaboration={collaboration}
        initialLeaderboard={leaderboard}
        initialChampions={champions}
      />
    </WorkspaceShell>
  );
}
