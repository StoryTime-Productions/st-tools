import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/** Bearer check for `/api/bot/*`; returns the 401 response to send, or null when authorised. */
export function rejectUnlessBot(request: Request) {
  const secret = process.env.BOT_API_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  const ok = Boolean(secret) && given.length === wanted.length && timingSafeEqual(given, wanted);
  return ok ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
