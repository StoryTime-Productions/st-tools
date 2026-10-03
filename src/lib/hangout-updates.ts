import { torontoToUtc } from "@/lib/calendar";
import { postToChannel } from "@/lib/discord";
import { cancelMessage, lockInMessage, type ChangeArea, truncate } from "@/lib/discord-messages";
import { siteUrl } from "@/lib/hangout-discord";
import { prisma } from "@/lib/prisma";

const LINE_PART_MAX = 80;

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Queues one before -> after line for the 5-minute M3 digest. Best effort: never fails the action. */
export async function queueUpdate(
  hangoutId: string,
  area: ChangeArea,
  before: string,
  after: string
) {
  try {
    await prisma.hangoutPendingUpdate.create({
      data: {
        hangoutId,
        area,
        before: truncate(before, LINE_PART_MAX),
        after: truncate(after, LINE_PART_MAX),
      },
    });
  } catch (error) {
    console.error("Hangout update queue failed", error);
  }
}

async function threadOf(hangoutId: string) {
  const hangout = await prisma.hangout.findUnique({
    where: { id: hangoutId },
    select: {
      title: true,
      coverImageUrl: true,
      startSlot: true,
      discordThreadId: true,
      attendees: { select: { status: true } },
    },
  });
  return hangout?.discordThreadId ? hangout : null;
}

/** M3: the grey "Cancelled" embed goes out immediately (no debounce). Best effort. */
export async function announceCancel(hangoutId: string) {
  try {
    const hangout = await threadOf(hangoutId);
    if (!hangout?.discordThreadId) return;
    await postToChannel(hangout.discordThreadId, cancelMessage({ hangoutTitle: hangout.title }));
  } catch (error) {
    console.error("Hangout cancel post failed", error);
  }
}

/** M3: the "Locked in" embed (When, Going, Maybe, cover) goes out immediately. Best effort. */
export async function announceLockIn(hangoutId: string) {
  try {
    const hangout = await threadOf(hangoutId);
    if (!hangout?.discordThreadId || !hangout.startSlot) return;
    const startsAt = torontoToUtc(
      hangout.startSlot.slice(0, 10),
      Number(hangout.startSlot.slice(11, 13)) * 60 + Number(hangout.startSlot.slice(14, 16))
    );
    const count = (status: string) => hangout.attendees.filter((a) => a.status === status).length;
    await postToChannel(
      hangout.discordThreadId,
      lockInMessage({
        hangoutTitle: hangout.title,
        url: `${await siteUrl()}/hub/hangouts/${hangoutId}`,
        startsAt,
        coverUrl: hangout.coverImageUrl,
        going: count("GOING"),
        maybe: count("MAYBE"),
      })
    );
  } catch (error) {
    console.error("Hangout lock-in post failed", error);
  }
}
