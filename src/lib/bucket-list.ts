import type { HangoutStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  disambiguate,
  groupByStatus,
  seasonLabel,
  slotDateLabel,
  type BucketItemView,
  type BucketStatus,
} from "@/lib/bucket-list-core";
import { hangoutEnded } from "@/lib/lifecycle";

export * from "@/lib/bucket-list-core";

const itemInclude = {
  suggestedBy: { select: { name: true } },
  hangout: {
    select: {
      title: true,
      status: true,
      startSlot: true,
      stops: {
        select: { durationMinutes: true, arriveBy: true },
        orderBy: { position: "asc" as const },
      },
    },
  },
  tags: { select: { name: true }, orderBy: { name: "asc" as const } },
};

type ItemRow = {
  id: string;
  title: string;
  notes: string | null;
  status: BucketStatus;
  season: BucketItemView["season"];
  seasonYear: number | null;
  suggestedById: string | null;
  hangoutId: string | null;
  driveFolderId: string | null;
  doneAt: Date | null;
  createdAt: Date;
  suggestedBy: { name: string | null } | null;
  hangout: {
    title: string;
    status: HangoutStatus;
    startSlot: string | null;
    stops: { durationMinutes: number; arriveBy: string | null }[];
  } | null;
  tags: { name: string }[];
};

function toView(row: ItemRow): BucketItemView {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    season: row.season,
    seasonYear: row.seasonYear,
    suggestedById: row.suggestedById,
    suggestedByName: row.suggestedBy?.name ?? null,
    hangoutId: row.hangoutId,
    hangoutTitle: row.hangout?.title ?? null,
    hangoutEnded: row.hangout ? hangoutEnded(row.hangout, row.hangout.stops) : false,
    driveFolderId: row.driveFolderId,
    doneAt: row.doneAt,
    createdAt: row.createdAt,
    tags: row.tags.map((tag) => tag.name),
  };
}

/** Every item, grouped into the three list columns. The list is shared, so there is no per-viewer filtering. */
export async function getBucketList() {
  const rows = await prisma.bucketItem.findMany({ include: itemInclude });
  return groupByStatus(rows.map(toView));
}

export async function getBucketItem(id: string) {
  const row = await prisma.bucketItem.findUnique({ where: { id }, include: itemInclude });
  return row ? toView(row) : null;
}

/** Hangouts that can still take an item: not cancelled and not already linked (one item per hangout). */
export async function getLinkableHangouts() {
  const rows = await prisma.hangout.findMany({
    where: { bucketItem: null, status: { not: "CANCELLED" } },
    select: { id: true, title: true, startSlot: true },
    orderBy: [{ title: "asc" }, { createdAt: "asc" }],
  });
  return disambiguate(
    rows.map((row) => ({ id: row.id, title: row.title, detail: slotDateLabel(row.startSlot) }))
  );
}

/** Items that can be linked from a hangout page: not done and not tied to another hangout. */
export async function getUnlinkedBucketItems() {
  const rows = await prisma.bucketItem.findMany({
    where: { hangoutId: null, status: { not: "DONE" } },
    select: {
      id: true,
      title: true,
      season: true,
      seasonYear: true,
      suggestedBy: { select: { name: true } },
    },
    orderBy: [{ title: "asc" }, { createdAt: "asc" }],
  });
  return disambiguate(
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      detail: [seasonLabel(row.season, row.seasonYear), `by ${row.suggestedBy?.name ?? "someone"}`]
        .filter(Boolean)
        .join(" · "),
    }))
  );
}

/** The item linked to a hangout, for the hangout page (Q4). */
export async function getBucketItemForHangout(hangoutId: string) {
  const row = await prisma.bucketItem.findUnique({ where: { hangoutId }, include: itemInclude });
  return row ? toView(row) : null;
}
