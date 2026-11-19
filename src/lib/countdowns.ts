import { prisma } from "@/lib/prisma";
import { sortCountdowns, type CountdownView } from "@/lib/countdown-core";

export * from "@/lib/countdown-core";

/**
 * Countdowns this user can see: global for everyone, global filtered to them, and their own personal ones.
 * An admin also sees every global countdown (flagged `applies: false` when it is for others) so they can manage it.
 */
export async function getVisibleCountdowns(
  userId: string,
  now: Date = new Date(),
  { asAdmin = false }: { asAdmin?: boolean } = {}
): Promise<CountdownView[]> {
  const rows = await prisma.countdown.findMany({
    where: {
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        {
          OR: [
            { scope: "PERSONAL", ownerId: userId },
            asAdmin ? { scope: "GLOBAL" } : { scope: "GLOBAL", audience: { none: {} } },
            { scope: "GLOBAL", audience: { some: { userId } } },
          ],
        },
      ],
    },
    include: {
      _count: { select: { audience: true } },
      audience: asAdmin ? { select: { userId: true } } : false,
      dismissals: { where: { userId }, select: { userId: true } },
    },
  });
  return sortCountdowns(
    rows.map((r) => {
      const audienceUserIds = r.audience?.map((a) => a.userId) ?? [];
      return {
        id: r.id,
        title: r.title,
        targetAt: r.targetAt,
        scope: r.scope,
        ownerId: r.ownerId,
        audienceCount: r.scope === "GLOBAL" && r._count.audience > 0 ? r._count.audience : null,
        audienceUserIds,
        applies:
          r.scope === "PERSONAL" ||
          r._count.audience === 0 ||
          audienceUserIds.includes(userId) ||
          !asAdmin,
        dismissed: r.dismissals.length > 0,
      };
    })
  );
}

export function countPersonalCountdowns(userId: string, now: Date = new Date()) {
  return prisma.countdown.count({
    where: { scope: "PERSONAL", ownerId: userId, expiresAt: { gt: now } },
  });
}

export function deleteExpiredCountdowns(now: Date = new Date()) {
  return prisma.countdown.deleteMany({ where: { expiresAt: { lte: now } } });
}
