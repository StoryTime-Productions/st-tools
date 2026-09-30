import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ProjectDetail } from "@/lib/hub";

const admin = { id: "admin-id", role: "ADMIN" };
const member = { id: "member-id", role: "MEMBER", name: null, email: "m@storytime.gg" };

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

const HANGOUT = {
  id: "h1",
  title: "Beach day",
  coverImageUrl: null,
  status: "COLLECTING",
  description: "Bring sunscreen",
  discordThreadUrl: "https://discord.com/channels/1/2",
  proposerName: null,
  availabilityDates: [] as string[],
  windowStartHour: 9,
  windowEndHour: 17,
  availabilityDeadline: null as Date | null,
  startSlot: null as string | null,
  attendees: [],
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
  const hangouts = {
    getHangoutSummaries: vi.fn().mockResolvedValue([]),
    getHangoutDetail: vi.fn().mockResolvedValue(HANGOUT),
    getOpenIdeas: vi.fn().mockResolvedValue([]),
    getAvailabilityResponses: vi.fn().mockResolvedValue([{ userId: "u1", name: "Ann", slots: [] }]),
  };
  const tagFindMany = vi.fn().mockResolvedValue([{ name: "web" }]);
  const workspaceShell = vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ));

  vi.doMock("next/navigation", () => ({ redirect, notFound }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/hub", () => lib);
  vi.doMock("@/lib/hangouts", () => hangouts);
  vi.doMock("@/app/hub/_components/hangout-dialog", () => ({
    HangoutDialog: ({ hangout }: { hangout?: { title: string } }) => (
      <button type="button">{hangout ? `Edit ${hangout.title}` : "New hangout"}</button>
    ),
    CancelHangoutButton: () => <button type="button">Cancel hangout</button>,
  }));
  vi.doMock("@/app/hub/projects/[projectId]/_components/project-cover-editor", () => ({
    ProjectCoverEditor: ({ kind }: { kind: string }) => (
      <div data-testid="cover-editor">{kind}</div>
    ),
  }));
  vi.doMock("@/lib/prisma", () => ({ prisma: { tag: { findMany: tagFindMany } } }));
  vi.doMock("@/components/layout/workspace-shell", () => ({ WorkspaceShell: workspaceShell }));
  vi.doMock("@/app/hub/_components/new-project-dialog", () => ({
    NewProjectDialog: () => <button type="button">New project</button>,
  }));
  vi.doMock("@/app/hub/_components/project-overview", () => ({
    ProjectOverview: ({
      projects,
      hangouts,
    }: {
      projects: Array<{ title: string }>;
      hangouts: Array<{ title: string }>;
    }) => (
      <ul data-testid="overview">
        {[...hangouts, ...projects].map((item) => (
          <li key={item.title}>{item.title}</li>
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

  vi.doMock("@/app/hub/hangouts/[hangoutId]/_components/availability-setup", () => ({
    AvailabilitySetup: ({ initial }: { initial: { dates: string[]; deadline: string | null } }) => (
      <p data-testid="availability-setup">
        {initial.dates.join(",")} {initial.deadline ?? "no deadline"}
      </p>
    ),
  }));
  vi.doMock("@/app/hub/hangouts/[hangoutId]/_components/availability-grid", () => ({
    AvailabilityGrid: ({
      user,
      responses,
      editable,
    }: {
      user: { name: string };
      responses: unknown[];
      editable: boolean;
    }) => (
      <p data-testid="availability-grid">
        {user.name} {responses.length} {editable ? "editable" : "read-only"}
      </p>
    ),
  }));
  vi.doMock("@/app/hub/hangouts/[hangoutId]/_components/lock-in", () => ({
    RankedSlots: ({ total, canLock }: { total: number; canLock: boolean }) => (
      <p data-testid="ranked-slots">
        {total} {canLock ? "lockable" : "view-only"}
      </p>
    ),
    LockedIn: ({ startSlot, canReopen }: { startSlot: string; canReopen: boolean }) => (
      <p data-testid="locked-in">
        {startSlot} {canReopen ? "reopenable" : "fixed"}
      </p>
    ),
  }));
  vi.doMock("@/app/hub/ideas/_components/idea-actions", () => ({
    IdeaActions: ({ title }: { title: string }) => <button type="button">Promote {title}</button>,
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
  const { default: HangoutPage } = await import("@/app/hub/hangouts/[hangoutId]/page");
  const { default: IdeasPage } = await import("@/app/hub/ideas/page");
  return {
    IdeasPage,
    HangoutPage,
    hangouts,
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

    expect(screen.getByText("Nothing planned yet")).toBeInTheDocument();
    expect(screen.getByText(/will show up here/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New hangout" })).not.toBeInTheDocument();
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

  it("passes hangouts to the overview and offers admins every create button", async () => {
    const { HubPage, getCurrentUser, hangouts } = await loadHub();
    getCurrentUser.mockResolvedValue(admin);

    const { unmount } = render(await HubPage());
    expect(screen.getByText(/Create the first hangout or project/)).toBeInTheDocument();
    unmount();

    hangouts.getHangoutSummaries.mockResolvedValue([HANGOUT]);
    render(await HubPage());
    expect(screen.getByRole("button", { name: "New hangout" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument();
    expect(screen.getByTestId("overview")).toHaveTextContent("Beach day");
  });

  it("renders a hangout for members, admins and after cancelling", async () => {
    const { HangoutPage, getCurrentUser, hangouts } = await loadHub();
    const params = () => ({ params: Promise.resolve({ hangoutId: "h1" }) });

    getCurrentUser.mockResolvedValue(null);
    await expect(HangoutPage(params())).rejects.toThrow("REDIRECT");

    getCurrentUser.mockResolvedValue(member);
    const members = render(await HangoutPage(params()));
    expect(screen.getByRole("heading", { name: "Beach day" })).toBeInTheDocument();
    expect(screen.getByText("Bring sunscreen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Discord thread" })).toHaveAttribute(
      "href",
      "https://discord.com/channels/1/2"
    );
    expect(screen.queryByRole("button", { name: "Cancel hangout" })).not.toBeInTheDocument();
    members.unmount();

    getCurrentUser.mockResolvedValue(admin);
    const admins = render(await HangoutPage(params()));
    expect(screen.getByRole("button", { name: "Edit Beach day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel hangout" })).toBeInTheDocument();
    expect(screen.getByTestId("cover-editor")).toHaveTextContent("hangout");
    admins.unmount();

    hangouts.getHangoutDetail.mockResolvedValueOnce({
      ...HANGOUT,
      status: "CANCELLED",
      description: null,
      discordThreadUrl: null,
    });
    render(await HangoutPage(params()));
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel hangout" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Discord thread" })).not.toBeInTheDocument();

    hangouts.getHangoutDetail.mockResolvedValueOnce(null);
    await expect(HangoutPage(params())).rejects.toThrow("NOT_FOUND");
  });

  it("lists open ideas with admin actions and marks promoted hangouts", async () => {
    const { IdeasPage, HangoutPage, getCurrentUser, hangouts } = await loadHub();

    getCurrentUser.mockResolvedValue(null);
    await expect(IdeasPage()).rejects.toThrow("REDIRECT");

    getCurrentUser.mockResolvedValue(member);
    const empty = render(await IdeasPage());
    expect(screen.getByText("No ideas yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ideas" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText(/Promote one/)).not.toBeInTheDocument();
    empty.unmount();

    hangouts.getOpenIdeas.mockResolvedValue([
      {
        id: "i1",
        title: "Karaoke",
        details: "Friday night?",
        createdAt: new Date("2026-09-28T16:00:00Z"),
        proposerName: "Sam Lee",
        proposerAvatarUrl: null,
      },
      {
        id: "i2",
        title: "Hike",
        details: null,
        createdAt: new Date("2026-09-27T16:00:00Z"),
        proposerName: "kai",
        proposerAvatarUrl: "https://a/kai.png",
      },
    ]);
    const members = render(await IdeasPage());
    expect(screen.getByRole("heading", { name: "Karaoke" })).toBeInTheDocument();
    expect(screen.getByText("Friday night?")).toBeInTheDocument();
    expect(screen.getByText(/Sam Lee · Sep 28/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Promote/ })).not.toBeInTheDocument();
    members.unmount();

    getCurrentUser.mockResolvedValue(admin);
    const admins = render(await IdeasPage());
    expect(screen.getByText(/Promote one to start collecting availability/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Promote Hike" })).toBeInTheDocument();
    admins.unmount();

    hangouts.getHangoutDetail.mockResolvedValueOnce({ ...HANGOUT, proposerName: "Sam Lee" });
    render(await HangoutPage({ params: Promise.resolve({ hangoutId: "h1" }) }));
    expect(screen.getByText("Idea by Sam Lee in Discord")).toBeInTheDocument();
  });

  it("shows the availability setup to admins and a summary to members", async () => {
    const { HangoutPage, getCurrentUser, hangouts } = await loadHub();
    const params = () => ({ params: Promise.resolve({ hangoutId: "h1" }) });
    const setUp = {
      ...HANGOUT,
      availabilityDates: ["2026-10-02", "2026-10-03"],
      windowStartHour: 18,
      windowEndHour: 22,
      availabilityDeadline: new Date("2026-10-01T22:00:00Z"),
    };

    getCurrentUser.mockResolvedValue(member);
    const empty = render(await HangoutPage(params()));
    expect(screen.getByText("The admins haven't picked dates yet.")).toBeInTheDocument();
    expect(screen.queryByTestId("availability-grid")).not.toBeInTheDocument();
    empty.unmount();

    hangouts.getHangoutDetail.mockResolvedValueOnce(setUp);
    const summary = render(await HangoutPage(params()));
    expect(screen.getByText("Fri, Oct 2, Sat, Oct 3")).toBeInTheDocument();
    expect(screen.getByText("6 PM – 10 PM EST · Fill in by Oct 1, 6:00 PM")).toBeInTheDocument();
    expect(screen.getByTestId("availability-grid")).toHaveTextContent("m@storytime.gg 1 editable");
    expect(screen.getByTestId("ranked-slots")).toHaveTextContent("1 view-only");
    expect(hangouts.getAvailabilityResponses).toHaveBeenCalledWith("h1");
    summary.unmount();

    hangouts.getHangoutDetail.mockResolvedValueOnce({ ...setUp, availabilityDeadline: null });
    const noDeadline = render(await HangoutPage(params()));
    expect(screen.getByText("6 PM – 10 PM EST")).toBeInTheDocument();
    noDeadline.unmount();

    getCurrentUser.mockResolvedValue(admin);
    hangouts.getHangoutDetail.mockResolvedValueOnce(setUp);
    const admins = render(await HangoutPage(params()));
    expect(screen.getByTestId("availability-setup")).toHaveTextContent(
      "2026-10-02,2026-10-03 2026-10-01T18:00"
    );
    admins.unmount();

    render(await HangoutPage(params()));
    expect(screen.getByTestId("availability-setup")).toHaveTextContent("no deadline");

    expect(screen.getAllByTestId("ranked-slots").at(-1)).toHaveTextContent("0 lockable");

    hangouts.getHangoutDetail.mockResolvedValueOnce({
      ...setUp,
      status: "SCHEDULED",
      startSlot: "2026-10-02T19:00",
    });
    render(await HangoutPage(params()));
    expect(screen.getAllByTestId("availability-setup")).toHaveLength(1);
    expect(screen.getAllByTestId("availability-grid").at(-1)).toHaveTextContent("read-only");
    expect(screen.getAllByTestId("ranked-slots")).toHaveLength(1);
    expect(screen.getByTestId("locked-in")).toHaveTextContent("2026-10-02T19:00 reopenable");
  });
});
