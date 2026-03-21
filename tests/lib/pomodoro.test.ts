import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMinigameChampionsSnapshot,
  getMinigameLeaderboardSnapshot,
  getPomodoroCollaborationSnapshot,
  getPomodoroStatsSnapshot,
} from "@/lib/pomodoro";

const prismaMocks = vi.hoisted(() => ({
  pomodoroSessionCount: vi.fn(),
  pomodoroSessionFindMany: vi.fn(),
  focusSessionMemberFindMany: vi.fn(),
  focusSessionMemberUpdateMany: vi.fn(),
  focusSessionMemberFindFirst: vi.fn(),
  focusSessionFindMany: vi.fn(),
  focusSessionRequestFindMany: vi.fn(),
  userFindMany: vi.fn(),
  leaderboardFindMany: vi.fn(),
  leaderboardFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pomodoroSession: {
      count: prismaMocks.pomodoroSessionCount,
      findMany: prismaMocks.pomodoroSessionFindMany,
    },
    pomodoroFocusSessionMember: {
      findMany: prismaMocks.focusSessionMemberFindMany,
      updateMany: prismaMocks.focusSessionMemberUpdateMany,
      findFirst: prismaMocks.focusSessionMemberFindFirst,
    },
    pomodoroFocusSession: {
      findMany: prismaMocks.focusSessionFindMany,
    },
    pomodoroFocusSessionRequest: {
      findMany: prismaMocks.focusSessionRequestFindMany,
    },
    user: {
      findMany: prismaMocks.userFindMany,
    },
    minigameLeaderboardEntry: {
      findMany: prismaMocks.leaderboardFindMany,
      findFirst: prismaMocks.leaderboardFindFirst,
    },
  },
}));

