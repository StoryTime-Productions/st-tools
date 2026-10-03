"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { HangoutStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { sendDiscordDm } from "@/lib/discord";
import { paymentSentMessage } from "@/lib/discord-messages";
import { getCurrentUser } from "@/lib/get-current-user";
import { prisma } from "@/lib/prisma";

export type PaymentActionResult = { error: string } | { success: true };

const UNAUTHORIZED = "Unauthorized";
const NO_SHARE = "Share not found";
const NOT_COLLECTOR = "Only the collector can do this";
const STALE = "That share changed; refresh and try again";

const uuid = z.string().uuid();

/** The share with its item's collector and hangout, if the ids are valid and the hangout is scheduled. */
async function loadShare(costId: string, userId: string) {
  if (!uuid.safeParse(costId).success || !uuid.safeParse(userId).success) return null;
  const share = await prisma.hangoutCostShare.findUnique({
    where: { costId_userId: { costId, userId } },
    select: {
      amountCents: true,
      paidCents: true,
      status: true,
      cost: {
        select: {
          title: true,
          hangoutId: true,
          collectorId: true,
          collector: { select: { discordId: true } },
          hangout: { select: { title: true, status: true } },
        },
      },
    },
  });
  return share?.cost.hangout.status === HangoutStatus.SCHEDULED ? share : null;
}

/** DM the collector that a share is marked Sent; best effort, skipped when they aren't linked. */
async function notifyCollector(
  share: NonNullable<Awaited<ReturnType<typeof loadShare>>>,
  payer: { name: string | null; email: string; avatarUrl: string | null },
  method: PaymentMethod
) {
  const discordId = share.cost.collector.discordId;
  if (!discordId) return;

  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const url = `${origin}/hub/hangouts/${share.cost.hangoutId}`;
  const name = payer.name?.trim() || payer.email;
  const owed = Math.max(share.amountCents - share.paidCents, 0);

  await sendDiscordDm(
    discordId,
    paymentSentMessage({
      hangoutTitle: share.cost.hangout.title,
      payer: name,
      payerAvatarUrl: payer.avatarUrl,
      item: share.cost.title,
      amountCents: owed,
      method,
      url,
    })
  );
}

/** Move a share to `data` only if it is still in `from`; the guard stops double clicks racing. */
async function move(
  costId: string,
  userId: string,
  from: PaymentStatus,
  data: { status?: PaymentStatus; method?: PaymentMethod | null; paidCents?: number },
  hangoutId: string
): Promise<PaymentActionResult> {
  const result = await prisma.hangoutCostShare.updateMany({
    where: { costId, userId, status: from },
    data,
  });
  if (result.count === 0) return { error: STALE };
  revalidatePath(`/hub/hangouts/${hangoutId}`);
  return { success: true };
}

/** The attendee says they paid. Only their own unpaid share, and only while they still owe. */
export async function markSentAction(
  costId: string,
  method: PaymentMethod
): Promise<PaymentActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: UNAUTHORIZED };
  if (!z.nativeEnum(PaymentMethod).safeParse(method).success) return { error: "Pick a method" };

  const share = await loadShare(costId, user.id);
  if (!share) return { error: NO_SHARE };
  if (share.amountCents <= share.paidCents) return { error: "Nothing to pay" };

  const result = await move(
    costId,
    user.id,
    PaymentStatus.UNPAID,
    { status: PaymentStatus.SENT, method },
    share.cost.hangoutId
  );
  if ("success" in result) await notifyCollector(share, user, method);
  return result;
}

/** Take back "Sent" until the collector confirms (C12). Members who left Going can't, the collector settles them. */
export async function undoSentAction(costId: string): Promise<PaymentActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: UNAUTHORIZED };

  const share = await loadShare(costId, user.id);
  if (!share) return { error: NO_SHARE };
  if (share.amountCents === 0) return { error: "Ask the collector to settle this one" };

  return move(
    costId,
    user.id,
    PaymentStatus.SENT,
    { status: PaymentStatus.UNPAID, method: null },
    share.cost.hangoutId
  );
}

/** The collector's view of a member's share, or why they can't act on it. */
async function collectorShare(costId: string, userId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: UNAUTHORIZED } as const;
  const share = await loadShare(costId, userId);
  if (!share) return { error: NO_SHARE } as const;
  if (share.cost.collectorId !== user.id) return { error: NOT_COLLECTOR } as const;
  return { share };
}

/** Collector received the money: the share is settled up to what was owed. */
export async function confirmPaymentAction(
  costId: string,
  userId: string
): Promise<PaymentActionResult> {
  const found = await collectorShare(costId, userId);
  if (!found.share) return { error: found.error };
  const { share } = found;

  return move(
    costId,
    userId,
    PaymentStatus.SENT,
    { status: PaymentStatus.CONFIRMED, paidCents: Math.max(share.paidCents, share.amountCents) },
    share.cost.hangoutId
  );
}

// ponytail: reverting drops paidCents to 0 (earlier confirmed part isn't tracked); a re-confirm restores it.
/** Collector un-confirms (C12). Their own auto-confirmed share can't be reverted. */
export async function revertConfirmationAction(
  costId: string,
  userId: string
): Promise<PaymentActionResult> {
  const found = await collectorShare(costId, userId);
  if (!found.share) return { error: found.error };
  if (userId === found.share.cost.collectorId) return { error: "Your own share is always settled" };

  return move(
    costId,
    userId,
    PaymentStatus.CONFIRMED,
    { status: PaymentStatus.SENT, paidCents: 0 },
    found.share.cost.hangoutId
  );
}

/** Collector paid back what is owed: a leaver's row becomes Refunded, a member who stayed is squared up. */
export async function markRefundedAction(
  costId: string,
  userId: string
): Promise<PaymentActionResult> {
  const found = await collectorShare(costId, userId);
  if (!found.share) return { error: found.error };
  const { share } = found;
  if (share.paidCents <= share.amountCents) return { error: "No refund is due" };

  const leaver = share.amountCents === 0;
  return move(
    costId,
    userId,
    share.status,
    leaver ? { status: PaymentStatus.REFUNDED, paidCents: 0 } : { paidCents: share.amountCents },
    share.cost.hangoutId
  );
}
