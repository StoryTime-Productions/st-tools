"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/get-current-user";
import {
  DEFAULT_MINIGAME_KEY,
  getMinigameLeaderboardSnapshot,
  getPomodoroCollaborationSnapshot,
  type MinigameLeaderboardSnapshot,
  type PomodoroCollaborationSnapshot,
} from "@/lib/pomodoro";
import { prisma } from "@/lib/prisma";

export type PomodoroActionResult = { error: string } | { success: true };
export type PomodoroCollaborationActionResult =
  | { error: string }
  | { success: true; snapshot: PomodoroCollaborationSnapshot };
export type MinigameScoreActionResult =
  | { error: string }
  | {
      success: true;
      submitted: boolean;
      leaderboard: MinigameLeaderboardSnapshot;
      message?: string;
    };

const DEFAULT_FOCUS_COLOR = "#3b82f6";
const DEFAULT_BREAK_COLOR = "#f97316";

const pomodoroPreferencesSchema = z
  .object({
    workMin: z
      .number()
      .int("Work duration must be a whole number")
      .min(1, "Work duration must be at least 1 minute")
      .max(90, "Work duration must be 90 minutes or fewer"),
    shortBreakMin: z
      .number()
      .int("Short break duration must be a whole number")
      .min(1, "Short break duration must be at least 1 minute")
      .max(30, "Short break duration must be 30 minutes or fewer"),
    longBreakMin: z
      .number()
      .int("Long break duration must be a whole number")
      .min(5, "Long break duration must be at least 5 minutes")
      .max(60, "Long break duration must be 60 minutes or fewer"),
  })
  .superRefine((values, context) => {
    if (values.longBreakMin < values.shortBreakMin) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["longBreakMin"],
        message: "Long break duration should be at least the short break duration",
      });
    }
  });

const recordSessionSchema = z.object({
  durationMin: z
    .number()
    .int("Session duration must be a whole number")
    .min(1, "Session duration must be at least 1 minute")
    .max(180, "Session duration must be 180 minutes or fewer"),
  points: z
    .number()
    .int("Points must be a whole number")
    .min(1, "Points must be at least 1")
    .max(10, "Points must be 10 or fewer")
    .default(1),
});

const startSessionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Session title is required")
    .max(80, "Session title must be 80 characters or fewer")
    .optional(),
  focusColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Focus color must be a valid hex color")
    .optional(),
  breakColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Break color must be a valid hex color")
    .optional(),
  interpolatePhaseColors: z.boolean().optional(),
  autoStartBreaks: z.boolean().optional(),
  autoStartFocus: z.boolean().optional(),
});

const joinSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

const addSessionMemberSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
});

const kickSessionMemberSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
});

const respondToFocusSessionRequestSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["accept", "decline"]),
});

const syncFocusSessionTimerStateSchema = z.object({
  sessionId: z.string().uuid(),
  phase: z.enum(["work", "shortBreak", "longBreak"]),
  secondsLeft: z
    .number()
    .int("Seconds left must be a whole number")
    .min(0, "Seconds left cannot be negative")
    .max(10800, "Seconds left is too large"),
  sessionCount: z
    .number()
    .int("Session count must be a whole number")
    .min(0, "Session count cannot be negative")
    .max(10000, "Session count is too large"),
  completionCount: z
    .number()
    .int("Completion count must be a whole number")
    .min(0, "Completion count cannot be negative")
    .max(1000000, "Completion count is too large")
    .optional(),
  lastCompletedPhase: z.enum(["work", "shortBreak", "longBreak"]).nullable().optional(),
  lastCompletedDurationMin: z
    .number()
    .int("Completed duration must be a whole number")
    .min(1, "Completed duration must be at least 1 minute")
    .max(180, "Completed duration must be 180 minutes or fewer")
    .nullable()
    .optional(),
  isRunning: z.boolean(),
  workMinutes: z
    .number()
    .int("Work duration must be a whole number")
    .min(1, "Work duration must be at least 1 minute")
    .max(90, "Work duration must be 90 minutes or fewer"),
  shortBreakMinutes: z
    .number()
    .int("Short break duration must be a whole number")
    .min(1, "Short break duration must be at least 1 minute")
    .max(30, "Short break duration must be 30 minutes or fewer"),
  longBreakMinutes: z
    .number()
    .int("Long break duration must be a whole number")
    .min(5, "Long break duration must be at least 5 minutes")
    .max(60, "Long break duration must be 60 minutes or fewer"),
  focusColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Focus color must be a valid hex color")
    .optional(),
  breakColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Break color must be a valid hex color")
    .optional(),
  interpolatePhaseColors: z.boolean().optional(),
  autoStartBreaks: z.boolean().optional(),
  autoStartFocus: z.boolean().optional(),
});

