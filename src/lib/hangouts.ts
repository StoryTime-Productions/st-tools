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
}

export async function getHangoutSummaries(): Promise<HangoutSummary[]> {
  return prisma.hangout.findMany({
    select: { id: true, title: true, coverImageUrl: true, status: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getHangoutDetail(hangoutId: string): Promise<HangoutDetail | null> {
  return prisma.hangout.findUnique({
    where: { id: hangoutId },
    select: {
      id: true,
      title: true,
      coverImageUrl: true,
      status: true,
      description: true,
      discordThreadUrl: true,
    },
  });
}
