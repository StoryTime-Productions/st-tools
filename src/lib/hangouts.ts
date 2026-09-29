import type { HangoutStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface HangoutSummary {
  id: string;
  title: string;
  coverImageUrl: string | null;
  status: HangoutStatus;
}

export interface HangoutDetail extends HangoutSummary {
  description: string | null;
  discordThreadUrl: string | null;
  proposerName: string | null;
  availabilityDates: string[];
  windowStartHour: number;
  windowEndHour: number;
  availabilityDeadline: Date | null;
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
    select: { id: true, title: true, coverImageUrl: true, status: true },
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
      description: true,
      discordThreadUrl: true,
      availabilityDates: true,
      windowStartHour: true,
      windowEndHour: true,
      availabilityDeadline: true,
      idea: { select: { proposerName: true } },
    },
  });
  if (!hangout) return null;
  const { idea, ...detail } = hangout;
  return { ...detail, proposerName: idea?.proposerName ?? null };
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
