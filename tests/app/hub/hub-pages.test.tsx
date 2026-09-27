import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ProjectDetail } from "@/lib/hub";

const admin = { id: "admin-id", role: "ADMIN" };
const member = { id: "member-id", role: "MEMBER" };

const PROJECT: ProjectDetail = {
  id: "p1",
  title: "St-tools",
  description: "Internal tooling",
  coverImageUrl: "https://example.com/cover.png",
  initiativeId: "i1",
  initiativeName: "Internal Tools",
  startQuarter: "2026-Q3",
  endQuarter: "2026-Q4",
  phases: ["Concept", "Build"],
  currentPhaseIndex: 1,
  links: [{ label: "GitHub", url: "https://github.com/x" }],
  tags: ["web"],
  finished: true,
};

async function loadHub() {
  const redirect = vi.fn(() => {
    throw new Error("REDIRECT");
  });
  const notFound = vi.fn(() => {
    throw new Error("NOT_FOUND");
  });
  const getCurrentUser = vi.fn();
  const lib = {
    getInitiativeOptions: vi.fn().mockResolvedValue([{ id: "i1", name: "Internal Tools" }]),
    getProjectSummaries: vi.fn().mockResolvedValue([]),
    getProjectDetail: vi.fn().mockResolvedValue(PROJECT),
    getProjectWork: vi.fn().mockResolvedValue({
      boards: [],
      participants: [],
      availableTasks: [],
      accessRequests: [],
    }),
    getStandaloneBoardOptions: vi.fn().mockResolvedValue([{ id: "b9", title: "Loose" }]),
    getCalendarCards: vi.fn().mockResolvedValue([{ id: "c1" }]),
  };
  const tagFindMany = vi.fn().mockResolvedValue([{ name: "web" }]);
  const workspaceShell = vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ));

  vi.doMock("next/navigation", () => ({ redirect, notFound }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/hub", () => lib);
  vi.doMock("@/lib/prisma", () => ({ prisma: { tag: { findMany: tagFindMany } } }));
  vi.doMock("@/components/layout/workspace-shell", () => ({ WorkspaceShell: workspaceShell }));
  vi.doMock("@/app/hub/_components/new-project-dialog", () => ({
    NewProjectDialog: () => <button type="button">New project</button>,
  }));
  vi.doMock("@/app/hub/_components/project-overview", () => ({
    ProjectOverview: ({ projects }: { projects: Array<{ title: string }> }) => (
      <ul data-testid="overview">
        {projects.map((project) => (
          <li key={project.title}>{project.title}</li>
        ))}
      </ul>
    ),
  }));
  vi.doMock("@/app/hub/_components/manage-initiatives-dialog", () => ({
    ManageInitiativesDialog: () => <button type="button">Manage initiatives</button>,
  }));
  vi.doMock("@/app/hub/projects/[projectId]/_components/project-boards", () => ({
    ProjectBoards: ({ standaloneBoards }: { standaloneBoards: unknown[] | null }) => (
      <div data-testid="project-boards">{standaloneBoards ? "admin" : "member"}</div>
    ),
  }));
  vi.doMock("@/app/hub/projects/[projectId]/_components/project-admin-controls", () => ({
    ProjectAdminControls: ({ tagOptions }: { tagOptions: string[] }) => (
      <div data-testid="admin-controls">{tagOptions.join(",")}</div>
    ),
  }));

  vi.doMock("@/app/hub/calendar/_components/hub-calendar", () => ({
    HubCalendar: ({ cards, today }: { cards: unknown[]; today: string }) => (
      <p data-testid="calendar">
        {cards.length} {today}
      </p>
    ),
  }));

  const { default: HubLayout } = await import("@/app/hub/layout");
  const { default: CalendarPage } = await import("@/app/hub/calendar/page");
  const { default: HubPage } = await import("@/app/hub/page");
  const { default: ProjectPage } = await import("@/app/hub/projects/[projectId]/page");
  return {
    HubLayout,
    HubPage,
    CalendarPage,
    ProjectPage,
    getCurrentUser,
    lib,
    workspaceShell,
    redirect,
  };
}

describe("hub pages", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("wraps hub pages in the workspace shell and redirects signed-out users", async () => {
    const { HubLayout, HubPage, ProjectPage, getCurrentUser, workspaceShell } = await loadHub();

    getCurrentUser.mockResolvedValue(null);
    await expect(HubLayout({ children: <div /> })).rejects.toThrow("REDIRECT");
    await expect(HubPage()).rejects.toThrow("REDIRECT");
    await expect(ProjectPage({ params: Promise.resolve({ projectId: "p1" }) })).rejects.toThrow(
      "REDIRECT"
    );

    getCurrentUser.mockResolvedValue(member);
    render(await HubLayout({ children: <p>child</p> }));
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(workspaceShell.mock.calls[0][0]).toMatchObject({ activeNav: "hub", title: "Hub" });
  });

  it("loads the viewer's calendar cards under the Calendar tab", async () => {
    const { CalendarPage, getCurrentUser, lib } = await loadHub();

    getCurrentUser.mockResolvedValue(null);
    await expect(CalendarPage()).rejects.toThrow("REDIRECT");

    getCurrentUser.mockResolvedValue(member);
    render(await CalendarPage());
    expect(lib.getCalendarCards).toHaveBeenCalledWith(member);
    expect(screen.getByTestId("calendar")).toHaveTextContent(/^1 \d{4}-\d{2}-\d{2}$/);
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/hub");
  });

  it("shows members an empty state without admin controls", async () => {
    const { HubPage, getCurrentUser, lib } = await loadHub();
    getCurrentUser.mockResolvedValue(member);

    render(await HubPage());

    expect(screen.getByText("No projects yet")).toBeInTheDocument();
    expect(screen.getByText(/will show up here/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New project" })).not.toBeInTheDocument();
    expect(lib.getInitiativeOptions).not.toHaveBeenCalled();
  });

  it("lists projects with admin controls", async () => {
    const { HubPage, getCurrentUser, lib } = await loadHub();
    getCurrentUser.mockResolvedValue(admin);
    lib.getProjectSummaries.mockResolvedValue([
      {
        id: "p1",
        title: "St-tools",
        coverImageUrl: null,
        initiativeName: "Internal Tools",
        quarterLabel: "Q3 2026",
        currentPhase: "Build",
        finished: false,
      },
      {
        id: "p2",
        title: "Old game",
        coverImageUrl: "https://example.com/c.png",
        initiativeName: null,
        quarterLabel: null,
        currentPhase: null,
        finished: true,
      },
    ]);

    render(await HubPage());

    expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument();
    expect(screen.getByTestId("overview")).toHaveTextContent("St-toolsOld game");
  });

  it("renders a project for members and 404s unknown ids", async () => {
    const { ProjectPage, getCurrentUser, lib } = await loadHub();
    getCurrentUser.mockResolvedValue(member);

    render(await ProjectPage({ params: Promise.resolve({ projectId: "p1" }) }));

    expect(screen.getByRole("heading", { name: "St-tools" })).toBeInTheDocument();
    expect(screen.getByText("Internal Tools · Q3 2026 – Q4 2026")).toBeInTheDocument();
    expect(screen.getByText("Internal tooling")).toBeInTheDocument();
    expect(screen.getByText("Build").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/x"
    );
    expect(screen.queryByTestId("admin-controls")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-boards")).toHaveTextContent("member");
    expect(lib.getProjectWork).toHaveBeenCalledWith("p1", member);
    expect(screen.getByText(/Members of this project/)).toBeInTheDocument();
    expect(screen.getByText("No unassigned cards.")).toBeInTheDocument();

    lib.getProjectDetail.mockResolvedValueOnce(null);
    await expect(ProjectPage({ params: Promise.resolve({ projectId: "nope" }) })).rejects.toThrow(
      "NOT_FOUND"
    );
  });

  it("gives admins the editor and handles empty projects", async () => {
    const { ProjectPage, getCurrentUser, lib } = await loadHub();
    getCurrentUser.mockResolvedValue(admin);
    lib.getProjectDetail.mockResolvedValueOnce({
      ...PROJECT,
      description: null,
      coverImageUrl: null,
      initiativeName: null,
      startQuarter: null,
      endQuarter: null,
      phases: [],
      currentPhaseIndex: null,
      links: [],
      tags: [],
      finished: false,
    });

    render(await ProjectPage({ params: Promise.resolve({ projectId: "p1" }) }));

    expect(screen.getByTestId("admin-controls")).toHaveTextContent("web");
    expect(screen.getByText("No initiative")).toBeInTheDocument();
    expect(screen.getByText("No phases yet.")).toBeInTheDocument();
    expect(screen.getByText("No links yet.")).toBeInTheDocument();
    expect(screen.getByTestId("project-boards")).toHaveTextContent("admin");
  });

  it("lists participants and available tasks", async () => {
    const { ProjectPage, getCurrentUser, lib } = await loadHub();
    getCurrentUser.mockResolvedValue(member);
    lib.getProjectWork.mockResolvedValueOnce({
      boards: [],
      participants: [{ id: "u1", name: "Alice Smith", avatarUrl: null }],
      availableTasks: [
        {
          id: "c1",
          title: "Sketch map",
          boardId: "b1",
          boardTitle: "Art",
          dueDate: new Date("2026-10-01T16:00:00Z"),
        },
        { id: "c2", title: "Undated", boardId: "b1", boardTitle: "Art", dueDate: null },
      ],
      accessRequests: [],
    });

    render(await ProjectPage({ params: Promise.resolve({ projectId: "p1" }) }));

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("AS")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sketch map/ })).toHaveAttribute(
      "href",
      "/boards/b1?card=c1"
    );
    expect(screen.getByText("Due Oct 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Undated/ })).not.toHaveTextContent("Due");
  });
});
