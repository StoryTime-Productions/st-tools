import { AttendanceStatus, HangoutStatus } from "@prisma/client";
import { resplitCosts } from "@/lib/cost-shares";
import { hangoutEnded } from "@/lib/hangouts";
import { prisma } from "@/lib/prisma";
import { clearFromRides } from "@/lib/rides";
import { recomputeRoutes } from "@/lib/routes";

export const ENDED = "This hangout has already ended";
export const NOT_SCHEDULED = "Hangout is not scheduled";

/**
 * Sets one member's attendance (Scheduled and not ended only). Leaving Going drops their rides, transit
 * choice and car, then routes and cost shares are recomputed. Returns an error message or null.
 */
export async function applyAttendance(
  hangoutId: string,
  userId: string,
  status: AttendanceStatus
): Promise<string | null> {
  const hangout = await prisma.hangout.findUnique({
    where: { id: hangoutId },
    select: { status: true },
  });
  if (hangout?.status !== HangoutStatus.SCHEDULED) return NOT_SCHEDULED;
  if (await hangoutEnded(hangoutId)) return ENDED;

  const key = { hangoutId, userId };
  await prisma.$transaction([
    prisma.hangoutAttendee.upsert({
      where: { hangoutId_userId: key },
      create: { ...key, status },
      update: { status },
    }),
    ...(status === AttendanceStatus.GOING
      ? []
      : [
          clearFromRides(hangoutId, userId),
          prisma.hangoutTransit.deleteMany({ where: key }),
          prisma.hangoutCar.deleteMany({ where: { hangoutId, driverId: userId } }),
        ]),
  ]);

  if (status !== AttendanceStatus.GOING) await recomputeRoutes(hangoutId);
  await resplitCosts(hangoutId);
  return null;
}
