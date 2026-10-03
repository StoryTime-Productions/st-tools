import { headers } from "next/headers";
import { editMessage, renameThread, startThread } from "@/lib/discord";
import { announcementMessage, truncate } from "@/lib/discord-messages";
import { prisma } from "@/lib/prisma";

const THREAD_NAME_MAX = 100;

export async function siteUrl() {
  return (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
}

async function hangoutUrl(hangoutId: string) {
  return `${await siteUrl()}/hub/hangouts/${hangoutId}`;
}

const ANNOUNCE_SELECT = {
  title: true,
  description: true,
  coverImageUrl: true,
  discordThreadUrl: true,
  discordThreadId: true,
  discordMessageId: true,
  availabilityDates: true,
  availabilityDeadline: true,
  startSlot: true,
  idea: { select: { proposerName: true } },
} as const;

type AnnounceRow = {
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  availabilityDates: string[];
  availabilityDeadline: Date | null;
  idea: { proposerName: string } | null;
};

function announcementFor(
  hangoutId: string,
  hangout: AnnounceRow,
  url: string,
  counts: { going: number; maybe: number } = { going: 0, maybe: 0 }
) {
  return announcementMessage({
    hangoutId,
    title: hangout.title,
    description: hangout.description,
    url,
    availabilityUrl: url,
    proposedBy: hangout.idea?.proposerName,
    deadline: hangout.availabilityDeadline,
    dates: hangout.availabilityDates,
    coverUrl: hangout.coverImageUrl,
    ...counts,
  });
}

/** "<title>" before a start time is locked, "<title> · Oct 3" after (M1). */
export function threadName(title: string, startSlot: string | null) {
  if (!startSlot) return truncate(title, THREAD_NAME_MAX);
  const day = new Date(`${startSlot.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const suffix = ` · ${day}`;
  return `${truncate(title, THREAD_NAME_MAX - suffix.length)}${suffix}`;
}

/**
 * Posts the M1 announcement as a thread opener and stores the ids. Best effort: any failure is
 * logged and swallowed. Skipped when no channel is configured or the hangout already has a thread
 * (admin pasted one, or it was announced before).
 */
export async function announceHangout(hangoutId: string) {
  try {
    const channelId = process.env.DISCORD_HANGOUTS_CHANNEL_ID;
    if (!channelId) return;

    const hangout = await prisma.hangout.findUnique({
      where: { id: hangoutId },
      select: ANNOUNCE_SELECT,
    });
    if (!hangout || hangout.discordThreadId || hangout.discordThreadUrl) return;

    const url = await hangoutUrl(hangoutId);
    const started = await startThread(
      channelId,
      threadName(hangout.title, hangout.startSlot),
      announcementFor(hangoutId, hangout, url)
    );
    if (!started) return;

    const guildId = process.env.DISCORD_GUILD_ID;
    await prisma.hangout.update({
      where: { id: hangoutId },
      data: {
        discordThreadId: started.threadId,
        discordMessageId: started.messageId,
        ...(guildId
          ? { discordThreadUrl: `https://discord.com/channels/${guildId}/${started.threadId}` }
          : {}),
      },
    });
  } catch (error) {
    console.error("Hangout announcement failed", error);
  }
}

/**
 * Re-renders the M1 opener in place with the live Going / Maybe counts. Best effort; returns
 * whether Discord accepted the edit (false when never announced or no channel configured).
 */
export async function refreshAnnouncement(hangoutId: string) {
  try {
    const channelId = process.env.DISCORD_HANGOUTS_CHANNEL_ID;
    if (!channelId) return false;
    const hangout = await prisma.hangout.findUnique({
      where: { id: hangoutId },
      select: ANNOUNCE_SELECT,
    });
    if (!hangout?.discordMessageId) return false;

    const [going, maybe] = await Promise.all([
      prisma.hangoutAttendee.count({ where: { hangoutId, status: "GOING" } }),
      prisma.hangoutAttendee.count({ where: { hangoutId, status: "MAYBE" } }),
    ]);
    return await editMessage(
      channelId,
      hangout.discordMessageId,
      announcementFor(hangoutId, hangout, await hangoutUrl(hangoutId), { going, maybe })
    );
  } catch (error) {
    console.error("Hangout announcement refresh failed", error);
    return false;
  }
}

/** Renames the hangout's thread once a start time is locked in. Best effort. */
export async function renameHangoutThread(hangoutId: string) {
  try {
    const hangout = await prisma.hangout.findUnique({
      where: { id: hangoutId },
      select: { title: true, startSlot: true, discordThreadId: true },
    });
    if (!hangout?.discordThreadId) return;
    await renameThread(hangout.discordThreadId, threadName(hangout.title, hangout.startSlot));
  } catch (error) {
    console.error("Hangout thread rename failed", error);
  }
}
