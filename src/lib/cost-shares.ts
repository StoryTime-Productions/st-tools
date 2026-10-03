import { AttendanceStatus, HangoutStatus } from "@prisma/client";
import { planShares } from "@/lib/costs";
import { prisma } from "@/lib/prisma";

/** Re-derive every cost share of a hangout from who is Going; no-op once cancelled. */
export async function resplitCosts(hangoutId: string) {
  const hangout = await prisma.hangout.findUnique({
    where: { id: hangoutId },
    select: {
      status: true,
      attendees: { where: { status: AttendanceStatus.GOING }, select: { userId: true } },
      costs: {
        select: {
          id: true,
          amountCents: true,
          collectorId: true,
          shares: {
            select: {
              userId: true,
              amountCents: true,
              paidCents: true,
              status: true,
              method: true,
            },
          },
        },
      },
    },
  });
  if (!hangout || hangout.status === HangoutStatus.CANCELLED) return;

  if (hangout.status === HangoutStatus.COLLECTING) {
    await prisma.hangoutCostShare.deleteMany({ where: { cost: { hangoutId } } });
    return;
  }

  const going = hangout.attendees.map((attendee) => attendee.userId);
  const ops = hangout.costs.flatMap((cost) => {
    const plan = planShares(cost, going, cost.shares);
    const costId = cost.id;
    return [
      ...(plan.remove.length
        ? [prisma.hangoutCostShare.deleteMany({ where: { costId, userId: { in: plan.remove } } })]
        : []),
      ...plan.upsert.map(({ userId, ...data }) =>
        prisma.hangoutCostShare.upsert({
          where: { costId_userId: { costId, userId } },
          create: { costId, userId, ...data },
          update: data,
        })
      ),
    ];
  });
  if (ops.length) await prisma.$transaction(ops);
}
