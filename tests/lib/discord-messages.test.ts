import { describe, expect, it } from "vitest";
import type { DiscordMessage } from "@/lib/discord";
import {
  announcementMessage,
  attendanceReplyMessage,
  boardAccessMessage,
  cancelMessage,
  changeMessage,
  COLORS,
  connectDiscordMessage,
  discordTime,
  ideaPostMessage,
  ideaReplyMessage,
  lockInMessage,
  nudgeMessage,
  paymentReminderMessage,
  paymentSentMessage,
  truncate,
} from "@/lib/discord-messages";

const URL = "https://tools.test/hub/hangouts/h1";
const DATE = new Date("2026-10-04T23:30:00Z");
const LONG = "**Long** `text` __with__ ~~markup~~ * ".repeat(400);

const MESSAGES: Record<string, DiscordMessage> = {
  announcement: announcementMessage({
    hangoutId: "h1",
    title: "Movie night",
    description: "Pizza and a film. Bring snacks.",
    url: URL,
    availabilityUrl: `${URL}#availability`,
    proposedBy: "Alice",
    deadline: DATE,
    dates: ["2026-10-04", "2026-10-05", "2026-10-06"],
    coverUrl: "https://tools.test/cover.png",
    going: 2,
    maybe: 1,
  }),
  nudge: nudgeMessage({
    hangoutTitle: "Movie night",
    availabilityUrl: URL,
    deadline: DATE,
    waiting: ["Bob", "Carol"],
  }),
  change: changeMessage({
    hangoutTitle: "Movie night",
    url: URL,
    changes: [{ area: "Itinerary", lines: ["Stop 2: 7:00 PM -> 7:30 PM"] }],
  }),
  lockIn: lockInMessage({
    hangoutTitle: "Movie night",
    url: URL,
    startsAt: DATE,
    coverUrl: "https://tools.test/cover.png",
    going: 3,
    maybe: 1,
  }),
  cancel: cancelMessage({ hangoutTitle: "Movie night" }),
  reminder: paymentReminderMessage({
    hangoutTitle: "Movie night",
    item: "Pizza",
    amountCents: 1334,
    collector: "Alice",
    status: "Unpaid",
    url: URL,
  }),
  sent: paymentSentMessage({
    hangoutTitle: "Movie night",
    payer: "Bob",
    payerAvatarUrl: "https://tools.test/bob.png",
    item: "Pizza",
    amountCents: 1000,
    method: "E_TRANSFER",
    url: URL,
  }),
  ideaReply: ideaReplyMessage({ title: "Bowling", details: "Strikes only", url: URL }),
  ideaPost: ideaPostMessage({ title: "Bowling", proposedBy: "Dana", url: URL }),
  boardAccess: boardAccessMessage({
    board: "Roadmap",
    requester: "Eve",
    project: "Sailcore",
    url: URL,
  }),
  connect: connectDiscordMessage({ url: URL }),
  attendanceReply: attendanceReplyMessage({
    hangoutTitle: "Movie night",
    headline: "Not open yet",
    detail: "Attendance opens once the time is locked in.",
    url: URL,
    linkLabel: "Fill in availability",
  }),
};

