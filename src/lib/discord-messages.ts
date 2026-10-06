import type {
  DiscordButton,
  DiscordEmbed,
  DiscordField,
  DiscordMessage,
  DiscordRow,
} from "@/lib/discord";

export const COLORS = {
  info: 0x3b82f6,
  action: 0xf59e0b,
  confirmed: 0x22c55e,
  cancelled: 0x6b7280,
} as const;

const BRAND = "StoryTime Hub";
const TITLE_MAX = 256;
const DESCRIPTION_MAX = 1000;
const FIELD_MAX = 1024;
const NAME_MAX = 100;
const LINE_MAX = 300;
const MAX_LINES = 3;
const MAX_NAMES = 20;

/** Strips emphasis markup (G2) and cuts to `max` characters with an ellipsis (G9). */
export function truncate(value: string, max: number) {
  const plain = value.replace(/[*`]|__|~~/g, "").trim();
  return plain.length <= max ? plain : `${plain.slice(0, max - 1).trimEnd()}…`;
}

const title = (value: string) => truncate(value, TITLE_MAX);
const name = (value: string) => truncate(value, NAME_MAX);
const field = (label: string, value: string, inline = false): DiscordField => ({
  name: label,
  value: truncate(value, FIELD_MAX) || "-",
  ...(inline ? { inline } : {}),
});

const footer = (hangoutTitle?: string) => ({
  text: hangoutTitle ? `${BRAND} · ${name(hangoutTitle)}` : BRAND,
});

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const EST_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/** Discord tags followed by the plain Toronto time, so it reads right if tags don't render (G6). */
export function discordTime(date: Date) {
  const unix = Math.floor(date.getTime() / 1000);
  return `<t:${unix}:F> (<t:${unix}:R>)\n${EST_FORMAT.format(date)}`;
}

const link = (label: string, url: string): DiscordButton => ({ type: 2, style: 5, label, url });
const choice = (hangoutId: string, status: "going" | "maybe" | "not_going", label: string) =>
  ({ type: 2, style: 2, label, custom_id: `hangout:${hangoutId}:${status}` }) as DiscordButton;
const row = (...components: DiscordButton[]): DiscordRow => ({ type: 1, components });

function embedMessage(embed: DiscordEmbed, ...rows: DiscordRow[]): DiscordMessage {
  return { embeds: [embed], components: rows };
}

function firstSentence(value: string) {
  const match = value.trim().match(/^[\s\S]*?[.!?](?=\s|$)/);
  return truncate(match ? match[0] : value, DESCRIPTION_MAX);
}

function dateSummary(dates: string[]) {
  const sorted = [...dates].sort();
  if (sorted.length === 1) return sorted[0];
  return `${sorted.length} dates, ${sorted[0]} to ${sorted[sorted.length - 1]}`;
}

export interface AnnouncementInput {
  hangoutId: string;
  title: string;
  description?: string | null;
  url: string;
  availabilityUrl: string;
  proposedBy?: string | null;
  deadline?: Date | null;
  dates?: string[];
  coverUrl?: string | null;
  /** Locked in: shows the Going / Maybe counts and the attendance buttons (not before). */
  scheduled?: boolean;
  going?: number;
  maybe?: number;
}

export function announcementMessage(input: AnnouncementInput) {
  const fields = [
    ...(input.proposedBy ? [field("Proposed by", name(input.proposedBy), true)] : []),
    ...(input.deadline ? [field("Availability deadline", discordTime(input.deadline))] : []),
    ...(input.dates?.length ? [field("Dates", dateSummary(input.dates), true)] : []),
    ...(input.scheduled
      ? [
          field("Going", String(input.going ?? 0), true),
          field("Maybe", String(input.maybe ?? 0), true),
        ]
      : []),
  ];
  const links = input.scheduled
    ? row(link("Open hangout", input.url))
    : row(link("Open hangout", input.url), link("Fill in availability", input.availabilityUrl));
  return embedMessage(
    {
      title: title(input.title),
      ...(input.description ? { description: firstSentence(input.description) } : {}),
      url: input.url,
      color: COLORS.info,
      fields,
      ...(input.coverUrl ? { image: { url: input.coverUrl } } : {}),
      footer: footer(input.title),
    },
    links,
    ...(input.scheduled
      ? [
          row(
            choice(input.hangoutId, "going", "Going"),
            choice(input.hangoutId, "maybe", "Maybe"),
            choice(input.hangoutId, "not_going", "Not going")
          ),
        ]
      : [])
  );
}

export interface NudgeInput {
  hangoutTitle: string;
  availabilityUrl: string;
  deadline: Date;
  waiting: string[];
}

export function nudgeMessage(input: NudgeInput) {
  const shown = input.waiting.slice(0, MAX_NAMES).map(name);
  const extra = input.waiting.length - shown.length;
  const names = [...shown, ...(extra > 0 ? [`and ${extra} more`] : [])].join(", ");
  return embedMessage(
    {
      title: "Availability needed",
      description: "Availability closes at the deadline below.",
      color: COLORS.action,
      fields: [field("Still waiting on", names)],
      footer: footer(input.hangoutTitle),
      timestamp: input.deadline.toISOString(),
    },
    row(link("Fill in availability", input.availabilityUrl))
  );
}

export type ChangeArea = "Itinerary" | "Costs" | "Carpools";

export interface ChangeInput {
  hangoutTitle: string;
  url: string;
  changes: Array<{ area: ChangeArea; lines: string[] }>;
}

export function changeMessage(input: ChangeInput) {
  const fields = input.changes.map(({ area, lines }) => {
    const shown = lines.slice(0, MAX_LINES).map((line) => truncate(line, LINE_MAX));
    const extra = lines.length - shown.length;
    return field(area, [...shown, ...(extra > 0 ? [`and ${extra} more`] : [])].join("\n"));
  });
  const only = input.changes.length === 1 ? input.changes[0].area.toLowerCase() : null;
  return embedMessage(
    { title: "Hangout updated", color: COLORS.info, fields, footer: footer(input.hangoutTitle) },
    row(link("View changes", only ? `${input.url}#${only}` : input.url))
  );
}

export interface LockInInput {
  hangoutTitle: string;
  url: string;
  startsAt: Date;
  coverUrl?: string | null;
  going: number;
  maybe: number;
}

export function lockInMessage(input: LockInInput) {
  return embedMessage(
    {
      title: "Locked in",
      color: COLORS.confirmed,
      fields: [
        field("When", discordTime(input.startsAt)),
        field("Going", String(input.going), true),
        field("Maybe", String(input.maybe), true),
      ],
      ...(input.coverUrl ? { image: { url: input.coverUrl } } : {}),
      footer: footer(input.hangoutTitle),
      timestamp: input.startsAt.toISOString(),
    },
    row(link("View changes", input.url))
  );
}

export function cancelMessage(input: { hangoutTitle: string }) {
  return embedMessage({
    title: "Cancelled",
    description: `${name(input.hangoutTitle)} has been cancelled.`,
    color: COLORS.cancelled,
    footer: footer(input.hangoutTitle),
  });
}

const METHOD_LABEL = { E_TRANSFER: "e-Transfer", CASH: "Cash" } as const;

export interface PaymentReminderInput {
  hangoutTitle: string;
  item: string;
  amountCents: number;
  collector: string;
  status: string;
  url: string;
}

export function paymentReminderMessage(input: PaymentReminderInput) {
  return embedMessage(
    {
      title: "Payment reminder",
      description: "You have a share still to settle.",
      color: COLORS.action,
      fields: [
        field("Item", input.item, true),
        field("Amount", dollars(input.amountCents), true),
        field("Pay to", name(input.collector), true),
        field("Status", input.status, true),
      ],
      footer: footer(input.hangoutTitle),
    },
    row(link("View my share", input.url))
  );
}

export interface PaymentSentInput {
  hangoutTitle: string;
  payer: string;
  payerAvatarUrl?: string | null;
  item: string;
  amountCents: number;
  method: keyof typeof METHOD_LABEL;
  url: string;
}

export function paymentSentMessage(input: PaymentSentInput) {
  return embedMessage(
    {
      title: "Payment sent",
      description: "Confirm it on the hangout page once it arrives.",
      url: input.url,
      color: COLORS.action,
      author: {
        name: name(input.payer),
        ...(input.payerAvatarUrl ? { icon_url: input.payerAvatarUrl } : {}),
      },
      fields: [
        field("From", name(input.payer), true),
        field("Item", input.item, true),
        field("Amount", dollars(input.amountCents), true),
        field("Method", METHOD_LABEL[input.method], true),
      ],
      footer: footer(input.hangoutTitle),
    },
    row(link("Review payment", input.url))
  );
}

export function ideaReplyMessage(input: { title: string; details?: string | null; url: string }) {
  return embedMessage(
    {
      title: title(input.title),
      description: input.details ? truncate(input.details, DESCRIPTION_MAX) : undefined,
      color: COLORS.info,
      fields: [field("Status", "Added to the idea list")],
      footer: footer(),
    },
    row(link("Open ideas", input.url))
  );
}

export function ideaPostMessage(input: { title: string; proposedBy: string; url: string }) {
  return embedMessage(
    {
      title: title(input.title),
      color: COLORS.info,
      fields: [field("Proposed by", name(input.proposedBy), true)],
      footer: footer(),
    },
    row(link("Open ideas", input.url))
  );
}

export interface BoardAccessInput {
  board: string;
  requester: string;
  requesterAvatarUrl?: string | null;
  project: string;
  url: string;
}

export function boardAccessMessage(input: BoardAccessInput) {
  return embedMessage(
    {
      title: "Board access request",
      description: `${name(input.requester)} wants to join ${name(input.board)} in ${name(input.project)}.`,
      url: input.url,
      color: COLORS.info,
      author: {
        name: name(input.requester),
        ...(input.requesterAvatarUrl ? { icon_url: input.requesterAvatarUrl } : {}),
      },
      fields: [
        field("Board", input.board, true),
        field("Requested by", name(input.requester), true),
        field("Project", input.project, true),
      ],
      footer: footer(),
    },
    row(link("Review request", input.url))
  );
}

export function connectDiscordMessage(input: { url: string }) {
  return embedMessage(
    {
      title: "Connect Discord first",
      description: "Link your Discord account on your profile so the hub knows who you are.",
      color: COLORS.info,
      footer: footer(),
    },
    row(link("Open profile", input.url))
  );
}

/** Ephemeral reply to a Going / Maybe / Not going click (S3-5): the result or why it was refused. */
export function attendanceReplyMessage(input: {
  hangoutTitle: string;
  headline: string;
  detail: string;
  url: string;
  linkLabel: string;
}) {
  return embedMessage(
    {
      title: title(input.headline),
      description: truncate(input.detail, DESCRIPTION_MAX),
      color: COLORS.info,
      footer: footer(input.hangoutTitle),
    },
    row(link(input.linkLabel, input.url))
  );
}
