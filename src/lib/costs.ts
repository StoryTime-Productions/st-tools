export interface Split {
  /** What every non-collector attendee owes. */
  each: number;
  /** What the collector owes; absorbs the rounding so shares sum to the total. */
  collector: number;
}

/** Split `total` cents across `n` Going members, rounding others up to the cent. */
export function splitCost(total: number, n: number): Split {
  let each = Math.ceil(total / n);
  let collector = total - each * (n - 1);
  if (collector < 0) {
    each = Math.floor(total / n);
    collector = total - each * (n - 1);
  }
  return { each, collector };
}

export interface ShareMoney {
  amountCents: number;
  paidCents: number;
  status: "UNPAID" | "SENT" | "CONFIRMED" | "REFUNDED";
}

export type Balance = { kind: "settled" | "owes" | "pending" | "owed"; cents: number };

/** What is still due on a share: `owes`/`owed` after confirmation, `pending` while Sent. */
export function shareBalance({ amountCents, paidCents, status }: ShareMoney): Balance {
  const diff = amountCents - paidCents;
  if (status === "SENT") return { kind: "pending", cents: diff };
  if (diff > 0) return { kind: "owes", cents: diff };
  if (diff < 0) return { kind: "owed", cents: -diff };
  return { kind: "settled", cents: 0 };
}

export interface ShareRow extends ShareMoney {
  userId: string;
  method: "E_TRANSFER" | "CASH" | null;
}

export interface SharePlan {
  upsert: ShareRow[];
  remove: string[];
}

/** Shares for one item after Going changed: who to write and whose row to drop. */
export function planShares(
  item: { amountCents: number; collectorId: string },
  going: string[],
  existing: ShareRow[]
): SharePlan {
  const split = going.length ? splitCost(item.amountCents, going.length) : null;
  const byUser = new Map(existing.map((row) => [row.userId, row]));
  const upsert: ShareRow[] = [];
  const remove: string[] = [];

  for (const userId of going) {
    const amountCents = userId === item.collectorId ? split!.collector : split!.each;
    const prior = byUser.get(userId);
    if (userId === item.collectorId) {
      upsert.push({
        userId,
        amountCents,
        paidCents: amountCents,
        status: "CONFIRMED",
        method: null,
      });
    } else if (!prior || prior.status === "REFUNDED") {
      upsert.push({ userId, amountCents, paidCents: 0, status: "UNPAID", method: null });
    } else if (prior.status === "CONFIRMED" && amountCents > prior.paidCents) {
      upsert.push({ ...prior, amountCents, status: "UNPAID", method: null });
    } else {
      upsert.push({ ...prior, amountCents });
    }
  }

  for (const row of existing) {
    if (going.includes(row.userId)) continue;
    const hasMoney = row.status === "SENT" || row.status === "CONFIRMED";
    if (!hasMoney) remove.push(row.userId);
    else if (row.amountCents !== 0)
      upsert.push({
        ...row,
        amountCents: 0,
        paidCents: row.status === "SENT" ? row.amountCents : row.paidCents,
      });
  }
  return { upsert, remove };
}
