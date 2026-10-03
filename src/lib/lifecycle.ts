import type { HangoutStatus, PaymentStatus } from "@prisma/client";
import { addDays, torontoToUtc } from "@/lib/calendar";
import { scheduleStops, type TimedStop } from "@/lib/itinerary";

/** Settling up and Done are never stored: they are derived from the end time and the shares. */
export type HangoutPhase = HangoutStatus | "SETTLING_UP" | "DONE";

export interface ShareMoney {
  status: PaymentStatus;
  amountCents: number;
  paidCents: number;
}

/** The last stop's end, else midnight ending the locked day (L7). */
export function hangoutEnd(startSlot: string, stops: TimedStop[]) {
  const minutes = scheduleStops(startSlot, stops).end ?? 1440;
  return torontoToUtc(addDays(startSlot.slice(0, 10), Math.floor(minutes / 1440)), minutes % 1440);
}

/** Unpaid or Sent, or paid more than owed (refund due); Confirmed and Refunded are settled (L2). */
export function unpaidCount(shares: ShareMoney[]) {
  return shares.filter(
    (share) =>
      share.status === "UNPAID" || share.status === "SENT" || share.paidCents > share.amountCents
  ).length;
}

export function hangoutPhase(
  hangout: { status: HangoutStatus; startSlot: string | null },
  stops: TimedStop[],
  unpaid: number,
  now = new Date()
): HangoutPhase {
  if (hangout.status !== "SCHEDULED" || !hangout.startSlot) return hangout.status;
  if (now < hangoutEnd(hangout.startSlot, stops)) return "SCHEDULED";
  return unpaid > 0 ? "SETTLING_UP" : "DONE";
}
