import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

async function loadTimerPageModule() {
  const redirect = vi.fn();
  const getCurrentUser = vi.fn();
  const getPomodoroStatsSnapshot = vi.fn();
  const getPomodoroCollaborationSnapshot = vi.fn();
  const getMinigameLeaderboardSnapshot = vi.fn();
  const getMinigameChampionsSnapshot = vi.fn();

  const workspaceShell = vi.fn(
    ({ children, title }: { children: React.ReactNode; title: string }) => (
      <div data-testid="workspace-shell">
        <h1>{title}</h1>
        {children}
      </div>
    )
  );

  const timerClient = vi.fn(() => <div data-testid="timer-client" />);

  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/pomodoro", () => ({
    DEFAULT_MINIGAME_KEY: "reaction_tap",
    MINIGAME_GAME_KEYS: ["reaction_tap"],
    getPomodoroStatsSnapshot,
    getPomodoroCollaborationSnapshot,
    getMinigameLeaderboardSnapshot,
    getMinigameChampionsSnapshot,
  }));
  vi.doMock("@/components/layout/workspace-shell", () => ({ WorkspaceShell: workspaceShell }));
  vi.doMock("@/app/timer/_components/timer-client", () => ({ TimerClient: timerClient }));

  const timerPageModule = await import("@/app/timer/page");

  return {
    ...timerPageModule,
    redirect,
    getCurrentUser,
    getPomodoroStatsSnapshot,
    getPomodoroCollaborationSnapshot,
    getMinigameLeaderboardSnapshot,
    getMinigameChampionsSnapshot,
    workspaceShell,
    timerClient,
  };
}

describe("TimerPage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users", async () => {
    const { default: TimerPage, getCurrentUser, redirect } = await loadTimerPageModule();

    getCurrentUser.mockResolvedValueOnce(null);
    redirect.mockImplementationOnce(() => {
      throw new Error("REDIRECT");
    });

    await expect(TimerPage()).rejects.toThrowError("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("renders timer page with stats and preferences", async () => {
    const {
      default: TimerPage,
      getCurrentUser,
      getPomodoroStatsSnapshot,
      getPomodoroCollaborationSnapshot,
      getMinigameLeaderboardSnapshot,
      getMinigameChampionsSnapshot,
      workspaceShell,
      timerClient,
    } = await loadTimerPageModule();

    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Nirav",
      email: "nirav@example.com",
      avatarUrl: null,
      role: "MEMBER",
      pomodoroWorkMin: 30,
      pomodoroShortBreakMin: 6,
      pomodoroLongBreakMin: 18,
    };

    const stats = {
      todayCount: 2,
      weekCount: 7,
      totalCount: 20,
      last7Days: [
        { dateKey: "2026-03-14", label: "Sat", count: 1 },
        { dateKey: "2026-03-15", label: "Sun", count: 0 },
        { dateKey: "2026-03-16", label: "Mon", count: 2 },
        { dateKey: "2026-03-17", label: "Tue", count: 1 },
        { dateKey: "2026-03-18", label: "Wed", count: 1 },
        { dateKey: "2026-03-19", label: "Thu", count: 1 },
        { dateKey: "2026-03-20", label: "Fri", count: 1 },
      ],
    };

    const collaboration = {
      currentSession: null,
      activeSessions: [],
      inviteCandidates: [],
      outgoingRequests: [],
      incomingRequests: [],
    };

    const leaderboard = {
      gameKey: "reaction_tap",
      entries: [],
    };

    const champions = [
      {
        gameKey: "reaction_tap",
        championName: "Nirav",
        championUserId: user.id,
        championScore: 10,
      },
    ];

    getCurrentUser.mockResolvedValueOnce(user);
    getPomodoroStatsSnapshot.mockResolvedValueOnce(stats);
    getPomodoroCollaborationSnapshot.mockResolvedValueOnce(collaboration);
    getMinigameLeaderboardSnapshot.mockResolvedValueOnce(leaderboard);
    getMinigameChampionsSnapshot.mockResolvedValueOnce(champions);

    const output = await TimerPage();
    render(output);

    expect(screen.getByRole("heading", { name: "Focus timer" })).toBeInTheDocument();
    expect(getPomodoroStatsSnapshot).toHaveBeenCalledWith(user.id);
    expect(getPomodoroCollaborationSnapshot).toHaveBeenCalledWith(user.id);
    expect(getMinigameLeaderboardSnapshot).toHaveBeenCalledWith("reaction_tap", user.id);
    expect(getMinigameChampionsSnapshot).toHaveBeenCalledWith(["reaction_tap"]);

    expect(workspaceShell).toHaveBeenCalledWith(
      expect.objectContaining({
        activeNav: "focus",
        title: "Focus timer",
      }),
      undefined
    );

    expect(timerClient).toHaveBeenCalledWith(
      {
        currentUserId: user.id,
        initialWorkMinutes: user.pomodoroWorkMin,
        initialShortBreakMinutes: user.pomodoroShortBreakMin,
        initialLongBreakMinutes: user.pomodoroLongBreakMin,
        initialStats: stats,
        initialCollaboration: collaboration,
        initialLeaderboard: leaderboard,
        initialChampions: champions,
      },
      undefined
    );
  });
});
