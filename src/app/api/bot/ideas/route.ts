import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectUnlessBot } from "@/lib/bot-auth";
import { postToChannel } from "@/lib/discord";
import { ideaPostMessage, ideaReplyMessage } from "@/lib/discord-messages";
import { siteUrl } from "@/lib/hangout-discord";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(100),
  details: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((value) => value || null),
  discordId: z.string().regex(/^\d{1,32}$/),
  name: z.string().trim().min(1).max(100),
});

/**
 * `/idea` from STBot: stores the idea, posts it to the ideas channel (best effort, once) and
 * returns `{ ok, posted, channelId, message }`: `message` is the ephemeral reply embed, `channelId` is
 * where the public post landed so the bot can drop its duplicate private reply.
 */
export async function POST(request: Request) {
  const denied = rejectUnlessBot(request);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { title, details, discordId, name } = parsed.data;

  await prisma.hangoutIdea.create({
    data: { title, details, proposerDiscordId: discordId, proposerName: name },
  });
  revalidatePath("/hub/ideas");

  const url = `${await siteUrl()}/hub/ideas`;
  const channelId = process.env.DISCORD_IDEAS_CHANNEL_ID;
  const posted = channelId
    ? (await postToChannel(channelId, ideaPostMessage({ title, proposedBy: name, url }))) !== null
    : false;

  return NextResponse.json({
    ok: true,
    posted,
    channelId: posted ? channelId : null,
    message: ideaReplyMessage({ title, details, url }),
  });
}