describe("pomodoro library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds stats snapshot with 7-day chart bins", async () => {
    prismaMocks.pomodoroSessionCount
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(22);
    prismaMocks.pomodoroSessionFindMany.mockResolvedValueOnce([
      { completedAt: new Date("2026-03-18T09:00:00.000Z") },
      { completedAt: new Date("2026-03-18T10:00:00.000Z") },
      { completedAt: new Date("2026-03-20T10:00:00.000Z") },
    ]);

    const snapshot = await getPomodoroStatsSnapshot(
      "11111111-1111-4111-8111-111111111111",
      new Date("2026-03-21T10:00:00.000Z")
    );

    expect(snapshot.todayCount).toBe(3);
    expect(snapshot.weekCount).toBe(8);
    expect(snapshot.totalCount).toBe(22);
    expect(snapshot.last7Days).toHaveLength(7);
    expect(snapshot.last7Days.find((day) => day.dateKey === "2026-03-18")?.count).toBe(2);
    expect(snapshot.last7Days.find((day) => day.dateKey === "2026-03-20")?.count).toBe(1);
  });

  it("returns collaboration snapshot without current session", async () => {
    prismaMocks.focusSessionMemberFindMany.mockResolvedValueOnce([]);
    prismaMocks.focusSessionMemberFindFirst.mockResolvedValueOnce(null);
    prismaMocks.focusSessionFindMany.mockResolvedValueOnce([
      {
        id: "s-2",
        title: "Design sprint",
        ownerId: "owner-2",
        owner: { id: "owner-2", name: "Owner Two", email: "owner2@example.com", avatarUrl: null },
        members: [{ userId: "owner-2" }, { userId: "u-3" }],
      },
    ]);
    prismaMocks.focusSessionRequestFindMany.mockResolvedValueOnce([
      {
        id: "req-1",
        session: { id: "s-2", title: "Design sprint" },
        requester: { id: "u-8", name: "Requester", email: "requester@example.com" },
        targetUser: { id: "u-1", name: "Nirav", email: "nirav@example.com" },
        createdAt: new Date("2026-03-21T10:00:00.000Z"),
      },
    ]);

    const snapshot = await getPomodoroCollaborationSnapshot("u-1");

    expect(snapshot.currentSession).toBeNull();
    expect(snapshot.activeSessions).toEqual([
      {
        id: "s-2",
        title: "Design sprint",
        ownerId: "owner-2",
        ownerName: "Owner Two",
        memberCount: 2,
      },
    ]);
    expect(snapshot.incomingRequests).toHaveLength(1);
    expect(snapshot.outgoingRequests).toHaveLength(0);
    expect(snapshot.inviteCandidates).toHaveLength(0);
    expect(prismaMocks.focusSessionMemberUpdateMany).not.toHaveBeenCalled();
  });

  it("returns owner collaboration snapshot with normalized timer state and invite filtering", async () => {
    prismaMocks.focusSessionMemberFindMany.mockResolvedValueOnce([
      { sessionId: "s-1" },
      { sessionId: "s-stale" },
    ]);
    prismaMocks.focusSessionMemberFindFirst.mockResolvedValueOnce({
      session: {
        id: "s-1",
        title: "Focus room",
        timerState: {
          phase: "unexpected",
          secondsLeft: -90,
          sessionCount: 3.7,
          isRunning: true,
          completionCount: 42,
          lastCompletedPhase: "shortBreak",
          lastCompletedDurationMin: 300,
          startedAt: "invalid-date",
          workMinutes: 120,
          shortBreakMinutes: 0,
          longBreakMinutes: 2,
          focusColor: "#ABCDEF",
          breakColor: "not-a-color",
          interpolatePhaseColors: false,
          autoStartBreaks: true,
          autoStartFocus: true,
        },
        ownerId: "u-1",
        owner: { id: "u-1", name: "Nirav", email: "nirav@example.com", avatarUrl: null },
        members: [
          {
            userId: "u-2",
            joinedAt: new Date("2026-03-20T10:00:00.000Z"),
            user: { id: "u-2", name: "Teammate", email: "teammate@example.com", avatarUrl: null },
          },
          {
            userId: "u-1",
            joinedAt: new Date("2026-03-19T10:00:00.000Z"),
            user: { id: "u-1", name: "Nirav", email: "nirav@example.com", avatarUrl: null },
          },
        ],
      },
    });
    prismaMocks.focusSessionFindMany.mockResolvedValueOnce([]);
    prismaMocks.focusSessionRequestFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "out-1",
        targetUserId: "u-4",
        session: { id: "s-1", title: "Focus room" },
        requester: { id: "u-1", name: "Nirav", email: "nirav@example.com" },
        targetUser: { id: "u-4", name: "Pending User", email: "pending@example.com" },
        createdAt: new Date("2026-03-21T10:30:00.000Z"),
      },
    ]);
    prismaMocks.userFindMany.mockResolvedValueOnce([
      { id: "u-1", name: "Nirav", email: "nirav@example.com", avatarUrl: null },
      { id: "u-3", name: "Alpha", email: "alpha@example.com", avatarUrl: null },
      { id: "u-4", name: "Pending User", email: "pending@example.com", avatarUrl: null },
    ]);

    const snapshot = await getPomodoroCollaborationSnapshot("u-1");

    expect(prismaMocks.focusSessionMemberUpdateMany).toHaveBeenCalledTimes(1);
    expect(snapshot.currentSession?.ownerId).toBe("u-1");
    expect(snapshot.currentSession?.members[0]?.userId).toBe("u-1");
    expect(snapshot.currentSession?.sharedTimer).toMatchObject({
      phase: "work",
      secondsLeft: 0,
      sessionCount: 4,
      isRunning: true,
      completionCount: 42,
      lastCompletedPhase: "shortBreak",
      lastCompletedDurationMin: 180,
      workMinutes: 90,
      shortBreakMinutes: 1,
      longBreakMinutes: 5,
      focusColor: "#abcdef",
      breakColor: null,
      interpolatePhaseColors: false,
      autoStartBreaks: true,
      autoStartFocus: true,
    });
    expect(snapshot.inviteCandidates.map((candidate) => candidate.id)).toEqual(["u-3"]);
    expect(snapshot.outgoingRequests).toHaveLength(1);
  });

  it("maps leaderboard ranks and champions", async () => {
    prismaMocks.leaderboardFindMany.mockResolvedValueOnce([
      {
        userId: "u-1",
        allTimeScore: 25,
        bestScore: 10,
        plays: 4,
        updatedAt: new Date(),
        user: { id: "u-1", name: "Nirav", email: "nirav@example.com", avatarUrl: null },
      },
      {
        userId: "u-2",
        allTimeScore: 20,
        bestScore: 9,
        plays: 6,
        updatedAt: new Date(),
        user: { id: "u-2", name: null, email: "teammate@example.com", avatarUrl: null },
      },
    ]);

    const leaderboard = await getMinigameLeaderboardSnapshot("reaction_tap", "u-1");

    expect(leaderboard.entries).toHaveLength(2);
    expect(leaderboard.entries[0]).toMatchObject({ rank: 1, userId: "u-1", isCurrentUser: true });
    expect(leaderboard.entries[1]).toMatchObject({ rank: 2, userId: "u-2", isCurrentUser: false });

    prismaMocks.leaderboardFindFirst
      .mockResolvedValueOnce({
        userId: "u-1",
        allTimeScore: 25,
        user: { id: "u-1", name: "Nirav", email: "nirav@example.com" },
      })
      .mockResolvedValueOnce(null);

    const champions = await getMinigameChampionsSnapshot(["reaction_tap", "typing_scribe"]);

    expect(champions).toEqual([
      {
        gameKey: "reaction_tap",
        championName: "Nirav",
        championUserId: "u-1",
        championScore: 25,
      },
      {
        gameKey: "typing_scribe",
        championName: "No champion yet",
        championUserId: null,
        championScore: 0,
      },
    ]);
  });

  it("sorts session members by current user, then owner, then display name", async () => {
    prismaMocks.focusSessionMemberFindMany.mockResolvedValueOnce([{ sessionId: "s-3" }]);
    prismaMocks.focusSessionMemberFindFirst.mockResolvedValueOnce({
      session: {
        id: "s-3",
        title: "Cross-team focus",
        timerState: {
          phase: "longBreak",
          startedAt: "2026-03-21T10:15:00.000Z",
          interpolatePhaseColors: true,
        },
        ownerId: "u-2",
        owner: { id: "u-2", name: "Owner User", email: "owner@example.com", avatarUrl: null },
        members: [
          {
            userId: "u-4",
            joinedAt: new Date("2026-03-20T11:00:00.000Z"),
            user: { id: "u-4", name: "Beta", email: "beta@example.com", avatarUrl: null },
          },
          {
            userId: "u-3",
            joinedAt: new Date("2026-03-20T10:00:00.000Z"),
            user: { id: "u-3", name: "Alpha", email: "alpha@example.com", avatarUrl: null },
          },
          {
            userId: "u-2",
            joinedAt: new Date("2026-03-19T10:00:00.000Z"),
            user: { id: "u-2", name: "Owner User", email: "owner@example.com", avatarUrl: null },
          },
          {
            userId: "u-1",
            joinedAt: new Date("2026-03-20T09:00:00.000Z"),
            user: {
              id: "u-1",
              name: "Current User",
              email: "current@example.com",
              avatarUrl: null,
            },
          },
        ],
      },
    });
    prismaMocks.focusSessionFindMany.mockResolvedValueOnce([]);
    prismaMocks.focusSessionRequestFindMany.mockResolvedValueOnce([]);

    const snapshot = await getPomodoroCollaborationSnapshot("u-1");

    expect(snapshot.currentSession?.members.map((member) => member.userId)).toEqual([
      "u-1",
      "u-2",
      "u-3",
      "u-4",
    ]);
    expect(snapshot.currentSession?.sharedTimer).toMatchObject({
      phase: "longBreak",
      startedAt: "2026-03-21T10:15:00.000Z",
      interpolatePhaseColors: true,
      autoStartBreaks: false,
      autoStartFocus: false,
    });
    expect(prismaMocks.focusSessionMemberUpdateMany).not.toHaveBeenCalled();
  });

  it("maps null timer state and prioritizes owner over other members", async () => {
    prismaMocks.focusSessionMemberFindMany.mockResolvedValueOnce([{ sessionId: "s-4" }]);
    prismaMocks.focusSessionMemberFindFirst.mockResolvedValueOnce({
      session: {
        id: "s-4",
        title: "Owner priority",
        timerState: null,
        ownerId: "u-2",
        owner: { id: "u-2", name: "Owner User", email: "owner@example.com", avatarUrl: null },
        members: [
          {
            userId: "u-3",
            joinedAt: new Date("2026-03-20T11:00:00.000Z"),
            user: { id: "u-3", name: "Member", email: "member@example.com", avatarUrl: null },
          },
          {
            userId: "u-2",
            joinedAt: new Date("2026-03-20T10:00:00.000Z"),
            user: { id: "u-2", name: "Owner User", email: "owner@example.com", avatarUrl: null },
          },
          {
            userId: "u-1",
            joinedAt: new Date("2026-03-20T09:00:00.000Z"),
            user: {
              id: "u-1",
              name: "Current User",
              email: "current@example.com",
              avatarUrl: null,
            },
          },
        ],
      },
    });
    prismaMocks.focusSessionFindMany.mockResolvedValueOnce([]);
    prismaMocks.focusSessionRequestFindMany.mockResolvedValueOnce([]);

    const snapshot = await getPomodoroCollaborationSnapshot("u-1");

    expect(snapshot.currentSession?.sharedTimer).toBeNull();
    expect(snapshot.currentSession?.members.map((member) => member.userId)).toEqual([
      "u-1",
      "u-2",
      "u-3",
    ]);
  });

  it("orders owner before non-owner when current user is not in member list", async () => {
    prismaMocks.focusSessionMemberFindMany.mockResolvedValueOnce([{ sessionId: "s-5" }]);
    prismaMocks.focusSessionMemberFindFirst.mockResolvedValueOnce({
      session: {
        id: "s-5",
        title: "Edge ordering",
        timerState: {},
        ownerId: "u-2",
        owner: { id: "u-2", name: "Owner User", email: "owner@example.com", avatarUrl: null },
        members: [
          {
            userId: "u-3",
            joinedAt: new Date("2026-03-20T11:00:00.000Z"),
            user: { id: "u-3", name: "Member", email: "member@example.com", avatarUrl: null },
          },
          {
            userId: "u-2",
            joinedAt: new Date("2026-03-20T10:00:00.000Z"),
            user: { id: "u-2", name: "Owner User", email: "owner@example.com", avatarUrl: null },
          },
        ],
      },
    });
    prismaMocks.focusSessionFindMany.mockResolvedValueOnce([]);
    prismaMocks.focusSessionRequestFindMany.mockResolvedValueOnce([]);

    const snapshot = await getPomodoroCollaborationSnapshot("u-1");

    expect(snapshot.currentSession?.members.map((member) => member.userId)).toEqual(["u-2", "u-3"]);
  });
});
