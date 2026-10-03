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
