const API = "https://discord.com/api/v10";

export interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description?: string;
  url?: string;
  fields?: DiscordField[];
  image?: { url: string };
  thumbnail?: { url: string };
  color?: number;
  author?: { name: string; icon_url?: string };
  footer?: { text: string };
  timestamp?: string;
}

export type DiscordButton =
  | { type: 2; style: 5; label: string; url: string }
  | { type: 2; style: 1 | 2 | 3; label: string; custom_id: string };

export interface DiscordRow {
  type: 1;
  components: DiscordButton[];
}

export interface DiscordMessage {
  embeds: DiscordEmbed[];
  components?: DiscordRow[];
}

async function discordCall<T>(method: string, path: string, body: unknown): Promise<T | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  } catch (error) {
    console.error("Discord request failed", error);
    return null;
  }
}

function payload(message: DiscordMessage) {
  return { embeds: message.embeds, components: message.components ?? [] };
}

export async function postToChannel(
  channelId: string,
  message: DiscordMessage
): Promise<string | null> {
  const sent = await discordCall<{ id: string }>(
    "POST",
    `/channels/${channelId}/messages`,
    payload(message)
  );
  return sent?.id ?? null;
}

export async function editMessage(
  channelId: string,
  messageId: string,
  message: DiscordMessage
): Promise<boolean> {
  const edited = await discordCall(
    "PATCH",
    `/channels/${channelId}/messages/${messageId}`,
    payload(message)
  );
  return edited !== null;
}

// A thread started from a message shares that message's id.
export async function startThread(
  channelId: string,
  name: string,
  message: DiscordMessage
): Promise<{ threadId: string; messageId: string } | null> {
  const messageId = await postToChannel(channelId, message);
  if (!messageId) return null;
  const thread = await discordCall<{ id: string }>(
    "POST",
    `/channels/${channelId}/messages/${messageId}/threads`,
    { name }
  );
  return thread ? { threadId: thread.id, messageId } : null;
}

export async function renameThread(threadId: string, name: string): Promise<boolean> {
  return (await discordCall("PATCH", `/channels/${threadId}`, { name })) !== null;
}

// ponytail: one DM = two REST calls, no DM-channel cache; add one if admins grow past a handful.
export async function sendDiscordDm(discordId: string, message: DiscordMessage): Promise<boolean> {
  const channel = await discordCall<{ id: string }>("POST", "/users/@me/channels", {
    recipient_id: discordId,
  });
  if (!channel) return false;
  return (await postToChannel(channel.id, message)) !== null;
}
