import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkspaceShell, type WorkspaceShellUser } from "@/components/layout/workspace-shell";

type TrackerProps = {
  user: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  };
};

const trackerMock = vi.hoisted(() => vi.fn<(props: TrackerProps) => null>(() => null));

vi.mock("next/image", () => ({
  default: (props: {
    alt: string;
    src: string;
    width: number;
    height: number;
    className?: string;
  }) => <div role="img" aria-label={props.alt} data-src={props.src} className={props.className} />,
}));

vi.mock("@/components/layout/online-presence-tracker", () => ({
  OnlinePresenceTracker: trackerMock,
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme toggle</button>,
}));

vi.mock("@/app/actions/auth", () => ({
  signOutAction: vi.fn(),
}));

function makeUser(overrides: Partial<WorkspaceShellUser> = {}): WorkspaceShellUser {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Workspace Owner",
    email: "owner@example.com",
    avatarUrl: null,
    role: "MEMBER",
    ...overrides,
  };
}

describe("WorkspaceShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders workspace navigation for members without admin links", () => {
    render(
      <WorkspaceShell
        user={makeUser()}
        activeNav="overview"
        title="Dashboard"
        description="Your workspace summary"
      >
        <div>Dashboard content</div>
      </WorkspaceShell>
    );

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Your workspace summary")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /boards/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /focus/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /profile/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /members/i })).not.toBeInTheDocument();
    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    expect(trackerMock).not.toHaveBeenCalled();
  });

  it("renders admin links and online tracker outside overview", () => {
    const user = makeUser({
      role: "ADMIN",
      name: null,
      email: "admin@example.com",
      avatarUrl: "https://example.com/avatar.png",
    });

    render(
      <WorkspaceShell user={user} activeNav="boards" title="Boards">
        <div>Boards content</div>
      </WorkspaceShell>
    );

    const membersLink = screen.getByRole("link", { name: /members/i });
    expect(membersLink).toHaveAttribute("href", "/admin/members");
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(screen.getAllByText("admin@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Soon")).toHaveLength(1);

    expect(trackerMock).toHaveBeenCalledTimes(1);
    expect(trackerMock.mock.calls[0][0]).toEqual({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    });
  });

  it("applies user appearance customizations", () => {
    const { container } = render(
      <WorkspaceShell
        user={makeUser({
          primaryColor: "#1a2b3c",
          secondaryColor: "#d8e4f0",
          backgroundMode: "COLOR",
          backgroundColor: "#112233",
          backgroundImageOpacity: 60,
        })}
        activeNav="overview"
        title="Dashboard"
      >
        <div>Styled content</div>
      </WorkspaceShell>
    );

    const shellRoot = container.firstElementChild as HTMLElement;
    expect(shellRoot.style.getPropertyValue("--primary")).toBe("#1a2b3c");
    expect(shellRoot.style.getPropertyValue("--secondary")).toBe("#d8e4f0");

    const contentLayer = container.querySelector("[data-workspace-content-layer]") as HTMLElement;
    expect(contentLayer.style.backgroundColor).toBe("rgb(17, 34, 51)");
  });
});
