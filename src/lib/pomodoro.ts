import { prisma } from "@/lib/prisma";

export type PomodoroDailyStat = {
  dateKey: string;
  label: string;
  count: number;
};

type UserSummary = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

export const DEFAULT_MINIGAME_KEY = "reaction_tap";
export const MINIGAME_GAME_KEYS = [
  "reaction_tap",
  "dino_runner",
  "brick_breaker",
  "flappy_arrow",
  "typing_scribe",
  "circle_draw",
  "cursor_survivor",
] as const;

export type MinigameGameKey = (typeof MINIGAME_GAME_KEYS)[number];

export type PomodoroStatsSnapshot = {
  todayCount: number;
  weekCount: number;
  totalCount: number;
  last7Days: PomodoroDailyStat[];
};

export type FocusSessionMemberSnapshot = {
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  joinedAt: string;
  isOwner: boolean;
};

export type FocusSessionTimerSnapshot = {
  phase: "work" | "shortBreak" | "longBreak";
  secondsLeft: number;
  sessionCount: number;
  isRunning: boolean;
  startedAt: string | null;
  completionCount: number;
  lastCompletedPhase: "work" | "shortBreak" | "longBreak" | null;
  lastCompletedDurationMin: number | null;
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  focusColor: string | null;
  breakColor: string | null;
  interpolatePhaseColors: boolean;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
};

export type FocusSessionDetailSnapshot = {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  members: FocusSessionMemberSnapshot[];
  sharedTimer: FocusSessionTimerSnapshot | null;
};

export type FocusSessionListItemSnapshot = {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  memberCount: number;
};

export type FocusSessionRequestSnapshot = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  targetUserId: string;
  targetName: string;
  targetEmail: string;
  createdAt: string;
};

export type PomodoroCollaborationSnapshot = {
  currentSession: FocusSessionDetailSnapshot | null;
  activeSessions: FocusSessionListItemSnapshot[];
  inviteCandidates: UserSummary[];
  outgoingRequests: FocusSessionRequestSnapshot[];
  incomingRequests: FocusSessionRequestSnapshot[];
};

export type MinigameLeaderboardEntrySnapshot = {
  rank: number;
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  allTimeScore: number;
  bestScore: number;
  plays: number;
  isCurrentUser: boolean;
};

export type MinigameLeaderboardSnapshot = {
  gameKey: string;
  entries: MinigameLeaderboardEntrySnapshot[];
};

export type MinigameChampionSnapshot = {
  gameKey: string;
  championName: string;
  championUserId: string | null;
  championScore: number;
};

