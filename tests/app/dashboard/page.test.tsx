import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  name: null,
  email: "member@example.com",
  avatarUrl: null,
  role: "MEMBER",
  discordId: "d-1",
};

async function loadDashboardPageModule() {
  const redirect = vi.fn();
  const getCurrentUser = vi.fn();

  const workspaceShell = vi.fn(
    ({ children, title }: { children: React.ReactNode; title: string }) => (
      <div data-testid="workspace-shell">
        <h1>{title}</h1>
        {children}
      </div>
    )
  );
  const liveTimeWeather = vi.fn(({ firstName }: { firstName: string }) => (
    <div data-testid="live-time-weather">{firstName}</div>
  ));
  const onlineUsersCard = vi.fn(() => <div data-testid="online-users-card" />);
  const playlistWidget = vi.fn(() => <div data-testid="playlist-widget" />);
  const rightNow = vi.fn(() => <div data-testid="right-now" />);
  const leaderboards = vi.fn(() => <div data-testid="leaderboards" />);
  const autoRefresh = vi.fn(() => <div data-testid="auto-refresh" />);

  const getVoiceNow = vi.fn().mockResolvedValue([{ discordId: "1" }]);
  const getWordleStreak = vi.fn().mockResolvedValue({ streak: 80, postedOn: "2026-10-30" });
  const getDiscordStats = vi.fn(async (range: string) => ({ range }));

  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/discord-stats", () => ({ getVoiceNow, getWordleStreak, getDiscordStats }));
  vi.doMock("@/components/layout/workspace-shell", () => ({ WorkspaceShell: workspaceShell }));
  vi.doMock("@/app/dashboard/_components/live-time-weather", () => ({
    LiveTimeWeather: liveTimeWeather,
  }));
  vi.doMock("@/app/dashboard/_components/online-users-card", () => ({
    OnlineUsersCard: onlineUsersCard,
  }));
  vi.doMock("@/app/dashboard/_components/playlist-widget", () => ({
    PlaylistWidget: playlistWidget,
  }));
  vi.doMock("@/app/dashboard/_components/right-now", () => ({ RightNow: rightNow }));
  vi.doMock("@/app/dashboard/_components/discord-leaderboards", () => ({
    DiscordLeaderboards: leaderboards,
  }));
  vi.doMock("@/app/dashboard/_components/auto-refresh", () => ({ AutoRefresh: autoRefresh }));

  const dashboardPageModule = await import("@/app/dashboard/page");

  return {
    ...dashboardPageModule,
    redirect,
    getCurrentUser,
    workspaceShell,
    liveTimeWeather,
    onlineUsersCard,
    playlistWidget,
    rightNow,
    leaderboards,
    getVoiceNow,
  };
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users", async () => {
    const { default: DashboardPage, getCurrentUser, redirect } = await loadDashboardPageModule();

    getCurrentUser.mockResolvedValueOnce(null);
    redirect.mockImplementationOnce(() => {
      throw new Error("REDIRECT");
    });

    await expect(DashboardPage()).rejects.toThrowError("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth/sign-in");
  }, 10000);

  it("shows what is happening on Discord instead of the Quick access cards", async () => {
    const {
      default: DashboardPage,
      getCurrentUser,
      workspaceShell,
      liveTimeWeather,
      onlineUsersCard,
      playlistWidget,
      rightNow,
      leaderboards,
    } = await loadDashboardPageModule();

    getCurrentUser.mockResolvedValueOnce(USER);

    render(await DashboardPage());

    expect(workspaceShell).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Dashboard", activeNav: "overview" }),
      undefined
    );
    expect(liveTimeWeather).toHaveBeenCalledWith({ firstName: "member" }, undefined);
    expect(screen.queryByText("Quick access")).not.toBeInTheDocument();
    expect(screen.getByTestId("auto-refresh")).toBeInTheDocument();
    expect(rightNow).toHaveBeenCalledWith(
      {
        loaded: true,
        voice: [{ discordId: "1" }],
        wordle: { streak: 80, postedOn: "2026-10-30" },
      },
      undefined
    );
    expect(leaderboards).toHaveBeenCalledWith(
      { stats: { week: { range: "week" }, month: { range: "month" }, year: { range: "year" } } },
      undefined
    );
    expect(playlistWidget).toHaveBeenCalledWith({ discordId: "d-1" }, undefined);
    expect(onlineUsersCard).toHaveBeenCalledWith(
      {
        currentUser: { id: USER.id, name: USER.name, email: USER.email, avatarUrl: USER.avatarUrl },
      },
      undefined
    );
  });

  it("uses the first name of a named user", async () => {
    const {
      default: DashboardPage,
      getCurrentUser,
      liveTimeWeather,
    } = await loadDashboardPageModule();

    getCurrentUser.mockResolvedValueOnce({ ...USER, name: "Alice Admin", role: "ADMIN" });
    render(await DashboardPage());

    expect(liveTimeWeather).toHaveBeenCalledWith({ firstName: "Alice" }, undefined);
  });

  it("keeps the dashboard working and says so when the Discord stats fail to load", async () => {
    const {
      default: DashboardPage,
      getCurrentUser,
      getVoiceNow,
      rightNow,
      leaderboards,
    } = await loadDashboardPageModule();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getCurrentUser.mockResolvedValueOnce(USER);
    getVoiceNow.mockRejectedValueOnce(new Error("db down"));

    render(await DashboardPage());

    expect(rightNow).toHaveBeenCalledWith({ loaded: false, voice: [], wordle: null }, undefined);
    expect(leaderboards).not.toHaveBeenCalled();
    expect(screen.getByTestId("playlist-widget")).toBeInTheDocument();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
