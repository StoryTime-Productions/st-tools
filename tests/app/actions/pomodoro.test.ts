import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadPomodoroActionsModule() {
  const revalidatePath = vi.fn();
  const getCurrentUser = vi.fn();
  const getPomodoroCollaborationSnapshot = vi.fn();
  const getMinigameLeaderboardSnapshot = vi.fn();

  const tx = {
    user: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    pomodoroSession: {
      create: vi.fn(),
    },
    pomodoroFocusSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    pomodoroFocusSessionMember: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    pomodoroFocusSessionRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    minigameLeaderboardEntry: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  const prisma = {
    user: tx.user,
    pomodoroSession: tx.pomodoroSession,
    pomodoroFocusSession: tx.pomodoroFocusSession,
    pomodoroFocusSessionMember: tx.pomodoroFocusSessionMember,
    pomodoroFocusSessionRequest: tx.pomodoroFocusSessionRequest,
    minigameLeaderboardEntry: tx.minigameLeaderboardEntry,
    $transaction: vi.fn(async (input: unknown) => {
      if (typeof input === "function") {
        return (input as (transactionClient: typeof tx) => Promise<unknown>)(tx);
      }

      return null;
    }),
  };

  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/pomodoro", () => ({
    DEFAULT_MINIGAME_KEY: "reaction_tap",
    getPomodoroCollaborationSnapshot,
    getMinigameLeaderboardSnapshot,
  }));
  vi.doMock("@/lib/prisma", () => ({
    prisma,
  }));

  const pomodoroActionsModule = await import("@/app/actions/pomodoro");

  return {
    ...pomodoroActionsModule,
    revalidatePath,
    getCurrentUser,
    getPomodoroCollaborationSnapshot,
    getMinigameLeaderboardSnapshot,
    prisma,
    tx,
  };
}

