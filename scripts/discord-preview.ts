// Posts one of every hub Discord message to a test channel so the layout can be eyeballed once.
// Usage: pnpm discord:preview <channelId> [label...]   (needs DISCORD_BOT_TOKEN; NEXT_PUBLIC_SITE_URL optional)
import type { DiscordMessage } from "../src/lib/discord";
import { postToChannel } from "../src/lib/discord";
import {
  announcementMessage,
  attendanceReplyMessage,
  boardAccessMessage,
  cancelMessage,
  changeMessage,
  connectDiscordMessage,
  ideaPostMessage,
  ideaReplyMessage,
  lockInMessage,
  nudgeMessage,
  paymentReminderMessage,
  paymentSentMessage,
} from "../src/lib/discord-messages";

const channelId = process.argv[2] ?? process.env.DISCORD_HANGOUTS_CHANNEL_ID;
if (!channelId || !process.env.DISCORD_BOT_TOKEN) {
  console.error("Usage: pnpm discord:preview <channelId> (DISCORD_BOT_TOKEN must be set)");
  process.exit(1);
}

const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const url = `${site}/hub/hangouts/preview`;
const hangoutTitle = "Movie night";
const soon = new Date(Date.now() + 3 * 24 * 3600 * 1000);

const samples: [string, DiscordMessage][] = [
  [
    "announcement",
    announcementMessage({
      hangoutId: "preview",
      title: hangoutTitle,
      description: "Pizza and a movie at Alice's. Bring snacks.",
      url,
      availabilityUrl: `${url}#availability`,
      proposedBy: "Alice",
      deadline: soon,
      dates: ["2026-10-10", "2026-10-11"],
      going: 2,
      maybe: 1,
    }),
  ],
  [
    "nudge",
    nudgeMessage({
      hangoutTitle,
      availabilityUrl: `${url}#availability`,
      deadline: soon,
      waiting: ["Bob", "Carol"],
    }),
  ],
  [
    "change",
    changeMessage({
      hangoutTitle,
      url,
      changes: [{ area: "Itinerary", lines: ["Added Dinner", "Dinner -> moved up"] }],
    }),
  ],
  ["lock-in", lockInMessage({ hangoutTitle, url, startsAt: soon, going: 3, maybe: 1 })],
  ["cancel", cancelMessage({ hangoutTitle })],
  [
    "payment reminder",
    paymentReminderMessage({
      hangoutTitle,
      item: "Pizza",
      amountCents: 1000,
      collector: "Alice",
      status: "Unpaid",
      url: `${url}#costs`,
    }),
  ],
  [
    "payment sent",
    paymentSentMessage({
      hangoutTitle,
      payer: "Bob",
      item: "Pizza",
      amountCents: 1000,
      method: "E_TRANSFER",
      url: `${url}#costs`,
    }),
  ],
  [
    "idea reply",
    ideaReplyMessage({ title: "Escape room", details: "Something spooky for Halloween.", url }),
  ],
  ["idea post", ideaPostMessage({ title: "Escape room", proposedBy: "Bob", url })],
  [
    "board access",
    boardAccessMessage({ board: "Roadmap", requester: "Bob", project: "St-Tools", url }),
  ],
  ["connect discord", connectDiscordMessage({ url: `${site}/profile` })],
  [
    "attendance reply",
    attendanceReplyMessage({
      hangoutTitle,
      headline: "Marked as going",
      detail: "You are on the list.",
      url,
      linkLabel: "Open hangout",
    }),
  ],
];

async function main() {
  const only = process.argv.slice(3);
  for (const [label, message] of samples) {
    if (only.length && !only.includes(label)) continue;
    const id = await postToChannel(channelId as string, message);
    console.log(`${id ? "posted " : "FAILED "} ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

void main();
