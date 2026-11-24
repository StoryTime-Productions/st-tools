import { prisma } from "@/lib/prisma";
import { groupByStatus, type BucketItemView, type BucketStatus } from "@/lib/bucket-list-core";

export * from "@/lib/bucket-list-core";

const itemInclude = {
  suggestedBy: { select: { name: true } },
  hangout: { select: { title: true } },
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
  hangout: { title: string } | null;
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

/** The item linked to a hangout, for the hangout page (Q4). */
export async function getBucketItemForHangout(hangoutId: string) {
  const row = await prisma.bucketItem.findUnique({ where: { hangoutId }, include: itemInclude });
  return row ? toView(row) : null;
}
