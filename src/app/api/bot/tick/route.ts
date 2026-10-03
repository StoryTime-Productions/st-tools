import { NextResponse } from "next/server";
import { rejectUnlessBot } from "@/lib/bot-auth";
import { flushUpdates, sendNudges, sendPaymentReminders } from "@/lib/bot-tick";
import { siteUrl } from "@/lib/hangout-discord";

export const dynamic = "force-dynamic";

/** Called by STBot every minute (A4): availability nudges, debounced updates, payment reminders. */
export async function POST(request: Request) {
  const denied = rejectUnlessBot(request);
  if (denied) return denied;

  const origin = await siteUrl();
  const nudges = await sendNudges(origin);
  const updates = await flushUpdates(origin);
  const reminders = await sendPaymentReminders(origin);
  return NextResponse.json({ ok: true, nudges, updates, reminders });
}
