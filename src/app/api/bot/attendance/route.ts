import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AttendanceStatus } from "@prisma/client";
import { applyAttendance, ENDED, NOT_SCHEDULED } from "@/lib/attendance";
import { rejectUnlessBot } from "@/lib/bot-auth";
import { attendanceReplyMessage, connectDiscordMessage } from "@/lib/discord-messages";
import { refreshAnnouncement, siteUrl } from "@/lib/hangout-discord";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  hangoutId: z.string().uuid(),
  discordId: z.string().regex(/^\d{1,32}$/),
  status: z.enum(["going", "maybe", "not_going"]),
});

const STATUS = {
  going: AttendanceStatus.GOING,
  maybe: AttendanceStatus.MAYBE,
  not_going: AttendanceStatus.NOT_GOING,
} as const;
const LABEL = { going: "Going", maybe: "Maybe", not_going: "Not going" } as const;

/**
 * Button click from STBot. Answers `{ ok, message }` where `message` is the ephemeral reply embed;
 * a refused click (unlinked, not locked in yet, ended) is ok false, not an HTTP error.
 */
export async function POST(request: Request) {
  const denied = rejectUnlessBot(request);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { hangoutId, discordId, status } = parsed.data;

  const origin = await siteUrl();
  const user = await prisma.user.findUnique({ where: { discordId }, select: { id: true } });
  if (!user) {
    return NextResponse.json({
      ok: false,
      message: connectDiscordMessage({ url: `${origin}/settings/profile` }),
    });
  }

  const hangout = await prisma.hangout.findUnique({
    where: { id: hangoutId },
    select: { title: true },
  });
  if (!hangout) return NextResponse.json({ error: "Hangout not found" }, { status: 404 });
  const url = `${origin}/hub/hangouts/${hangoutId}`;

  const error = await applyAttendance(hangoutId, user.id, STATUS[status]);
  if (error) {
    const notOpen = error === NOT_SCHEDULED;
    return NextResponse.json({
      ok: false,
      message: attendanceReplyMessage({
        hangoutTitle: hangout.title,
        headline: notOpen ? "Not open yet" : "Too late",
        detail: notOpen
          ? "Attendance opens once the time is locked in. Fill in your availability first."
          : error === ENDED
            ? "This hangout has already ended."
            : error,
        url: notOpen ? `${url}#availability` : url,
        linkLabel: notOpen ? "Fill in availability" : "Open hangout",
      }),
    });
  }

  revalidatePath("/hub");
  revalidatePath(`/hub/hangouts/${hangoutId}`);
  await refreshAnnouncement(hangoutId);
  return NextResponse.json({
    ok: true,
    message: attendanceReplyMessage({
      hangoutTitle: hangout.title,
      headline: `You're ${LABEL[status].toLowerCase()}`,
      detail: `Your answer for ${hangout.title} is saved.`,
      url,
      linkLabel: "Open hangout",
    }),
  });
}