const minigameScoreSchema = z.object({
  gameKey: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_:-]{1,39}$/, "Invalid game key")
    .default(DEFAULT_MINIGAME_KEY),
  score: z
    .number()
    .int("Score must be a whole number")
    .min(0, "Score cannot be negative")
    .max(10000, "Score is too large"),
});

function toDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fallbackSessionTitle(name: string | null, email: string): string {
  const displayName = name?.trim() || email;
  return `${displayName}'s focus session`;
}

async function leaveCurrentFocusSession(tx: Prisma.TransactionClient, userId: string) {
  const activeMembership = await tx.pomodoroFocusSessionMember.findFirst({
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
          members: {
            where: {
              isActive: true,
            },
            select: {
              userId: true,
              joinedAt: true,
            },
          },
        },
      },
    },
  });

  if (!activeMembership) {
    return;
  }

  const now = new Date();

  await tx.pomodoroFocusSessionMember.update({
    where: {
      sessionId_userId: {
        sessionId: activeMembership.sessionId,
        userId,
      },
    },
    data: {
      isActive: false,
      leftAt: now,
    },
  });

  const remainingMembers = activeMembership.session.members
    .filter((member) => member.userId !== userId)
    .sort((left, right) => left.joinedAt.getTime() - right.joinedAt.getTime());

  if (remainingMembers.length === 0) {
    await tx.pomodoroFocusSession.update({
      where: {
        id: activeMembership.sessionId,
      },
      data: {
        isActive: false,
      },
    });
    return;
  }

  if (activeMembership.session.ownerId === userId) {
    await tx.pomodoroFocusSession.update({
      where: {
        id: activeMembership.sessionId,
      },
      data: {
        ownerId: remainingMembers[0].userId,
      },
    });
  }
}

async function activateSessionMembership(
  tx: Prisma.TransactionClient,
  sessionId: string,
  userId: string
) {
  const now = new Date();

  await tx.pomodoroFocusSessionMember.upsert({
    where: {
      sessionId_userId: {
        sessionId,
        userId,
      },
    },
    update: {
      isActive: true,
      joinedAt: now,
      leftAt: null,
    },
    create: {
      sessionId,
      userId,
      isActive: true,
      joinedAt: now,
    },
  });
}

export async function updatePomodoroPreferencesAction(
  values: z.input<typeof pomodoroPreferencesSchema>
): Promise<PomodoroActionResult> {
  const parsed = pomodoroPreferencesSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const activeMembership = await prisma.pomodoroFocusSessionMember.findFirst({
    where: {
      userId: user.id,
      isActive: true,
      session: {
        isActive: true,
      },
    },
    select: {
      session: {
        select: {
          ownerId: true,
        },
      },
    },
  });

  if (activeMembership && activeMembership.session.ownerId !== user.id && user.role !== "ADMIN") {
    return { error: "Only the session owner can change shared timer values" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      pomodoroWorkMin: parsed.data.workMin,
      pomodoroShortBreakMin: parsed.data.shortBreakMin,
      pomodoroLongBreakMin: parsed.data.longBreakMin,
    },
  });

  revalidatePath("/settings/profile");
  revalidatePath("/timer");

  return { success: true };
}

export async function recordPomodoroSessionAction(
  values: z.input<typeof recordSessionSchema>
): Promise<PomodoroActionResult> {
  const parsed = recordSessionSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  await prisma.pomodoroSession.create({
    data: {
      userId: user.id,
      durationMin: parsed.data.durationMin,
      points: parsed.data.points,
    },
  });

  revalidatePath("/timer");
  revalidatePath("/dashboard");

  return { success: true };
}

