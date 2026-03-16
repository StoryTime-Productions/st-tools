import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
  const puppyOfTheDayCard = vi.fn(() => <div data-testid="puppy-card" />);

  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/components/layout/workspace-shell", () => ({ WorkspaceShell: workspaceShell }));
  vi.doMock("@/app/dashboard/_components/live-time-weather", () => ({
    LiveTimeWeather: liveTimeWeather,
  }));
  vi.doMock("@/app/dashboard/_components/online-users-card", () => ({
    OnlineUsersCard: onlineUsersCard,
  }));
  vi.doMock("@/app/dashboard/_components/puppy-of-the-day", () => ({
    PuppyOfTheDayCard: puppyOfTheDayCard,
  }));

  const dashboardPageModule = await import("@/app/dashboard/page");

  return {
    ...dashboardPageModule,
    redirect,
    getCurrentUser,
    workspaceShell,
    liveTimeWeather,
    onlineUsersCard,
    puppyOfTheDayCard,
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

  it("renders member dashboard with disabled member-access module", async () => {
    const {
      default: DashboardPage,
      getCurrentUser,
      workspaceShell,
      liveTimeWeather,
      onlineUsersCard,
    } = await loadDashboardPageModule();

    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      name: null,
      email: "member@example.com",
      avatarUrl: null,
      role: "MEMBER",
    };

    getCurrentUser.mockResolvedValueOnce(user);

    const output = await DashboardPage();
    render(output);

    expect(workspaceShell).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Dashboard",
        activeNav: "overview",
      }),
      undefined
    );
    expect(liveTimeWeather).toHaveBeenCalledWith({ firstName: "member" }, undefined);
    expect(screen.getByText("Quick access")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /member access/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("Planned area").length).toBeGreaterThan(0);

    expect(onlineUsersCard).toHaveBeenCalledWith(
      {
        currentUser: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
        },
      },
      undefined
    );
  });

  it("renders admin dashboard with live member-access link", async () => {
    const {
      default: DashboardPage,
      getCurrentUser,
      liveTimeWeather,
    } = await loadDashboardPageModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Alice Admin",
      email: "admin@example.com",
      avatarUrl: null,
      role: "ADMIN",
    });

    const output = await DashboardPage();
    render(output);

    expect(liveTimeWeather).toHaveBeenCalledWith({ firstName: "Alice" }, undefined);

    const membersLink = screen.getByRole("link", { name: /member access/i });
    expect(membersLink).toHaveAttribute("href", "/admin/members");
    // Verify the admin member-access card is visible by checking its link
    expect(membersLink).toBeInTheDocument();
  });
});
