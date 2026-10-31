import { z } from "zod";
import { prisma } from "@/lib/prisma";

const id = z.string().regex(/^\d{1,32}$/);
const name = z.string().trim().min(1).max(100);
const at = z.coerce.date().optional();
const avatarUrl = z.string().url().max(300).nullish();

export const voiceEventSchema = z.discriminatedUnion("type", [
  // A join always ends any session still open for that person, so a move between voice channels
  // splits the session instead of double counting.
  z.object({
    type: z.literal("join"),
    discordId: id,
    name,
    channelId: id,
    channelName: name,
    avatarUrl,
    at,
  }),
  z.object({ type: z.literal("leave"), discordId: id, at }),
  // The full list of people in counted voice channels right now. Used on bot start to close
  // sessions that ended while it was down and open the ones already in progress.
  z.object({
    type: z.literal("snapshot"),
    members: z
      .array(z.object({ discordId: id, name, channelId: id, channelName: name, avatarUrl }))
      .max(200),
    at,
  }),
]);

export type VoiceEvent = z.infer<typeof voiceEventSchema>;

/**
 * Tells the dashboard (over Supabase Realtime) that Discord stats changed. The ingest has already
 * succeeded by now, so a failure here is logged and never fails the bot's request.
 */
export async function touchStatsPulse() {
  try {
    await prisma.discordStatsPulse.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: { updatedAt: new Date() },
    });
  } catch (error) {
    console.error("Could not touch the Discord stats pulse", error);
  }
}

export async function applyVoiceEvent(event: VoiceEvent, now: Date = new Date()) {
  const result = await applyVoiceChange(event, now);
  if (result.closed + result.opened > 0) await touchStatsPulse();
  return result;
}

async function applyVoiceChange(event: VoiceEvent, now: Date) {
  const when = event.at ?? now;

  if (event.type === "leave") {
    const closed = await prisma.discordVoiceSession.updateMany({
      where: { discordId: event.discordId, leftAt: null },
      data: { leftAt: when },
    });
    return { closed: closed.count, opened: 0 };
  }

  if (event.type === "join") {
    const closed = await prisma.discordVoiceSession.updateMany({
      where: { discordId: event.discordId, leftAt: null },
      data: { leftAt: when },
    });
    await prisma.discordVoiceSession.create({
      data: {
        discordId: event.discordId,
        name: event.name,
        channelId: event.channelId,
        channelName: event.channelName,
        avatarUrl: event.avatarUrl ?? null,
        joinedAt: when,
      },
    });
    return { closed: closed.count, opened: 1 };
  }

  const open = await prisma.discordVoiceSession.findMany({
    where: { leftAt: null },
    select: { id: true, discordId: true, channelId: true },
  });
  const wanted = new Map(event.members.map((member) => [member.discordId, member]));
  const keep = new Set<string>();
  const stale: string[] = [];
  for (const session of open) {
    const member = wanted.get(session.discordId);
    if (member && member.channelId === session.channelId && !keep.has(session.discordId)) {
      keep.add(session.discordId);
    } else {
      stale.push(session.id);
    }
  }
  if (stale.length > 0) {
    await prisma.discordVoiceSession.updateMany({
      where: { id: { in: stale } },
      data: { leftAt: when },
    });
  }
  const toOpen = event.members.filter((member) => !keep.has(member.discordId));
  if (toOpen.length > 0) {
    await prisma.discordVoiceSession.createMany({
      data: toOpen.map((member) => ({
        discordId: member.discordId,
        name: member.name,
        channelId: member.channelId,
        channelName: member.channelName,
        avatarUrl: member.avatarUrl ?? null,
        joinedAt: when,
      })),
    });
  }
  return { closed: stale.length, opened: toOpen.length };
}

export const messagesSchema = z.object({
  // "add" increments the day's count (live counting); "set" replaces it (backfill reruns).
  mode: z.enum(["add", "set"]).default("add"),
  entries: z
    .array(
      z.object({
        discordId: id,
        name,
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        count: z.number().int().min(1).max(100000),
        avatarUrl,
      })
    )
    .min(1)
    .max(500),
});

export async function recordMessages(input: z.infer<typeof messagesSchema>) {
  await prisma.$transaction(
    input.entries.map((entry) =>
      prisma.discordMessageDay.upsert({
        where: { discordId_day: { discordId: entry.discordId, day: entry.day } },
        create: {
          discordId: entry.discordId,
          name: entry.name,
          day: entry.day,
          count: entry.count,
          avatarUrl: entry.avatarUrl ?? null,
        },
        update: {
          name: entry.name,
          ...(entry.avatarUrl ? { avatarUrl: entry.avatarUrl } : {}),
          count: input.mode === "add" ? { increment: entry.count } : entry.count,
        },
      })
    )
  );
  await touchStatsPulse();
  return input.entries.length;
}

export const wordleSchema = z.object({
  streak: z.number().int().min(0).max(100000),
  postedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function recordWordleStreak(input: z.infer<typeof wordleSchema>) {
  await prisma.discordWordleStreak.upsert({
    where: { id: 1 },
    create: { id: 1, streak: input.streak, postedOn: input.postedOn },
    update: { streak: input.streak, postedOn: input.postedOn },
  });
  await touchStatsPulse();
}