export async function startOwnFocusSessionAction(
  values: z.input<typeof startSessionSchema> = {}
): Promise<PomodoroCollaborationActionResult> {
  const parsed = startSessionSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const title = parsed.data.title ?? fallbackSessionTitle(user.name, user.email);

  await prisma.$transaction(async (tx) => {
    await leaveCurrentFocusSession(tx, user.id);

    const session = await tx.pomodoroFocusSession.create({
      data: {
        title,
        ownerId: user.id,
        timerState: {
          phase: "work",
          secondsLeft: user.pomodoroWorkMin * 60,
          sessionCount: 0,
          completionCount: 0,
          lastCompletedPhase: null,
          lastCompletedDurationMin: null,
          isRunning: false,
          startedAt: null,
          workMinutes: user.pomodoroWorkMin,
          shortBreakMinutes: user.pomodoroShortBreakMin,
          longBreakMinutes: user.pomodoroLongBreakMin,
          focusColor: parsed.data.focusColor?.toLowerCase() ?? DEFAULT_FOCUS_COLOR,
          breakColor: parsed.data.breakColor?.toLowerCase() ?? DEFAULT_BREAK_COLOR,
          interpolatePhaseColors: parsed.data.interpolatePhaseColors !== false,
          autoStartBreaks: parsed.data.autoStartBreaks === true,
          autoStartFocus: parsed.data.autoStartFocus === true,
        },
      },
    });

    await activateSessionMembership(tx, session.id, user.id);
  });

  const snapshot = await getPomodoroCollaborationSnapshot(user.id);

  revalidatePath("/timer");

  return { success: true, snapshot };
}

export async function joinFocusSessionAction(
  values: z.input<typeof joinSessionSchema>
): Promise<PomodoroCollaborationActionResult> {
  const parsed = joinSessionSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const existingSession = await prisma.pomodoroFocusSession.findFirst({
    where: {
      id: parsed.data.sessionId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!existingSession) {
    return { error: "Session not found" };
  }

  await prisma.$transaction(async (tx) => {
    await leaveCurrentFocusSession(tx, user.id);
    await activateSessionMembership(tx, existingSession.id, user.id);
  });

  const snapshot = await getPomodoroCollaborationSnapshot(user.id);

  revalidatePath("/timer");

  return { success: true, snapshot };
}

export async function leaveFocusSessionAction(): Promise<PomodoroCollaborationActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  await prisma.$transaction(async (tx) => {
    await leaveCurrentFocusSession(tx, user.id);
  });

  const snapshot = await getPomodoroCollaborationSnapshot(user.id);

  revalidatePath("/timer");

  return { success: true, snapshot };
}

export async function refreshPomodoroCollaborationAction(): Promise<PomodoroCollaborationActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const snapshot = await getPomodoroCollaborationSnapshot(user.id);

  return { success: true, snapshot };
}

export async function syncFocusSessionTimerStateAction(
  values: z.input<typeof syncFocusSessionTimerStateSchema>
): Promise<PomodoroCollaborationActionResult> {
  const parsed = syncFocusSessionTimerStateSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const actor = await getCurrentUser();
  if (!actor) {
    return { error: "Not authenticated" };
  }

  const session = await prisma.pomodoroFocusSession.findUnique({
    where: {
      id: parsed.data.sessionId,
    },
    select: {
      id: true,
      isActive: true,
      ownerId: true,
    },
  });

  if (!session || !session.isActive) {
    return { error: "Session not found" };
  }

  if (session.ownerId !== actor.id && actor.role !== "ADMIN") {
    return { error: "Only the session owner can control the shared timer" };
  }

  await prisma.pomodoroFocusSession.update({
    where: {
      id: session.id,
    },
    data: {
      timerState: {
        phase: parsed.data.phase,
        secondsLeft: parsed.data.secondsLeft,
        sessionCount: parsed.data.sessionCount,
        completionCount: parsed.data.completionCount ?? 0,
        lastCompletedPhase: parsed.data.lastCompletedPhase ?? null,
        lastCompletedDurationMin: parsed.data.lastCompletedDurationMin ?? null,
        isRunning: parsed.data.isRunning,
        startedAt: parsed.data.isRunning ? new Date().toISOString() : null,
        workMinutes: parsed.data.workMinutes,
        shortBreakMinutes: parsed.data.shortBreakMinutes,
        longBreakMinutes: parsed.data.longBreakMinutes,
        focusColor: parsed.data.focusColor?.toLowerCase() ?? DEFAULT_FOCUS_COLOR,
        breakColor: parsed.data.breakColor?.toLowerCase() ?? DEFAULT_BREAK_COLOR,
        interpolatePhaseColors: parsed.data.interpolatePhaseColors !== false,
        autoStartBreaks: parsed.data.autoStartBreaks === true,
        autoStartFocus: parsed.data.autoStartFocus === true,
      },
    },
  });

  const snapshot = await getPomodoroCollaborationSnapshot(actor.id);

  revalidatePath("/timer");

  return { success: true, snapshot };
}