describe("pomodoro actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("updates pomodoro preferences for authenticated users", async () => {
    const { updatePomodoroPreferencesAction, getCurrentUser, tx, revalidatePath } =
      await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({ id: "11111111-1111-4111-8111-111111111111" });

    await expect(
      updatePomodoroPreferencesAction({
        workMin: 30,
        shortBreakMin: 7,
        longBreakMin: 20,
      })
    ).resolves.toEqual({ success: true });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "11111111-1111-4111-8111-111111111111" },
      data: {
        pomodoroWorkMin: 30,
        pomodoroShortBreakMin: 7,
        pomodoroLongBreakMin: 20,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/profile");
    expect(revalidatePath).toHaveBeenCalledWith("/timer");
  });

  it("validates pomodoro preferences and auth", async () => {
    const { updatePomodoroPreferencesAction, getCurrentUser } = await loadPomodoroActionsModule();

    await expect(
      updatePomodoroPreferencesAction({
        workMin: 0,
        shortBreakMin: 3,
        longBreakMin: 10,
      })
    ).resolves.toEqual({ error: "Work duration must be at least 1 minute" });

    getCurrentUser.mockResolvedValueOnce(null);
    await expect(
      updatePomodoroPreferencesAction({
        workMin: 25,
        shortBreakMin: 5,
        longBreakMin: 15,
      })
    ).resolves.toEqual({ error: "Not authenticated" });
  });

  it("blocks timer value updates for non-owner members in shared sessions", async () => {
    const { updatePomodoroPreferencesAction, getCurrentUser, tx } =
      await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      role: "MEMBER",
    });

    tx.pomodoroFocusSessionMember.findFirst.mockResolvedValueOnce({
      session: {
        ownerId: "99999999-9999-4999-8999-999999999999",
      },
    });

    await expect(
      updatePomodoroPreferencesAction({
        workMin: 25,
        shortBreakMin: 5,
        longBreakMin: 15,
      })
    ).resolves.toEqual({ error: "Only the session owner can change shared timer values" });

    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("records a completed pomodoro session", async () => {
    const { recordPomodoroSessionAction, getCurrentUser, tx, revalidatePath } =
      await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({ id: "11111111-1111-4111-8111-111111111111" });

    await expect(recordPomodoroSessionAction({ durationMin: 25 })).resolves.toEqual({
      success: true,
    });

    expect(tx.pomodoroSession.create).toHaveBeenCalledWith({
      data: {
        userId: "11111111-1111-4111-8111-111111111111",
        durationMin: 25,
        points: 1,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/timer");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("validates session recording payloads", async () => {
    const { recordPomodoroSessionAction, getCurrentUser } = await loadPomodoroActionsModule();

    await expect(recordPomodoroSessionAction({ durationMin: 0 })).resolves.toEqual({
      error: "Session duration must be at least 1 minute",
    });

    getCurrentUser.mockResolvedValueOnce(null);
    await expect(recordPomodoroSessionAction({ durationMin: 25 })).resolves.toEqual({
      error: "Not authenticated",
    });
  });

  it("starts an owned focus session and returns collaboration snapshot", async () => {
    const {
      startOwnFocusSessionAction,
      getCurrentUser,
      getPomodoroCollaborationSnapshot,
      tx,
      revalidatePath,
    } = await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Nirav",
      email: "nirav@example.com",
      role: "MEMBER",
      pomodoroWorkMin: 30,
      pomodoroShortBreakMin: 6,
      pomodoroLongBreakMin: 18,
    });

    tx.pomodoroFocusSessionMember.findFirst.mockResolvedValueOnce(null);
    tx.pomodoroFocusSession.create.mockResolvedValueOnce({
      id: "22222222-2222-4222-8222-222222222222",
    });

    const snapshot = {
      currentSession: {
        id: "22222222-2222-4222-8222-222222222222",
        title: "My sprint",
        ownerId: "11111111-1111-4111-8111-111111111111",
        ownerName: "Nirav",
        members: [],
      },
      activeSessions: [],
      inviteCandidates: [],
      outgoingRequests: [],
      incomingRequests: [],
    };

    getPomodoroCollaborationSnapshot.mockResolvedValueOnce(snapshot);

    await expect(startOwnFocusSessionAction({ title: "My sprint" })).resolves.toEqual({
      success: true,
      snapshot,
    });

    expect(tx.pomodoroFocusSession.create).toHaveBeenCalledWith({
      data: {
        title: "My sprint",
        ownerId: "11111111-1111-4111-8111-111111111111",
        timerState: {
          phase: "work",
          secondsLeft: 1800,
          sessionCount: 0,
          completionCount: 0,
          lastCompletedPhase: null,
          lastCompletedDurationMin: null,
          isRunning: false,
          startedAt: null,
          workMinutes: 30,
          shortBreakMinutes: 6,
          longBreakMinutes: 18,
          focusColor: "#3b82f6",
          breakColor: "#f97316",
          interpolatePhaseColors: true,
          autoStartBreaks: false,
          autoStartFocus: false,
        },
      },
    });
    expect(tx.pomodoroFocusSessionMember.upsert).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/timer");
  });

  it("returns error when joining unknown focus session", async () => {
    const { joinFocusSessionAction, getCurrentUser, tx } = await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
    });
    tx.pomodoroFocusSession.findFirst.mockResolvedValueOnce(null);

    await expect(
      joinFocusSessionAction({ sessionId: "33333333-3333-4333-8333-333333333333" })
    ).resolves.toEqual({ error: "Session not found" });
  });

  it("joins an active focus session", async () => {
    const {
      joinFocusSessionAction,
      getCurrentUser,
      getPomodoroCollaborationSnapshot,
      tx,
      revalidatePath,
    } = await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
    });

    tx.pomodoroFocusSession.findFirst.mockResolvedValueOnce({
      id: "33333333-3333-4333-8333-333333333333",
    });
    tx.pomodoroFocusSessionMember.findFirst.mockResolvedValueOnce(null);

    const snapshot = {
      currentSession: null,
      activeSessions: [],
      inviteCandidates: [],
      outgoingRequests: [],
      incomingRequests: [],
    };
    getPomodoroCollaborationSnapshot.mockResolvedValueOnce(snapshot);

    await expect(
      joinFocusSessionAction({ sessionId: "33333333-3333-4333-8333-333333333333" })
    ).resolves.toEqual({ success: true, snapshot });

    expect(tx.pomodoroFocusSessionMember.upsert).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/timer");
  });

  it("leaves active focus session for authenticated users", async () => {
    const {
      leaveFocusSessionAction,
      getCurrentUser,
      getPomodoroCollaborationSnapshot,
      tx,
      revalidatePath,
    } = await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
    });
    tx.pomodoroFocusSessionMember.findFirst.mockResolvedValueOnce(null);

    const snapshot = {
      currentSession: null,
      activeSessions: [],
      inviteCandidates: [],
      outgoingRequests: [],
      incomingRequests: [],
    };
    getPomodoroCollaborationSnapshot.mockResolvedValueOnce(snapshot);

    await expect(leaveFocusSessionAction()).resolves.toEqual({ success: true, snapshot });
    expect(revalidatePath).toHaveBeenCalledWith("/timer");
  });

  it("requires authentication before leaving focus session", async () => {
    const { leaveFocusSessionAction, getCurrentUser } = await loadPomodoroActionsModule();
    getCurrentUser.mockResolvedValueOnce(null);

    await expect(leaveFocusSessionAction()).resolves.toEqual({ error: "Not authenticated" });
  });

  it("refreshes collaboration snapshot for authenticated users", async () => {
    const { refreshPomodoroCollaborationAction, getCurrentUser, getPomodoroCollaborationSnapshot } =
      await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({ id: "11111111-1111-4111-8111-111111111111" });

    const snapshot = {
      currentSession: null,
      activeSessions: [],
      inviteCandidates: [],
      outgoingRequests: [],
      incomingRequests: [],
    };

    getPomodoroCollaborationSnapshot.mockResolvedValueOnce(snapshot);

    await expect(refreshPomodoroCollaborationAction()).resolves.toEqual({
      success: true,
      snapshot,
    });

    expect(getPomodoroCollaborationSnapshot).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("requires authentication to refresh collaboration snapshot", async () => {
    const { refreshPomodoroCollaborationAction, getCurrentUser } =
      await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce(null);

    await expect(refreshPomodoroCollaborationAction()).resolves.toEqual({
      error: "Not authenticated",
    });
  });

  it("syncs shared timer state for session owners", async () => {
    const {
      syncFocusSessionTimerStateAction,
      getCurrentUser,
      getPomodoroCollaborationSnapshot,
      tx,
      revalidatePath,
    } = await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      role: "MEMBER",
    });

    tx.pomodoroFocusSession.findUnique.mockResolvedValueOnce({
      id: "33333333-3333-4333-8333-333333333333",
      isActive: true,
      ownerId: "11111111-1111-4111-8111-111111111111",
    });

    const snapshot = {
      currentSession: null,
      activeSessions: [],
      inviteCandidates: [],
      outgoingRequests: [],
      incomingRequests: [],
    };
    getPomodoroCollaborationSnapshot.mockResolvedValueOnce(snapshot);

    await expect(
      syncFocusSessionTimerStateAction({
        sessionId: "33333333-3333-4333-8333-333333333333",
        phase: "work",
        secondsLeft: 1200,
        sessionCount: 2,
        isRunning: true,
        workMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
      })
    ).resolves.toEqual({ success: true, snapshot });

    expect(tx.pomodoroFocusSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "33333333-3333-4333-8333-333333333333" },
        data: {
          timerState: expect.objectContaining({
            phase: "work",
            secondsLeft: 1200,
            sessionCount: 2,
            isRunning: true,
            workMinutes: 25,
            shortBreakMinutes: 5,
            longBreakMinutes: 15,
          }),
        },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/timer");
  });

  it("rejects shared timer sync for non-owners", async () => {
    const { syncFocusSessionTimerStateAction, getCurrentUser, tx } =
      await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      role: "MEMBER",
    });

    tx.pomodoroFocusSession.findUnique.mockResolvedValueOnce({
      id: "33333333-3333-4333-8333-333333333333",
      isActive: true,
      ownerId: "99999999-9999-4999-8999-999999999999",
    });

    await expect(
      syncFocusSessionTimerStateAction({
        sessionId: "33333333-3333-4333-8333-333333333333",
        phase: "work",
        secondsLeft: 1200,
        sessionCount: 2,
        isRunning: true,
        workMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
      })
    ).resolves.toEqual({ error: "Only the session owner can control the shared timer" });
  });

  it("creates a pending request for an owned focus session", async () => {
    const { addUserToFocusSessionAction, getCurrentUser, getPomodoroCollaborationSnapshot, tx } =
      await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      role: "MEMBER",
    });

    tx.user.findUnique.mockResolvedValueOnce({
      id: "44444444-4444-4444-8444-444444444444",
    });
    tx.pomodoroFocusSessionMember.findFirst.mockResolvedValueOnce(null);
    tx.pomodoroFocusSession.findUnique.mockResolvedValueOnce({
      id: "33333333-3333-4333-8333-333333333333",
      isActive: true,
      ownerId: "11111111-1111-4111-8111-111111111111",
    });
    tx.pomodoroFocusSessionRequest.findFirst.mockResolvedValueOnce(null);

    const snapshot = {
      currentSession: null,
      activeSessions: [],
      inviteCandidates: [],
      outgoingRequests: [],
      incomingRequests: [],
    };
    getPomodoroCollaborationSnapshot.mockResolvedValueOnce(snapshot);

    await expect(
      addUserToFocusSessionAction({
        sessionId: "33333333-3333-4333-8333-333333333333",
        userId: "44444444-4444-4444-8444-444444444444",
      })
    ).resolves.toEqual({
      success: true,
      snapshot,
    });

    expect(tx.pomodoroFocusSessionRequest.create).toHaveBeenCalledWith({
      data: {
        sessionId: "33333333-3333-4333-8333-333333333333",
        requesterId: "11111111-1111-4111-8111-111111111111",
        targetUserId: "44444444-4444-4444-8444-444444444444",
        status: "PENDING",
      },
    });
  });

  it("accepts an incoming focus session request", async () => {
    const {
      respondToFocusSessionRequestAction,
      getCurrentUser,
      getPomodoroCollaborationSnapshot,
      tx,
      revalidatePath,
    } = await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "44444444-4444-4444-8444-444444444444",
      role: "MEMBER",
    });

    tx.pomodoroFocusSessionRequest.findUnique.mockResolvedValueOnce({
      id: "55555555-5555-4555-8555-555555555555",
      sessionId: "33333333-3333-4333-8333-333333333333",
      targetUserId: "44444444-4444-4444-8444-444444444444",
      status: "PENDING",
      session: {
        id: "33333333-3333-4333-8333-333333333333",
        isActive: true,
      },
    });
    tx.pomodoroFocusSessionMember.findFirst.mockResolvedValueOnce({
      sessionId: "66666666-6666-4666-8666-666666666666",
      session: {
        members: [{ userId: "44444444-4444-4444-8444-444444444444" }],
      },
    });

    const snapshot = {
      currentSession: {
        id: "33333333-3333-4333-8333-333333333333",
        title: "Owner session",
        ownerId: "11111111-1111-4111-8111-111111111111",
        ownerName: "Owner",
        members: [],
      },
      activeSessions: [],
      inviteCandidates: [],
      outgoingRequests: [],
      incomingRequests: [],
    };
    getPomodoroCollaborationSnapshot.mockResolvedValueOnce(snapshot);

    await expect(
      respondToFocusSessionRequestAction({
        requestId: "55555555-5555-4555-8555-555555555555",
        decision: "accept",
      })
    ).resolves.toEqual({ success: true, snapshot });

    expect(tx.pomodoroFocusSessionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "55555555-5555-4555-8555-555555555555" },
        data: expect.objectContaining({ status: "ACCEPTED" }),
      })
    );
    expect(tx.pomodoroFocusSessionMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_userId: {
            sessionId: "66666666-6666-4666-8666-666666666666",
            userId: "44444444-4444-4444-8444-444444444444",
          },
        },
      })
    );
    expect(tx.pomodoroFocusSessionMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_userId: {
            sessionId: "33333333-3333-4333-8333-333333333333",
            userId: "44444444-4444-4444-8444-444444444444",
          },
        },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/timer");
  });

  it("declines an incoming request", async () => {
    const {
      respondToFocusSessionRequestAction,
      getCurrentUser,
      getPomodoroCollaborationSnapshot,
      tx,
      revalidatePath,
    } = await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "44444444-4444-4444-8444-444444444444",
      role: "MEMBER",
    });

    tx.pomodoroFocusSessionRequest.findUnique.mockResolvedValueOnce({
      id: "55555555-5555-4555-8555-555555555555",
      sessionId: "33333333-3333-4333-8333-333333333333",
      targetUserId: "44444444-4444-4444-8444-444444444444",
      status: "PENDING",
      session: {
        id: "33333333-3333-4333-8333-333333333333",
        isActive: true,
      },
    });

    const snapshot = {
      currentSession: null,
      activeSessions: [],
      inviteCandidates: [],
      outgoingRequests: [],
      incomingRequests: [],
    };
    getPomodoroCollaborationSnapshot.mockResolvedValueOnce(snapshot);

    await expect(
      respondToFocusSessionRequestAction({
        requestId: "55555555-5555-4555-8555-555555555555",
        decision: "decline",
      })
    ).resolves.toEqual({ success: true, snapshot });

    expect(tx.pomodoroFocusSessionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DECLINED" }) })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/timer");
  });

  it("cancels request acceptance when session is inactive", async () => {
    const { respondToFocusSessionRequestAction, getCurrentUser, tx } =
      await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "44444444-4444-4444-8444-444444444444",
      role: "MEMBER",
    });

    tx.pomodoroFocusSessionRequest.findUnique.mockResolvedValueOnce({
      id: "55555555-5555-4555-8555-555555555555",
      sessionId: "33333333-3333-4333-8333-333333333333",
      targetUserId: "44444444-4444-4444-8444-444444444444",
      status: "PENDING",
      session: {
        id: "33333333-3333-4333-8333-333333333333",
        isActive: false,
      },
    });

    await expect(
      respondToFocusSessionRequestAction({
        requestId: "55555555-5555-4555-8555-555555555555",
        decision: "accept",
      })
    ).resolves.toEqual({ error: "Session is no longer active" });

    expect(tx.pomodoroFocusSessionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) })
    );
  });

  it("kicks a member from active session", async () => {
    const {
      kickFocusSessionMemberAction,
      getCurrentUser,
      getPomodoroCollaborationSnapshot,
      tx,
      revalidatePath,
    } = await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      role: "MEMBER",
    });

    tx.pomodoroFocusSession.findUnique.mockResolvedValueOnce({
      id: "33333333-3333-4333-8333-333333333333",
      isActive: true,
      ownerId: "11111111-1111-4111-8111-111111111111",
    });
    tx.pomodoroFocusSessionMember.findUnique.mockResolvedValueOnce({
      userId: "44444444-4444-4444-8444-444444444444",
      isActive: true,
    });

    const snapshot = {
      currentSession: null,
      activeSessions: [],
      inviteCandidates: [],
      outgoingRequests: [],
      incomingRequests: [],
    };
    getPomodoroCollaborationSnapshot.mockResolvedValueOnce(snapshot);

    await expect(
      kickFocusSessionMemberAction({
        sessionId: "33333333-3333-4333-8333-333333333333",
        userId: "44444444-4444-4444-8444-444444444444",
      })
    ).resolves.toEqual({ success: true, snapshot });

    expect(tx.pomodoroFocusSessionMember.update).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/timer");
  });

  it("returns error when kicking inactive member", async () => {
    const { kickFocusSessionMemberAction, getCurrentUser, tx } = await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      role: "MEMBER",
    });

    tx.pomodoroFocusSession.findUnique.mockResolvedValueOnce({
      id: "33333333-3333-4333-8333-333333333333",
      isActive: true,
      ownerId: "11111111-1111-4111-8111-111111111111",
    });
    tx.pomodoroFocusSessionMember.findUnique.mockResolvedValueOnce({
      userId: "44444444-4444-4444-8444-444444444444",
      isActive: false,
    });

    await expect(
      kickFocusSessionMemberAction({
        sessionId: "33333333-3333-4333-8333-333333333333",
        userId: "44444444-4444-4444-8444-444444444444",
      })
    ).resolves.toEqual({ error: "Member is not currently active in this session" });
  });

  it("returns error when owner is targeted for removal", async () => {
    const { kickFocusSessionMemberAction, getCurrentUser, tx } = await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      role: "MEMBER",
    });

    tx.pomodoroFocusSession.findUnique.mockResolvedValueOnce({
      id: "33333333-3333-4333-8333-333333333333",
      isActive: true,
      ownerId: "11111111-1111-4111-8111-111111111111",
    });

    await expect(
      kickFocusSessionMemberAction({
        sessionId: "33333333-3333-4333-8333-333333333333",
        userId: "11111111-1111-4111-8111-111111111111",
      })
    ).resolves.toEqual({ error: "Session owner cannot be removed" });
  });

  it("rejects add-user requests when adding yourself", async () => {
    const { addUserToFocusSessionAction, getCurrentUser } = await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      role: "MEMBER",
    });

    await expect(
      addUserToFocusSessionAction({
        sessionId: "33333333-3333-4333-8333-333333333333",
        userId: "11111111-1111-4111-8111-111111111111",
      })
    ).resolves.toEqual({ error: "Use the session controls to start your own session" });
  });

  it("updates leaderboard when score beats bests", async () => {
    const {
      saveMinigameScoreAction,
      getCurrentUser,
      getMinigameLeaderboardSnapshot,
      tx,
      revalidatePath,
    } = await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
    });

    tx.minigameLeaderboardEntry.findUnique.mockResolvedValueOnce({
      gameKey: "reaction_tap",
      userId: "11111111-1111-4111-8111-111111111111",
      allTimeScore: 20,
      bestScore: 8,
      plays: 3,
      updatedAt: new Date("2026-03-20T12:00:00.000Z"),
    });

    const leaderboard = {
      gameKey: "reaction_tap",
      entries: [],
    };
    getMinigameLeaderboardSnapshot.mockResolvedValueOnce(leaderboard);

    await expect(saveMinigameScoreAction({ gameKey: "reaction_tap", score: 25 })).resolves.toEqual({
      success: true,
      submitted: true,
      leaderboard,
      message: undefined,
    });

    expect(tx.minigameLeaderboardEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          allTimeScore: 25,
          bestScore: 25,
          plays: { increment: 1 },
        }),
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/timer");
  });

  it("stores minigame score when creating a new leaderboard entry", async () => {
    const {
      saveMinigameScoreAction,
      getCurrentUser,
      getMinigameLeaderboardSnapshot,
      tx,
      revalidatePath,
    } = await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
    });
    tx.minigameLeaderboardEntry.findUnique.mockResolvedValueOnce(null);

    const leaderboard = {
      gameKey: "reaction_tap",
      entries: [],
    };
    getMinigameLeaderboardSnapshot.mockResolvedValueOnce(leaderboard);

    await expect(saveMinigameScoreAction({ gameKey: "reaction_tap", score: 7 })).resolves.toEqual({
      success: true,
      submitted: true,
      leaderboard,
      message: undefined,
    });

    expect(tx.minigameLeaderboardEntry.create).toHaveBeenCalledWith({
      data: {
        gameKey: "reaction_tap",
        userId: "11111111-1111-4111-8111-111111111111",
        allTimeScore: 7,
        bestScore: 7,
        plays: 1,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/timer");
  });

  it("does not submit minigame score unless it beats daily or all-time best", async () => {
    const { saveMinigameScoreAction, getCurrentUser, getMinigameLeaderboardSnapshot, tx } =
      await loadPomodoroActionsModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
    });

    tx.minigameLeaderboardEntry.findUnique.mockResolvedValueOnce({
      gameKey: "reaction_tap",
      userId: "11111111-1111-4111-8111-111111111111",
      allTimeScore: 20,
      bestScore: 8,
      plays: 3,
      updatedAt: new Date(),
    });

    const leaderboard = {
      gameKey: "reaction_tap",
      entries: [],
    };
    getMinigameLeaderboardSnapshot.mockResolvedValueOnce(leaderboard);

    await expect(saveMinigameScoreAction({ gameKey: "reaction_tap", score: 7 })).resolves.toEqual({
      success: true,
      submitted: false,
      leaderboard,
      message: "Score did not beat your daily or all-time best",
    });

    expect(tx.minigameLeaderboardEntry.update).not.toHaveBeenCalled();
  });
});
