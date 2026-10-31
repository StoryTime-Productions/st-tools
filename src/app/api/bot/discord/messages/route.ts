import { NextResponse } from "next/server";
import { rejectUnlessBot } from "@/lib/bot-auth";
import { recordMessages, messagesSchema } from "@/lib/discord-ingest";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = rejectUnlessBot(request);
  if (denied) return denied;

  const parsed = messagesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  return NextResponse.json({ ok: true, result: await recordMessages(parsed.data) });
}
