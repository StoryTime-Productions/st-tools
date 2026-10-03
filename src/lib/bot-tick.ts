import { HangoutStatus, Prisma } from "@prisma/client";
import { postToChannel, sendDiscordDm } from "@/lib/discord";
import {
  changeMessage,
  nudgeMessage,
  paymentReminderMessage,
  type ChangeArea,
} from "@/lib/discord-messages";
import { hangoutEnd } from "@/lib/lifecycle";
import { prisma } from "@/lib/prisma";

const HOUR = 3_600_000;
export const NUDGE_HOURS = [6, 48] as const;
export const DEBOUNCE_MS = 5 * 60_000;
export const REMINDER_EVERY_MS = 3 * 24 * HOUR;
export const MAX_REMINDERS = 3;
const AREAS: ChangeArea[] = ["Itinerary", "Costs", "Carpools"];

const hangoutUrl = (origin: string, hangoutId: string) => `${origin}/hub/hangouts/${hangoutId}`;

/** Inserts the idempotency row; false when it already exists (another tick, or an earlier run). */
async function claim(hangoutId: string, kind: string, key: string) {
  try {
    await prisma.hangoutNotification.create({ data: { hangoutId, kind, key } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
}

/**
 * M2: once per threshold (48h, 6h before the deadline), only while someone linked has not
 * answered. A deadline set inside a threshold skips the larger ones so members get one nudge.
 */
export async function sendNudges(origin: string, now = new Date()) {
  const hangouts = await prisma.hangout.findMany({
    where: {
      status: HangoutStatus.COLLECTING,
      discordThreadId: { not: null },
      availabilityDeadline: { gt: now, lte: new Date(now.getTime() + 48 * HOUR) },
    },
    select: { id: true, title: true, discordThreadId: true, availabilityDeadline: true },
  });

  let sent = 0;
  for (const hangout of hangouts) {
    const deadline = hangout.availabilityDeadline!;
    const hoursLeft = (deadline.getTime() - now.getTime()) / HOUR;
    const [threshold, ...larger] = NUDGE_HOURS.filter((hours) => hoursLeft <= hours);
    if (threshold === undefined) continue;

    const waiting = await prisma.user.findMany({
      where: { discordId: { not: null }, hangoutAvailability: { none: { hangoutId: hangout.id } } },
      select: { name: true, email: true },
      orderBy: { name: "asc" },
    });
    if (waiting.length === 0) continue;

    for (const hours of larger) await claim(hangout.id, "nudge", `${hours}h`);
    if (!(await claim(hangout.id, "nudge", `${threshold}h`))) continue;

    const url = `${hangoutUrl(origin, hangout.id)}#availability`;
    const posted = await postToChannel(
      hangout.discordThreadId!,
      nudgeMessage({
        hangoutTitle: hangout.title,
        availabilityUrl: url,
        deadline,
        waiting: waiting.map((user) => user.name ?? user.email.split("@")[0]),
      })
    );
    if (posted) {
      sent++;
    } else {
      await prisma.hangoutNotification.deleteMany({
        where: { hangoutId: hangout.id, kind: "nudge", key: `${threshold}h` },
      });
    }
  }
  return sent;
}

/**
 * M3: collapses each hangout's pending edits into one embed once the oldest is 5 minutes old.
 * Rows are claimed by deleting them first, so overlapping ticks cannot post twice; a failed
 * post puts them back.
 */
export async function flushUpdates(origin: string, now = new Date()) {
  const due = await prisma.hangoutPendingUpdate.findMany({
    where: { createdAt: { lte: new Date(now.getTime() - DEBOUNCE_MS) } },
    select: { hangoutId: true },
    distinct: ["hangoutId"],
  });

  let posted = 0;
  for (const { hangoutId } of due) {
    const rows = await prisma.hangoutPendingUpdate.findMany({
      where: { hangoutId },
      orderBy: { createdAt: "asc" },
    });
    const claimed = await prisma.hangoutPendingUpdate.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    if (claimed.count !== rows.length) continue;

    const hangout = await prisma.hangout.findUnique({
      where: { id: hangoutId },
      select: { title: true, status: true, discordThreadId: true },
    });
    if (!hangout?.discordThreadId || hangout.status === HangoutStatus.CANCELLED) continue;

    const changes = AREAS.flatMap((area) => {
      const lines = rows.filter((row) => row.area === area).map((r) => `${r.before} → ${r.after}`);
      return lines.length ? [{ area, lines }] : [];
    });
    const ok = await postToChannel(
      hangout.discordThreadId,
      changeMessage({
        hangoutTitle: hangout.title,
        url: hangoutUrl(origin, hangoutId),
        changes,
      })
    );
    if (ok) {
      posted++;
    } else {
      await prisma.hangoutPendingUpdate.createMany({
        data: rows.map(({ id, area, before, after, createdAt }) => ({
          id,
          hangoutId,
          area,
          before,
          after,
          createdAt,
        })),
      });
    }
  }
  return posted;
}

/**
 * M4: DM each linked payer whose share is Unpaid or Sent once the hangout has ended, every 3
 * days, three times at most. The attempt is counted before the DM, so a member with closed DMs
 * is not retried every minute.
 */
export async function sendPaymentReminders(origin: string, now = new Date()) {
  const shares = await prisma.hangoutCostShare.findMany({
    where: {
      status: { in: ["UNPAID", "SENT"] },
      remindersSent: { lt: MAX_REMINDERS },
      OR: [
        { lastReminderAt: null },
        { lastReminderAt: { lte: new Date(now.getTime() - REMINDER_EVERY_MS) } },
      ],
      user: { discordId: { not: null } },
      cost: { hangout: { status: HangoutStatus.SCHEDULED, startSlot: { not: null } } },
    },
    select: {
      costId: true,
      userId: true,
      amountCents: true,
      status: true,
      remindersSent: true,
      user: { select: { discordId: true } },
      cost: {
        select: {
          title: true,
          collectorId: true,
          collector: { select: { name: true, email: true } },
          hangout: {
            select: {
              id: true,
              title: true,
              startSlot: true,
              stops: {
                select: { durationMinutes: true, arriveBy: true },
                orderBy: { position: "asc" },
              },
            },
          },
        },
      },
    },
  });

  let sent = 0;
  for (const share of shares) {
    const { cost } = share;
    if (cost.collectorId === share.userId) continue;
    const { hangout } = cost;
    if (now < hangoutEnd(hangout.startSlot!, hangout.stops)) continue;

    const counted = await prisma.hangoutCostShare.updateMany({
      where: {
        costId: share.costId,
        userId: share.userId,
        remindersSent: share.remindersSent,
        status: { in: ["UNPAID", "SENT"] },
      },
      data: { remindersSent: { increment: 1 }, lastReminderAt: now },
    });
    if (counted.count !== 1) continue;

    const delivered = await sendDiscordDm(
      share.user.discordId!,
      paymentReminderMessage({
        hangoutTitle: hangout.title,
        item: cost.title,
        amountCents: share.amountCents,
        collector: cost.collector.name ?? cost.collector.email.split("@")[0],
        status: share.status === "SENT" ? "Sent, waiting for confirmation" : "Unpaid",
        url: `${hangoutUrl(origin, hangout.id)}#costs`,
      })
    );
    if (delivered) sent++;
  }
  return sent;
}
