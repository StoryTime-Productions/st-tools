import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TimerClient } from "@/app/timer/_components/timer-client";
import { useTimerStore } from "@/stores/timer-store";

type TimerClientTestProps = React.ComponentProps<typeof TimerClient>;

const actionMocks = vi.hoisted(() => ({
  addUserToFocusSessionAction: vi.fn(),
  joinFocusSessionAction: vi.fn(),
  kickFocusSessionMemberAction: vi.fn(),
  leaveFocusSessionAction: vi.fn(),
  recordPomodoroSessionAction: vi.fn(),
  refreshPomodoroCollaborationAction: vi.fn(),
  respondToFocusSessionRequestAction: vi.fn(),
  startOwnFocusSessionAction: vi.fn(),
  updatePomodoroPreferencesAction: vi.fn(),
  syncFocusSessionTimerStateAction: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/app/actions/pomodoro", () => actionMocks);
vi.mock("@/app/actions/emotes", () => ({ sendEmoteAction: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      send: vi.fn(),
    })),
    removeChannel: vi.fn(),
  })),
}));
vi.mock("sonner", () => ({
  toast: toastMocks,
}));

function makeCollaboration(
  overrides?: Partial<TimerClientTestProps["initialCollaboration"]>
): TimerClientTestProps["initialCollaboration"] {
  return {
    currentSession: null,
    activeSessions: [],
    inviteCandidates: [],
    outgoingRequests: [],
    incomingRequests: [],
    ...overrides,
  };
}

function makeProps(): TimerClientTestProps {
  return {
    currentUserId: "11111111-1111-4111-8111-111111111111",
    initialWorkMinutes: 25,
    initialShortBreakMinutes: 5,
    initialLongBreakMinutes: 15,
    initialStats: {
      todayCount: 2,
      weekCount: 6,
      totalCount: 11,
      last7Days: [
        { dateKey: "2026-03-15", label: "Sun", count: 0 },
        { dateKey: "2026-03-16", label: "Mon", count: 1 },
        { dateKey: "2026-03-17", label: "Tue", count: 2 },
        { dateKey: "2026-03-18", label: "Wed", count: 1 },
        { dateKey: "2026-03-19", label: "Thu", count: 1 },
        { dateKey: "2026-03-20", label: "Fri", count: 0 },
        { dateKey: "2026-03-21", label: "Sat", count: 1 },
      ],
    },
    initialCollaboration: {
      currentSession: null,
      activeSessions: [],
      inviteCandidates: [],
      outgoingRequests: [],
      incomingRequests: [],
    },
  };
}

