const API = "https://discord.com/api/v10";

export interface DiscordEmbed {
  title: string;
  description: string;
  url?: string;
  color?: number;
  author?: { name: string; icon_url?: string };
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordMessage {
  embeds: DiscordEmbed[];
  linkButton?: { label: string; url: string };
}

// ponytail: one DM = two REST calls, no DM-channel cache; add one if admins grow past a handful.
export async function sendDiscordDm(discordId: string, message: DiscordMessage): Promise<boolean> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return false;

  const headers = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
  try {
    const channel = await fetch(`${API}/users/@me/channels`, {
      method: "POST",
      headers,
      body: JSON.stringify({ recipient_id: discordId }),
    });
    if (!channel.ok) throw new Error(`open DM ${channel.status}: ${await channel.text()}`);
    const { id } = (await channel.json()) as { id: string };

    const sent = await fetch(`${API}/channels/${id}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        embeds: message.embeds,
        components: message.linkButton
          ? [{ type: 1, components: [{ type: 2, style: 5, ...message.linkButton }] }]
          : [],
      }),
    });
    if (!sent.ok) throw new Error(`send DM ${sent.status}: ${await sent.text()}`);
    return true;
  } catch (error) {
    console.error("Discord DM failed", error);
    return false;
  }
}
