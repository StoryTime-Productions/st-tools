"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { WorkspacePokeBroadcastPayload } from "@/lib/online-presence";
import { getCurrentUser } from "@/lib/get-current-user";
import { prisma } from "@/lib/prisma";

const PER_TARGET_COOLDOWN_SECONDS = 5;
const PER_SENDER_WINDOW_SECONDS = 60;
const PER_SENDER_WINDOW_LIMIT = 5;

const PER_TARGET_COOLDOWN_MS = PER_TARGET_COOLDOWN_SECONDS * 1000;
const PER_SENDER_WINDOW_MS = PER_SENDER_WINDOW_SECONDS * 1000;

const sendPokeSchema = z.object({
  targetUserId: z.string().uuid(),
});

export type PokeActionResult =
  | { error: string; retryAfterSeconds?: number }
  | { success: true; payload: WorkspacePokeBroadcastPayload };

const senderWindowStore = new Map<string, number[]>();
const pairCooldownStore = new Map<string, number>();

function pairKey(fromUserId: string, toUserId: string): string {
  return `${fromUserId}:${toUserId}`;
}

function getRecentSenderTimestamps(fromUserId: string, nowMs: number): number[] {
  const recent = (senderWindowStore.get(fromUserId) ?? []).filter(
    (timestamp) => nowMs - timestamp < PER_SENDER_WINDOW_MS
  );

  if (recent.length === 0) {
    senderWindowStore.delete(fromUserId);
  } else {
    senderWindowStore.set(fromUserId, recent);
  }

  return recent;
}

function pruneRateLimitState(nowMs: number) {
  for (const fromUserId of senderWindowStore.keys()) {
    getRecentSenderTimestamps(fromUserId, nowMs);
  }

  for (const [key, timestamp] of pairCooldownStore.entries()) {
    if (nowMs - timestamp >= PER_TARGET_COOLDOWN_MS) {
      pairCooldownStore.delete(key);
    }
  }
}

function getPairRetryAfterSeconds(
  fromUserId: string,
  toUserId: string,
  nowMs: number
): number | null {
  const lastPokeTimestamp = pairCooldownStore.get(pairKey(fromUserId, toUserId));
  if (!lastPokeTimestamp) {
    return null;
  }

  const elapsedMs = nowMs - lastPokeTimestamp;
  if (elapsedMs >= PER_TARGET_COOLDOWN_MS) {
    pairCooldownStore.delete(pairKey(fromUserId, toUserId));
    return null;
  }

  return Math.max(1, Math.ceil((PER_TARGET_COOLDOWN_MS - elapsedMs) / 1000));
}

function getSenderRetryAfterSeconds(fromUserId: string, nowMs: number): number | null {
  const recentTimestamps = getRecentSenderTimestamps(fromUserId, nowMs);
  if (recentTimestamps.length < PER_SENDER_WINDOW_LIMIT) {
    return null;
  }

  const oldestTimestamp = recentTimestamps[0];
  return Math.max(1, Math.ceil((oldestTimestamp + PER_SENDER_WINDOW_MS - nowMs) / 1000));
}

function recordPoke(fromUserId: string, toUserId: string, nowMs: number) {
  const recentTimestamps = getRecentSenderTimestamps(fromUserId, nowMs);
  recentTimestamps.push(nowMs);
  senderWindowStore.set(fromUserId, recentTimestamps);
  pairCooldownStore.set(pairKey(fromUserId, toUserId), nowMs);
}

export async function sendPokeAction(values: { targetUserId: string }): Promise<PokeActionResult> {
  const parsed = sendPokeSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Invalid poke request." };
  }

  const actor = await getCurrentUser();
  if (!actor) {
    return { error: "Not authenticated." };
  }

  const { targetUserId } = parsed.data;
  if (targetUserId === actor.id) {
    return { error: "You cannot poke yourself." };
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!targetUser) {
    return { error: "That user is no longer available." };
  }

  const now = new Date();
  const nowMs = now.getTime();

  pruneRateLimitState(nowMs);

  const pairRetryAfterSeconds = getPairRetryAfterSeconds(actor.id, targetUserId, nowMs);
  if (pairRetryAfterSeconds) {
    return {
      error: `You can poke this user again in ${pairRetryAfterSeconds}s.`,
      retryAfterSeconds: pairRetryAfterSeconds,
    };
  }

  const senderRetryAfterSeconds = getSenderRetryAfterSeconds(actor.id, nowMs);
  if (senderRetryAfterSeconds) {
    return {
      error: `You're poking too fast. Try again in ${senderRetryAfterSeconds}s.`,
      retryAfterSeconds: senderRetryAfterSeconds,
    };
  }

  recordPoke(actor.id, targetUserId, nowMs);

  const fromName = actor.name?.trim() ? actor.name : actor.email;

  return {
    success: true,
    payload: {
      pokeId: randomUUID(),
      fromUserId: actor.id,
      fromName,
      fromAvatarUrl: actor.avatarUrl,
      toUserId: targetUserId,
      createdAt: now.toISOString(),
    },
  };
}
