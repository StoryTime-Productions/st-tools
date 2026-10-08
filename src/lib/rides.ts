import { prisma } from "@/lib/prisma";

/**
 * Takes someone off every car list of a hangout, and off any list that uses their home as a
 * meeting point (an entry that is "at another rider's home" stops making sense without them).
 * Returned unawaited so callers can run it inside a transaction.
 */
export const clearFromRides = (hangoutId: string, userId: string) =>
  prisma.hangoutPassenger.deleteMany({
    where: { hangoutId, OR: [{ userId }, { viaUserId: userId }] },
  });