export async function kickFocusSessionMemberAction(
  values: z.input<typeof kickSessionMemberSchema>
): Promise<PomodoroCollaborationActionResult> {
  const parsed = kickSessionMemberSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const actor = await getCurrentUser();
  if (!actor) {
    return { error: "Not authenticated" };
  }

  const session = await prisma.pomodoroFocusSession.findUnique({
    where: {
      id: parsed.data.sessionId,
    },
    select: {
      id: true,
      isActive: true,
      ownerId: true,
    },
  });

  if (!session || !session.isActive) {
    return { error: "Session not found" };
  }

  if (session.ownerId !== actor.id && actor.role !== "ADMIN") {
    return { error: "Only the session owner can remove members" };
  }

  if (parsed.data.userId === session.ownerId) {
    return { error: "Session owner cannot be removed" };
  }

  const membership = await prisma.pomodoroFocusSessionMember.findUnique({
    where: {
      sessionId_userId: {
        sessionId: session.id,
        userId: parsed.data.userId,
      },
    },
    select: {
      userId: true,
      isActive: true,
    },
  });

  if (!membership || !membership.isActive) {
    return { error: "Member is not currently active in this session" };
  }

  await prisma.pomodoroFocusSessionMember.update({
    where: {
      sessionId_userId: {
        sessionId: session.id,
        userId: parsed.data.userId,
      },
    },
    data: {
      isActive: false,
      leftAt: new Date(),
    },
  });

  const snapshot = await getPomodoroCollaborationSnapshot(actor.id);

  revalidatePath("/timer");

  return { success: true, snapshot };
}

export async function addUserToFocusSessionAction(
  values: z.input<typeof addSessionMemberSchema>
): Promise<PomodoroCollaborationActionResult> {
  const parsed = addSessionMemberSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const actor = await getCurrentUser();
  if (!actor) {
    return { error: "Not authenticated" };
  }

  if (actor.id === parsed.data.userId) {
    return { error: "Use the session controls to start your own session" };
  }

  const targetUser = await prisma.user.findUnique({
    where: {
      id: parsed.data.userId,
    },
    select: {
      id: true,
    },
  });

  if (!targetUser) {
    return { error: "User not found" };
  }

  const activeTargetMembership = await prisma.pomodoroFocusSessionMember.findFirst({
    where: {
      userId: parsed.data.userId,
      isActive: true,
      session: {
        isActive: true,
      },
    },
    select: {
      sessionId: true,
    },
  });

  if (activeTargetMembership && activeTargetMembership.sessionId === parsed.data.sessionId) {
    return { error: "That user is already in this session" };
  }

  const session = await prisma.pomodoroFocusSession.findUnique({
    where: {
      id: parsed.data.sessionId,
    },
    select: {
      id: true,
      isActive: true,
      ownerId: true,
    },
  });

  if (!session || !session.isActive) {
    return { error: "Session not found" };
  }

  if (session.ownerId !== actor.id && actor.role !== "ADMIN") {
    return { error: "Only the session owner can add members" };
  }

  const existingPendingRequest = await prisma.pomodoroFocusSessionRequest.findFirst({
    where: {
      sessionId: session.id,
      targetUserId: parsed.data.userId,
      status: "PENDING",
    },
    select: {
      id: true,
    },
  });

  if (existingPendingRequest) {
    return { error: "A request is already pending for that user" };
  }

  await prisma.pomodoroFocusSessionRequest.create({
    data: {
      sessionId: session.id,
      requesterId: actor.id,
      targetUserId: parsed.data.userId,
      status: "PENDING",
    },
  });

  const snapshot = await getPomodoroCollaborationSnapshot(actor.id);

  revalidatePath("/timer");

  return { success: true, snapshot };
}

