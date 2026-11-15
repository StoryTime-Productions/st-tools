import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/get-current-user";
import { getVisibleCountdowns } from "@/lib/countdowns";

export const dynamic = "force-dynamic";

/** The countdowns that apply to the signed-in user, for the alarm and the tab title. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const now = new Date();
  const list = await getVisibleCountdowns(user.id, now);
  return NextResponse.json(
    list.map((c) => ({
      id: c.id,
      title: c.title,
      targetAt: c.targetAt.toISOString(),
      dismissed: c.dismissed,
    })),
    { headers: { "Cache-Control": "no-store" } }
  );
}
