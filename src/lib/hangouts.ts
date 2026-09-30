import type { AttendanceStatus, HangoutStatus } from "@prisma/client";
import type { AvailabilityResponse } from "@/lib/availability";
import { prisma } from "@/lib/prisma";

export interface HangoutSummary {
  id: string;
  title: string;
  coverImageUrl: string | null;
  status: HangoutStatus;
  startSlot: string | null;
}

export interface HangoutDetail extends HangoutSummary {
  description: string | null;
  discordThreadUrl: string | null;
  proposerName: string | null;
  availabilityDates: string[];
  windowStartHour: number;
  windowEndHour: number;
  availabilityDeadline: Date | null;
  attendees: { userId: string; name: string; status: AttendanceStatus }[];
}

export interface HangoutIdeaItem {
  id: string;
  title: string;
  details: string | null;
  createdAt: Date;
  proposerName: string;
  proposerAvatarUrl: string | null;
}

export async function getHangoutSummaries(): Promise<HangoutSummary[]> {
  return prisma.hangout.findMany({
    select: { id: true, title: true, coverImageUrl: true, status: true, startSlot: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getHangoutDetail(hangoutId: string): Promise<HangoutDetail | null> {
  const hangout = await prisma.hangout.findUnique({
    where: { id: hangoutId },
    select: {
      id: true,
      title: true,
      coverImageUrl: true,
      status: true,
      startSlot: true,
      description: true,
      discordThreadUrl: true,
      availabilityDates: true,
      windowStartHour: true,
      windowEndHour: true,
      availabilityDeadline: true,
      idea: { select: { proposerName: true } },
      attendees: {
        select: { userId: true, status: true, user: { select: { name: true, email: true } } },
        orderBy: { user: { name: "asc" } },
      },
    },
  });
  if (!hangout) return null;
  const { idea, attendees, ...detail } = hangout;
  return {
    ...detail,
    proposerName: idea?.proposerName ?? null,
    attendees: attendees.map(({ userId, status, user }) => ({
      userId,
      status,
      name: user.name ?? user.email,
    })),
  };
}

export async function getAvailabilityResponses(hangoutId: string): Promise<AvailabilityResponse[]> {
  const rows = await prisma.hangoutAvailability.findMany({
    where: { hangoutId },
    select: { userId: true, slots: true, user: { select: { name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map(({ userId, slots, user }) => ({ userId, slots, name: user.name ?? user.email }));
}

export async function getOpenIdeas(): Promise<HangoutIdeaItem[]> {
  const ideas = await prisma.hangoutIdea.findMany({
    where: { hangoutId: null },
    select: {
      id: true,
      title: true,
      details: true,
      createdAt: true,
      proposerName: true,
      proposerDiscordId: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const users = await prisma.user.findMany({
    where: { discordId: { in: ideas.map((idea) => idea.proposerDiscordId) } },
    select: { discordId: true, name: true, avatarUrl: true },
  });
  const byDiscordId = new Map(users.map((user) => [user.discordId, user]));

  return ideas.map(({ proposerDiscordId, ...idea }) => {
    const user = byDiscordId.get(proposerDiscordId);
    return {
      ...idea,
      proposerName: user?.name ?? idea.proposerName,
      proposerAvatarUrl: user?.avatarUrl ?? null,
    };
  });
}