const WORST_CASE: Record<string, DiscordMessage> = {
  announcement: announcementMessage({
    hangoutId: "h1",
    title: LONG,
    description: LONG,
    url: URL,
    availabilityUrl: URL,
    proposedBy: LONG,
    deadline: DATE,
    dates: Array.from({ length: 60 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`),
    coverUrl: "https://tools.test/cover.png",
    going: 999,
    maybe: 999,
  }),
  nudge: nudgeMessage({
    hangoutTitle: LONG,
    availabilityUrl: URL,
    deadline: DATE,
    waiting: Array.from({ length: 60 }, () => LONG),
  }),
  change: changeMessage({
    hangoutTitle: LONG,
    url: URL,
    changes: (["Itinerary", "Costs", "Carpools"] as const).map((area) => ({
      area,
      lines: Array.from({ length: 10 }, () => LONG),
    })),
  }),
  lockIn: lockInMessage({
    hangoutTitle: LONG,
    url: URL,
    startsAt: DATE,
    coverUrl: "https://tools.test/cover.png",
    going: 99,
    maybe: 99,
  }),
  cancel: cancelMessage({ hangoutTitle: LONG }),
  reminder: paymentReminderMessage({
    hangoutTitle: LONG,
    item: LONG,
    amountCents: 123456789,
    collector: LONG,
    status: LONG,
    url: URL,
  }),
  sent: paymentSentMessage({
    hangoutTitle: LONG,
    payer: LONG,
    item: LONG,
    amountCents: 1,
    method: "CASH",
    url: URL,
  }),
  ideaReply: ideaReplyMessage({ title: LONG, details: LONG, url: URL }),
  ideaPost: ideaPostMessage({ title: LONG, proposedBy: LONG, url: URL }),
  boardAccess: boardAccessMessage({ board: LONG, requester: LONG, project: LONG, url: URL }),
  attendanceReply: attendanceReplyMessage({
    hangoutTitle: LONG,
    headline: LONG,
    detail: LONG,
    url: URL,
    linkLabel: "Open hangout",
  }),
};

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

function embedLength(message: DiscordMessage) {
  return message.embeds.reduce(
    (sum, e) =>
      sum +
      e.title.length +
      (e.description?.length ?? 0) +
      (e.footer?.text.length ?? 0) +
      (e.author?.name.length ?? 0) +
      (e.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0),
    0
  );
}

describe("truncate", () => {
  it("strips emphasis markup and trims", () => {
    expect(truncate("  **a** __b__ ~~c~~ `d` e*f ", 50)).toBe("a b c d ef");
  });

  it("cuts to the limit with an ellipsis", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcd…");
    expect(truncate("abcde", 5)).toBe("abcde");
  });
});

describe("discordTime", () => {
  it("emits both tags and the plain Toronto time", () => {
    expect(discordTime(DATE)).toBe(
      "<t:1791156600:F> (<t:1791156600:R>)\nSun, Oct 4, 7:30 p.m. EDT"
    );
  });
});

describe("builders", () => {
  it.each(Object.entries(MESSAGES))("%s matches its snapshot", (_name, message) => {
    expect(message).toMatchSnapshot();
  });

  it("colours follow the palette", () => {
    expect(MESSAGES.announcement.embeds[0].color).toBe(COLORS.info);
    expect(MESSAGES.nudge.embeds[0].color).toBe(COLORS.action);
    expect(MESSAGES.reminder.embeds[0].color).toBe(COLORS.action);
    expect(MESSAGES.sent.embeds[0].color).toBe(COLORS.action);
    expect(MESSAGES.lockIn.embeds[0].color).toBe(COLORS.confirmed);
    expect(MESSAGES.cancel.embeds[0].color).toBe(COLORS.cancelled);
  });

  it("uses the cover only on the announcement and lock-in", () => {
    const withImage = Object.entries(MESSAGES)
      .filter(([, m]) => m.embeds[0].image)
      .map(([key]) => key);
    expect(withImage).toEqual(["announcement", "lockIn"]);
  });

  it("sets a timestamp only for nudge and lock-in", () => {
    const stamped = Object.entries(MESSAGES)
      .filter(([, m]) => m.embeds[0].timestamp)
      .map(([key]) => key);
    expect(stamped).toEqual(["nudge", "lockIn"]);
  });

  it("omits optional announcement fields and the cover when absent", () => {
    const message = announcementMessage({
      hangoutId: "h1",
      title: "Bare",
      url: URL,
      availabilityUrl: URL,
    });
    const embed = message.embeds[0];
    expect(embed.description).toBeUndefined();
    expect(embed.image).toBeUndefined();
    expect(embed.fields?.map((f) => f.name)).toEqual(["Going", "Maybe"]);
  });

  it("describes a single date plainly and keeps only the first sentence", () => {
    const embed = announcementMessage({
      hangoutId: "h1",
      title: "One day",
      description: "No punctuation here",
      url: URL,
      availabilityUrl: URL,
      dates: ["2026-10-04"],
    }).embeds[0];
    expect(embed.description).toBe("No punctuation here");
    expect(embed.fields?.find((f) => f.name === "Dates")?.value).toBe("2026-10-04");
  });

  it("caps nudge names at 20 and reports the rest", () => {
    const names = Array.from({ length: 23 }, (_, i) => `P${i}`);
    const embed = nudgeMessage({
      hangoutTitle: "T",
      availabilityUrl: URL,
      deadline: DATE,
      waiting: names,
    }).embeds[0];
    expect(embed.fields?.[0].value.endsWith("P19, and 3 more")).toBe(true);
  });

  it("caps change lines at three per area and anchors a single area", () => {
    const message = changeMessage({
      hangoutTitle: "T",
      url: URL,
      changes: [{ area: "Costs", lines: ["a", "b", "c", "d", "e"] }],
    });
    expect(message.embeds[0].fields?.[0].value).toBe("a\nb\nc\nand 2 more");
    expect(message.components?.[0].components[0]).toMatchObject({ url: `${URL}#costs` });
  });

  it("does not anchor a change that spans several areas", () => {
    const message = changeMessage({
      hangoutTitle: "T",
      url: URL,
      changes: [
        { area: "Costs", lines: ["a"] },
        { area: "Carpools", lines: ["b"] },
      ],
    });
    expect(message.components?.[0].components[0]).toMatchObject({ url: URL });
  });

  it("omits the author icon and idea details when absent", () => {
    const sent = paymentSentMessage({
      hangoutTitle: "T",
      payer: "Bob",
      item: "x",
      amountCents: 5,
      method: "CASH",
      url: URL,
    });
    expect(sent.embeds[0].author).toEqual({ name: "Bob" });
    expect(ideaReplyMessage({ title: "x", url: URL }).embeds[0].description).toBeUndefined();
  });
});

describe("limits and markup (G2, G8, G9)", () => {
  const all = { ...MESSAGES, ...WORST_CASE };

  it.each(Object.entries(all))("%s has no emphasis markup", (_name, message) => {
    for (const text of strings(message)) {
      expect(text).not.toMatch(/\*|__|~~|`/);
    }
  });

  it.each(Object.entries(WORST_CASE))("%s stays within Discord limits", (_name, message) => {
    expect(embedLength(message)).toBeLessThanOrEqual(6000);
    for (const embed of message.embeds) {
      expect(embed.title.length).toBeLessThanOrEqual(256);
      expect(embed.description?.length ?? 0).toBeLessThanOrEqual(4096);
      expect(embed.fields?.length ?? 0).toBeLessThanOrEqual(25);
      for (const f of embed.fields ?? []) {
        expect(f.name.length).toBeLessThanOrEqual(256);
        expect(f.value.length).toBeLessThanOrEqual(1024);
      }
    }
  });

  it("marks truncated text with an ellipsis", () => {
    expect(WORST_CASE.reminder.embeds[0].fields?.[0].value.endsWith("…")).toBe(true);
    expect(WORST_CASE.announcement.embeds[0].title.endsWith("…")).toBe(true);
  });

  it.each(Object.entries(all))("%s has valid rows with at most two link buttons", (_name, m) => {
    const rows = m.components ?? [];
    expect(rows.length).toBeLessThanOrEqual(5);
    const links = rows.flatMap((r) => r.components).filter((b) => b.style === 5);
    expect(links.length).toBeLessThanOrEqual(2);
    for (const r of rows) {
      expect(r.components.length).toBeGreaterThan(0);
      expect(r.components.length).toBeLessThanOrEqual(5);
    }
  });

  it("gives the announcement three state buttons that carry the hangout id", () => {
    const ids = MESSAGES.announcement.components?.[1].components.map((b) =>
      "custom_id" in b ? b.custom_id : ""
    );
    expect(ids).toEqual(["hangout:h1:going", "hangout:h1:maybe", "hangout:h1:not_going"]);
  });
});