export async function respondToFocusSessionRequestAction(
  values: z.input<typeof respondToFocusSessionRequestSchema>
): Promise<PomodoroCollaborationActionResult> {
  const parsed = respondToFocusSessionRequestSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const actor = await getCurrentUser();
  if (!actor) {
    return { error: "Not authenticated" };
  }

  const request = await prisma.pomodoroFocusSessionRequest.findUnique({
    where: {
      id: parsed.data.requestId,
    },
    include: {
      session: {
        select: {
          id: true,
          isActive: true,
        },
      },
    },
  });

  if (!request || request.status !== "PENDING") {
    return { error: "Request not found" };
  }

  if (request.targetUserId !== actor.id && actor.role !== "ADMIN") {
    return { error: "You can only respond to requests sent to you" };
  }

  const now = new Date();

  if (parsed.data.decision === "decline") {
    await prisma.pomodoroFocusSessionRequest.update({
      where: {
        id: request.id,
      },
      data: {
        status: "DECLINED",
        respondedAt: now,
      },
    });

    const snapshot = await getPomodoroCollaborationSnapshot(actor.id);

    revalidatePath("/timer");

    return { success: true, snapshot };
  }

  if (!request.session.isActive) {
    await prisma.pomodoroFocusSessionRequest.update({
      where: {
        id: request.id,
      },
      data: {
        status: "CANCELLED",
        respondedAt: now,
      },
    });

    return { error: "Session is no longer active" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.pomodoroFocusSessionRequest.update({
      where: {
        id: request.id,
      },
      data: {
        status: "ACCEPTED",
        respondedAt: now,
      },
    });

    await tx.pomodoroFocusSessionRequest.updateMany({
      where: {
        targetUserId: request.targetUserId,
        status: "PENDING",
        id: {
          not: request.id,
        },
      },
      data: {
        status: "CANCELLED",
        respondedAt: now,
      },
    });

    await leaveCurrentFocusSession(tx, request.targetUserId);
    await activateSessionMembership(tx, request.sessionId, request.targetUserId);
  });

  const snapshot = await getPomodoroCollaborationSnapshot(actor.id);

  revalidatePath("/timer");

  return { success: true, snapshot };
}

export async function saveMinigameScoreAction(
  values: z.input<typeof minigameScoreSchema>
): Promise<MinigameScoreActionResult> {
  const parsed = minigameScoreSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  let submitted = false;

  await prisma.$transaction(async (tx) => {
    const todayKey = toDateKey(new Date());
    const current = await tx.minigameLeaderboardEntry.findUnique({
      where: {
        gameKey_userId: {
          gameKey: parsed.data.gameKey,
          userId: user.id,
        },
      },
    });

    if (!current) {
      submitted = true;
      await tx.minigameLeaderboardEntry.create({
        data: {
          gameKey: parsed.data.gameKey,
          userId: user.id,
          allTimeScore: parsed.data.score,
          bestScore: parsed.data.score,
          plays: 1,
        },
      });

      return;
    }

    const updatedAtKey = toDateKey(current.updatedAt);
    const currentDailyBest = updatedAtKey === todayKey ? current.bestScore : 0;
    const beatsAllTime = parsed.data.score > current.allTimeScore;
    const beatsDaily = parsed.data.score > currentDailyBest;

    if (!beatsAllTime && !beatsDaily) {
      return;
    }

    submitted = true;

    await tx.minigameLeaderboardEntry.update({
      where: {
        gameKey_userId: {
          gameKey: parsed.data.gameKey,
          userId: user.id,
        },
      },
      data: {
        allTimeScore: Math.max(current.allTimeScore, parsed.data.score),
        bestScore:
          updatedAtKey === todayKey
            ? Math.max(current.bestScore, parsed.data.score)
            : parsed.data.score,
        plays: {
          increment: 1,
        },
      },
    });
  });

  const leaderboard = await getMinigameLeaderboardSnapshot(parsed.data.gameKey, user.id);

  revalidatePath("/timer");

  return {
    success: true,
    submitted,
    leaderboard,
    message: submitted ? undefined : "Score did not beat your daily or all-time best",
  };
}
