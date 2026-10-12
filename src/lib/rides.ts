import { AttendanceStatus, HangoutStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/get-current-user";
import { hangoutEnded } from "@/lib/hangouts";
import { prisma } from "@/lib/prisma";

export const UNAUTHORIZED = "Unauthorized";
export const NOT_GOING = "Only people going can drive or ride";
export const ENDED = "This hangout has already ended";

/**
 * Takes someone off every car list of a hangout, and off any list that uses their home as a
 * meeting point (an entry that is "at another rider's home" stops making sense without them).
 * Returned unawaited so callers can run it inside a transaction.
 */
export const clearFromRides = (hangoutId: string, userId: string) =>
  prisma.hangoutPassenger.deleteMany({
    where: { hangoutId, OR: [{ userId }, { viaUserId: userId }] },
  });

/** The caller, if they are Going to this scheduled hangout. */
export async function goingUser(hangoutId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: UNAUTHORIZED } as const;
  const attendee = await prisma.hangoutAttendee.findFirst({
    where: {
      hangoutId,
      userId: user.id,
      status: AttendanceStatus.GOING,
      hangout: { status: HangoutStatus.SCHEDULED },
    },
    select: { userId: true },
  });
  if (!attendee) return { error: NOT_GOING } as const;
  if (await hangoutEnded(hangoutId)) return { error: ENDED } as const;
  return { user };
}