describe("TimerClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTimerStore.getState().__resetForTests();

    actionMocks.refreshPomodoroCollaborationAction.mockResolvedValue({
      snapshot: makeProps().initialCollaboration,
    });
    actionMocks.recordPomodoroSessionAction.mockResolvedValue({ success: true });
    actionMocks.updatePomodoroPreferencesAction.mockResolvedValue({ success: true });
    actionMocks.startOwnFocusSessionAction.mockResolvedValue({
      snapshot: makeProps().initialCollaboration,
    });
    actionMocks.leaveFocusSessionAction.mockResolvedValue({
      snapshot: makeProps().initialCollaboration,
    });
    actionMocks.addUserToFocusSessionAction.mockResolvedValue({
      snapshot: makeProps().initialCollaboration,
    });
    actionMocks.joinFocusSessionAction.mockResolvedValue({
      snapshot: makeProps().initialCollaboration,
    });
    actionMocks.kickFocusSessionMemberAction.mockResolvedValue({
      snapshot: makeProps().initialCollaboration,
    });
    actionMocks.respondToFocusSessionRequestAction.mockResolvedValue({
      snapshot: makeProps().initialCollaboration,
    });
    actionMocks.syncFocusSessionTimerStateAction.mockResolvedValue({
      snapshot: makeProps().initialCollaboration,
    });
  });

  it("renders primary timer sections in work phase", async () => {
    render(<TimerClient {...makeProps()} />);

    await waitFor(() => {
      expect(actionMocks.refreshPomodoroCollaborationAction).toHaveBeenCalled();
    });

    expect(screen.getByText("Focus")).toBeInTheDocument();
    expect(screen.getByText("Timer settings")).toBeInTheDocument();
    expect(screen.queryByText("Break minigame")).not.toBeInTheDocument();
    expect(screen.queryByText("Minigame leaderboard (all-time)")).not.toBeInTheDocument();
    expect(screen.getByText("Session collaboration")).toBeInTheDocument();
    expect(screen.getByText("Session stats")).toBeInTheDocument();
  });

  it("cycles stats controls", async () => {
    render(<TimerClient {...makeProps()} />);

    await waitFor(() => {
      expect(actionMocks.refreshPomodoroCollaborationAction).toHaveBeenCalled();
    });

    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Week" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All time" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All time" }));
    expect(screen.getByRole("button", { name: "All time" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    expect(screen.getByRole("button", { name: "Bar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Line" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Line" }));
    expect(screen.getByRole("button", { name: "Bar" })).toBeInTheDocument();
  });

  it("saves timer settings", async () => {
    render(<TimerClient {...makeProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));

    fireEvent.change(screen.getByLabelText("Work"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Short break"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Long break"), { target: { value: "20" } });

    fireEvent.click(screen.getByRole("button", { name: "Save timer settings" }));

    await waitFor(() => {
      expect(actionMocks.updatePomodoroPreferencesAction).toHaveBeenCalledWith({
        workMin: 30,
        shortBreakMin: 7,
        longBreakMin: 20,
      });
    });
    expect(toastMocks.success).toHaveBeenCalledWith("Timer settings updated");
  });

  it("shows an error toast when timer settings save fails", async () => {
    actionMocks.updatePomodoroPreferencesAction.mockResolvedValueOnce({
      error: "Unable to save timer settings",
    });

    render(<TimerClient {...makeProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.click(screen.getByRole("button", { name: "Save timer settings" }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Unable to save timer settings");
    });
  });

  it("renders owner collaboration controls and supports settings collapse", async () => {
    const props = makeProps();
    props.initialCollaboration = makeCollaboration({
      currentSession: {
        id: "session-1",
        title: "Deep Work",
        ownerId: props.currentUserId,
        ownerName: "Nirav",
        sharedTimer: null,
        members: [
          {
            userId: props.currentUserId,
            name: "Nirav",
            email: "nirav@example.com",
            avatarUrl: null,
            joinedAt: "2026-03-21T00:00:00.000Z",
            isOwner: true,
          },
          {
            userId: "teammate-1",
            name: "Teammate",
            email: "mate@example.com",
            avatarUrl: null,
            joinedAt: "2026-03-21T00:05:00.000Z",
            isOwner: false,
          },
        ],
      },
      activeSessions: [
        {
          id: "session-2",
          title: "Pair Focus",
          ownerId: "owner-2",
          ownerName: "Owner 2",
          memberCount: 2,
        },
      ],
      inviteCandidates: [
        {
          id: "invite-1",
          name: "Invitee",
          email: "invitee@example.com",
          avatarUrl: null,
        },
      ],
      incomingRequests: [
        {
          id: "req-in-1",
          sessionId: "session-2",
          sessionTitle: "Pair Focus",
          requesterId: "req-1",
          requesterName: "Requester",
          requesterEmail: "requester@example.com",
          targetUserId: props.currentUserId,
          targetName: "Nirav",
          targetEmail: "nirav@example.com",
          createdAt: "2026-03-21T12:00:00.000Z",
        },
      ],
      outgoingRequests: [
        {
          id: "req-out-1",
          sessionId: "session-1",
          sessionTitle: "Deep Work",
          requesterId: props.currentUserId,
          requesterName: "Nirav",
          requesterEmail: "nirav@example.com",
          targetUserId: "invite-1",
          targetName: "Invitee",
          targetEmail: "invitee@example.com",
          createdAt: "2026-03-21T12:01:00.000Z",
        },
      ],
    });

    actionMocks.refreshPomodoroCollaborationAction.mockResolvedValue({
      error: "offline",
    });
    render(<TimerClient {...props} />);

    await waitFor(() => {
      expect(actionMocks.refreshPomodoroCollaborationAction).toHaveBeenCalled();
    });

    expect(screen.getAllByText("Deep Work").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("button", { name: "Send request" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kick" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();
  });

  it("responds to incoming collaboration requests", async () => {
    const props = makeProps();
    props.initialCollaboration = makeCollaboration({
      incomingRequests: [
        {
          id: "req-in-1",
          sessionId: "session-2",
          sessionTitle: "Pair Focus",
          requesterId: "req-1",
          requesterName: "Requester",
          requesterEmail: "requester@example.com",
          targetUserId: props.currentUserId,
          targetName: "Nirav",
          targetEmail: "nirav@example.com",
          createdAt: "2026-03-21T12:00:00.000Z",
        },
      ],
    });

    actionMocks.refreshPomodoroCollaborationAction.mockResolvedValue({ error: "offline" });
    actionMocks.respondToFocusSessionRequestAction.mockResolvedValue({
      snapshot: props.initialCollaboration,
    });

    render(<TimerClient {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => {
      expect(actionMocks.respondToFocusSessionRequestAction).toHaveBeenCalledWith({
        requestId: "req-in-1",
        decision: "accept",
      });
    });
  });

  it("joins active sessions from collaboration panel", async () => {
    const props = makeProps();
    props.initialCollaboration = makeCollaboration({
      activeSessions: [
        {
          id: "session-2",
          title: "Pair Focus",
          ownerId: "owner-2",
          ownerName: "Owner 2",
          memberCount: 2,
        },
      ],
    });

    actionMocks.refreshPomodoroCollaborationAction.mockResolvedValue({ error: "offline" });
    actionMocks.joinFocusSessionAction.mockResolvedValue({
      snapshot: props.initialCollaboration,
    });

    render(<TimerClient {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => {
      expect(actionMocks.joinFocusSessionAction).toHaveBeenCalledWith({ sessionId: "session-2" });
    });
  });

  it("starts a personal session from idle state", async () => {
    render(<TimerClient {...makeProps()} />);

    fireEvent.change(screen.getByPlaceholderText("Session title (optional)"), {
      target: { value: "Flow mode" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start my own session" }));

    await waitFor(() => {
      expect(actionMocks.startOwnFocusSessionAction).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Flow mode",
          focusColor: expect.any(String),
          breakColor: expect.any(String),
        })
      );
    });
  });

  it("hides owner-only controls for locked non-owner sessions", async () => {
    const props = makeProps();
    props.initialCollaboration = makeCollaboration({
      currentSession: {
        id: "session-locked",
        title: "Locked session",
        ownerId: "another-user",
        ownerName: "Another User",
        sharedTimer: {
          phase: "work",
          secondsLeft: 900,
          sessionCount: 1,
          isRunning: true,
          startedAt: "2026-03-21T12:00:00.000Z",
          completionCount: 1,
          lastCompletedPhase: "work",
          lastCompletedDurationMin: 25,
          workMinutes: 25,
          shortBreakMinutes: 5,
          longBreakMinutes: 15,
          focusColor: "#3b82f6",
          breakColor: "#f97316",
          interpolatePhaseColors: true,
          autoStartBreaks: false,
          autoStartFocus: false,
        },
        members: [
          {
            userId: props.currentUserId,
            name: "Nirav",
            email: "nirav@example.com",
            avatarUrl: null,
            joinedAt: "2026-03-21T00:00:00.000Z",
            isOwner: false,
          },
        ],
      },
    });

    actionMocks.refreshPomodoroCollaborationAction.mockResolvedValue({
      snapshot: props.initialCollaboration,
    });

    render(<TimerClient {...props} />);

    await waitFor(() => {
      expect(actionMocks.refreshPomodoroCollaborationAction).toHaveBeenCalled();
    });

    expect(screen.queryByText("Timer settings")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kick" })).not.toBeInTheDocument();
  });

  it("displays member names in the session members list via MemberSlot", async () => {
    const props = makeProps();
    props.initialCollaboration = makeCollaboration({
      currentSession: {
        id: "session-slot",
        title: "Slot Test",
        ownerId: props.currentUserId,
        ownerName: "Nirav",
        sharedTimer: null,
        members: [
          {
            userId: props.currentUserId,
            name: "Nirav",
            email: "nirav@example.com",
            avatarUrl: null,
            joinedAt: "2026-03-21T00:00:00.000Z",
            isOwner: true,
          },
          {
            userId: "teammate-slot",
            name: "Alice",
            email: "alice@example.com",
            avatarUrl: null,
            joinedAt: "2026-03-21T00:01:00.000Z",
            isOwner: false,
          },
        ],
      },
    });

    actionMocks.refreshPomodoroCollaborationAction.mockResolvedValue({ error: "offline" });
    render(<TimerClient {...props} />);

    await waitFor(() => {
      expect(actionMocks.refreshPomodoroCollaborationAction).toHaveBeenCalled();
    });

    expect(screen.getByText("Nirav (You)")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows pause control while timer is running", () => {
    useTimerStore.setState({
      phase: "work",
      secondsLeft: 300,
      isRunning: true,
      targetEndsAt: Date.now() + 300_000,
      sessionCount: 0,
      completionCount: 0,
      lastCompletedPhase: null,
      lastCompletedDurationMin: null,
    });

    render(<TimerClient {...makeProps()} />);

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });
});
