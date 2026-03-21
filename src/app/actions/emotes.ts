"use server";

import { z } from "zod";
import {
  EMOTE_CONFIG,
  type EmoteId,
  type WorkspaceEmoteBroadcastPayload,
} from "@/lib/online-presence";
import { getCurrentUser } from "@/lib/get-current-user";

const COOLDOWN_SECONDS = 5;
const WINDOW_SECONDS = 60;
const WINDOW_LIMIT = 10;

const COOLDOWN_MS = COOLDOWN_SECONDS * 1000;
const WINDOW_MS = WINDOW_SECONDS * 1000;

const cooldownStore = new Map<string, number>();
const windowStore = new Map<string, number[]>();

const sendEmoteSchema = z.object({
  emoteId: z.enum(Object.keys(EMOTE_CONFIG) as [EmoteId, ...EmoteId[]]),
});

export type EmoteActionResult =
  | { error: string; retryAfterSeconds?: number }
  | { success: true; payload: WorkspaceEmoteBroadcastPayload };

function pruneWindowStore(userId: string, nowMs: number): number[] {
  const recent = (windowStore.get(userId) ?? []).filter((t) => nowMs - t < WINDOW_MS);
  if (recent.length === 0) {
    windowStore.delete(userId);
  } else {
    windowStore.set(userId, recent);
  }
  return recent;
}

export async function sendEmoteAction(values: { emoteId: EmoteId }): Promise<EmoteActionResult> {
  const parsed = sendEmoteSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Invalid emote." };
  }

  const actor = await getCurrentUser();
  if (!actor) {
    return { error: "Not authenticated." };
  }

  const now = Date.now();

  const lastEmoteAt = cooldownStore.get(actor.id) ?? 0;
  const elapsedSinceLast = now - lastEmoteAt;
  if (elapsedSinceLast < COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil((COOLDOWN_MS - elapsedSinceLast) / 1000);
    return {
      error: `Wait ${retryAfterSeconds}s before emoting again.`,
      retryAfterSeconds,
    };
  }

  const recentTimestamps = pruneWindowStore(actor.id, now);
  if (recentTimestamps.length >= WINDOW_LIMIT) {
    const oldestTimestamp = recentTimestamps[0] ?? now;
    const retryAfterSeconds = Math.ceil((oldestTimestamp + WINDOW_MS - now) / 1000);
    return {
      error: `You're emoting too fast. Try again in ${retryAfterSeconds}s.`,
      retryAfterSeconds,
    };
  }

  cooldownStore.set(actor.id, now);
  windowStore.set(actor.id, [...recentTimestamps, now]);

  const fromName = actor.name?.trim() ? actor.name : actor.email;

  return {
    success: true,
    payload: {
      emoteId: parsed.data.emoteId,
      fromUserId: actor.id,
      fromName,
      fromAvatarUrl: actor.avatarUrl,
      createdAt: new Date().toISOString(),
    },
  };
}