function startOfDay(value: Date): Date {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfWeek(value: Date): Date {
  const result = startOfDay(value);
  const day = result.getDay();
  const daysSinceMonday = (day + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday);
  return result;
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function toDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDayLabel(value: Date): string {
  return value.toLocaleDateString("en-US", { weekday: "short" });
}

function getDisplayName(user: Pick<UserSummary, "name" | "email">): string {
  return user.name?.trim() || user.email;
}

function sortUsersByDisplayName<T extends Pick<UserSummary, "name" | "email">>(users: T[]): T[] {
  return [...users].sort((left, right) => {
    return getDisplayName(left).localeCompare(getDisplayName(right), undefined, {
      sensitivity: "base",
    });
  });
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  const rounded = Math.round(value);
  return Math.max(min, Math.min(max, rounded));
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  return normalized.toLowerCase();
}

function parseSessionTimerState(raw: unknown): FocusSessionTimerSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = raw as Record<string, unknown>;

  const phaseRaw = value.phase;
  const phase =
    phaseRaw === "work" || phaseRaw === "shortBreak" || phaseRaw === "longBreak"
      ? phaseRaw
      : "work";

  const baseSecondsLeft = clampInt(value.secondsLeft, 0, 10800, 1500);
  const sessionCount = clampInt(value.sessionCount, 0, 10000, 0);
  const isRunning = value.isRunning === true;
  const completionCount = clampInt(value.completionCount, 0, 1000000, 0);
  const lastCompletedPhaseRaw = value.lastCompletedPhase;
  const lastCompletedPhase =
    lastCompletedPhaseRaw === "work" ||
    lastCompletedPhaseRaw === "shortBreak" ||
    lastCompletedPhaseRaw === "longBreak"
      ? lastCompletedPhaseRaw
      : null;
  const lastCompletedDurationMinRaw = value.lastCompletedDurationMin;
  const lastCompletedDurationMin =
    typeof lastCompletedDurationMinRaw === "number" && Number.isFinite(lastCompletedDurationMinRaw)
      ? clampInt(lastCompletedDurationMinRaw, 1, 180, 1)
      : null;
  const startedAt =
    typeof value.startedAt === "string" && !Number.isNaN(Date.parse(value.startedAt))
      ? value.startedAt
      : null;

  const workMinutes = clampInt(value.workMinutes, 1, 90, 25);
  const shortBreakMinutes = clampInt(value.shortBreakMinutes, 1, 30, 5);
  const longBreakMinutes = clampInt(value.longBreakMinutes, 5, 60, 15);
  const focusColor = normalizeHexColor(value.focusColor);
  const breakColor = normalizeHexColor(value.breakColor);
  const interpolatePhaseColors = value.interpolatePhaseColors !== false;
  const autoStartBreaks = value.autoStartBreaks === true;
  const autoStartFocus = value.autoStartFocus === true;

  return {
    phase,
    secondsLeft: baseSecondsLeft,
    sessionCount,
    isRunning,
    startedAt,
    completionCount,
    lastCompletedPhase,
    lastCompletedDurationMin,
    workMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    focusColor,
    breakColor,
    interpolatePhaseColors,
    autoStartBreaks,
    autoStartFocus,
  };
}

async function ensureSingleActiveMembership(userId: string) {
  const activeMemberships = await prisma.pomodoroFocusSessionMember.findMany({
    where: {
      userId,
      isActive: true,
      session: {
        isActive: true,
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
    select: {
      sessionId: true,
    },
  });

  if (activeMemberships.length <= 1) {
    return;
  }

  const staleSessionIds = activeMemberships.slice(1).map((entry) => entry.sessionId);

  await prisma.pomodoroFocusSessionMember.updateMany({
    where: {
      userId,
      isActive: true,
      sessionId: {
        in: staleSessionIds,
      },
    },
    data: {
      isActive: false,
      leftAt: new Date(),
    },
  });
}

function mapSessionDetail(
  session: {
    id: string;
    title: string;
    timerState: unknown;
    ownerId: string;
    owner: UserSummary;
    members: Array<{
      userId: string;
      joinedAt: Date;
      user: UserSummary;
    }>;
  },
  currentUserId: string
): FocusSessionDetailSnapshot {
  return {
    id: session.id,
    title: session.title,
    sharedTimer: parseSessionTimerState(session.timerState),
    ownerId: session.ownerId,
    ownerName: getDisplayName(session.owner),
    members: sortUsersByDisplayName(
      session.members.map((member) => ({
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        avatarUrl: member.user.avatarUrl,
        joinedAt: member.joinedAt.toISOString(),
        isOwner: member.userId === session.ownerId,
      }))
    ).sort((left, right) => {
      if (left.userId === currentUserId) {
        return -1;
      }

      if (right.userId === currentUserId) {
        return 1;
      }

      if (left.isOwner && !right.isOwner) {
        return -1;
      }

      if (!left.isOwner && right.isOwner) {
        return 1;
      }

      return getDisplayName(left).localeCompare(getDisplayName(right), undefined, {
        sensitivity: "base",
      });
    }),
  };
}

export async function getPomodoroStatsSnapshot(
  userId: string,
  now = new Date()
): Promise<PomodoroStatsSnapshot> {
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const sevenDayStart = addDays(todayStart, -6);

  const [todayCount, weekCount, totalCount, sessionsForChart] = await Promise.all([
    prisma.pomodoroSession.count({
      where: {
        userId,
        completedAt: {
          gte: todayStart,
        },
      },
    }),
    prisma.pomodoroSession.count({
      where: {
        userId,
        completedAt: {
          gte: weekStart,
        },
      },
    }),
    prisma.pomodoroSession.count({
      where: {
        userId,
      },
    }),
    prisma.pomodoroSession.findMany({
      where: {
        userId,
        completedAt: {
          gte: sevenDayStart,
        },
      },
      select: {
        completedAt: true,
      },
    }),
  ]);

  const countsByDay = new Map<string, number>();

  for (const session of sessionsForChart) {
    const key = toDateKey(session.completedAt);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  }

  const last7Days: PomodoroDailyStat[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(sevenDayStart, offset);
    const key = toDateKey(date);
    last7Days.push({
      dateKey: key,
      label: toDayLabel(date),
      count: countsByDay.get(key) ?? 0,
    });
  }

  return {
    todayCount,
    weekCount,
    totalCount,
    last7Days,
  };
}

export async function getPomodoroCollaborationSnapshot(
  userId: string
): Promise<PomodoroCollaborationSnapshot> {
  await ensureSingleActiveMembership(userId);

  const [activeMembership, activeSessions, incomingRequestRows] = await Promise.all([
    prisma.pomodoroFocusSessionMember.findFirst({
      where: {
        userId,
        isActive: true,
        session: {
          isActive: true,
        },
      },
      orderBy: {
        joinedAt: "desc",
      },
      include: {
        session: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
            members: {
              where: {
                isActive: true,
              },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.pomodoroFocusSession.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        members: {
          where: {
            isActive: true,
          },
          select: {
            userId: true,
          },
        },
      },
      take: 20,
    }),
    prisma.pomodoroFocusSessionRequest.findMany({
      where: {
        status: "PENDING",
        targetUserId: userId,
        session: {
          isActive: true,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        session: {
          select: {
            id: true,
            title: true,
          },
        },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        targetUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      take: 20,
    }),
  ]);

  const currentSession = activeMembership
    ? mapSessionDetail(
        {
          id: activeMembership.session.id,
          title: activeMembership.session.title,
          timerState: activeMembership.session.timerState,
          ownerId: activeMembership.session.ownerId,
          owner: activeMembership.session.owner,
          members: activeMembership.session.members,
        },
        userId
      )
    : null;

  const activeSessionItems: FocusSessionListItemSnapshot[] = activeSessions.map((session) => ({
    id: session.id,
    title: session.title,
    ownerId: session.ownerId,
    ownerName: getDisplayName(session.owner),
    memberCount: session.members.length,
  }));

  let inviteCandidates: UserSummary[] = [];
  let outgoingRequests: FocusSessionRequestSnapshot[] = [];
  if (currentSession && currentSession.ownerId === userId) {
    const memberIds = new Set(currentSession.members.map((member) => member.userId));
    const [users, outgoingRequestRows] = await Promise.all([
      prisma.user.findMany({
        where: {
          id: {
            notIn: Array.from(memberIds),
          },
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
        take: 100,
      }),
      prisma.pomodoroFocusSessionRequest.findMany({
        where: {
          status: "PENDING",
          sessionId: currentSession.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          session: {
            select: {
              id: true,
              title: true,
            },
          },
          requester: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          targetUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        take: 20,
      }),
    ]);

    const pendingTargetIds = new Set(outgoingRequestRows.map((request) => request.targetUserId));
    inviteCandidates = sortUsersByDisplayName(users).filter(
      (user) => user.id !== userId && !pendingTargetIds.has(user.id)
    );

    outgoingRequests = outgoingRequestRows.map((request) => ({
      id: request.id,
      sessionId: request.session.id,
      sessionTitle: request.session.title,
      requesterId: request.requester.id,
      requesterName: getDisplayName(request.requester),
      requesterEmail: request.requester.email,
      targetUserId: request.targetUser.id,
      targetName: getDisplayName(request.targetUser),
      targetEmail: request.targetUser.email,
      createdAt: request.createdAt.toISOString(),
    }));
  }

  const incomingRequests: FocusSessionRequestSnapshot[] = incomingRequestRows.map((request) => ({
    id: request.id,
    sessionId: request.session.id,
    sessionTitle: request.session.title,
    requesterId: request.requester.id,
    requesterName: getDisplayName(request.requester),
    requesterEmail: request.requester.email,
    targetUserId: request.targetUser.id,
    targetName: getDisplayName(request.targetUser),
    targetEmail: request.targetUser.email,
    createdAt: request.createdAt.toISOString(),
  }));

  return {
    currentSession,
    activeSessions: activeSessionItems,
    inviteCandidates,
    outgoingRequests,
    incomingRequests,
  };
}

export async function getMinigameLeaderboardSnapshot(
  gameKey: string,
  currentUserId: string,
  limit = 10
): Promise<MinigameLeaderboardSnapshot> {
  const rows = await prisma.minigameLeaderboardEntry.findMany({
    where: {
      gameKey,
    },
    orderBy: [{ allTimeScore: "desc" }, { bestScore: "desc" }, { updatedAt: "asc" }],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
    take: limit,
  });

  const entries: MinigameLeaderboardEntrySnapshot[] = rows.map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    avatarUrl: row.user.avatarUrl,
    allTimeScore: row.allTimeScore,
    bestScore: row.bestScore,
    plays: row.plays,
    isCurrentUser: row.userId === currentUserId,
  }));

  return {
    gameKey,
    entries,
  };
}

export async function getMinigameChampionsSnapshot(
  gameKeys: readonly string[]
): Promise<MinigameChampionSnapshot[]> {
  const champions = await Promise.all(
    gameKeys.map(async (gameKey) => {
      const row = await prisma.minigameLeaderboardEntry.findFirst({
        where: {
          gameKey,
        },
        orderBy: [{ allTimeScore: "desc" }, { updatedAt: "asc" }],
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!row) {
        return {
          gameKey,
          championName: "No champion yet",
          championUserId: null,
          championScore: 0,
        } satisfies MinigameChampionSnapshot;
      }

      return {
        gameKey,
        championName: getDisplayName(row.user),
        championUserId: row.userId,
        championScore: row.allTimeScore,
      } satisfies MinigameChampionSnapshot;
    })
  );

  return champions;
}
