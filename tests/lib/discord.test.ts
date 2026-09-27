import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendDiscordDm } from "@/lib/discord";

const MESSAGE = {
  embeds: [{ title: "Board access request", description: "Alice wants in" }],
  linkButton: { label: "Review request", url: "https://tools.test/hub" },
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

describe("sendDiscordDm", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
    fetchMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does nothing without a bot token", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "");

    await expect(sendDiscordDm("123", MESSAGE)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens a DM channel and posts the embed with a link button", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { id: "dm-1" }))
      .mockResolvedValueOnce(reply(200, {}));

    await expect(sendDiscordDm("123", MESSAGE)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://discord.com/api/v10/users/@me/channels",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bot bot-token" }),
        body: JSON.stringify({ recipient_id: "123" }),
      })
    );
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://discord.com/api/v10/channels/dm-1/messages");
    expect(JSON.parse(init.body)).toEqual({
      embeds: MESSAGE.embeds,
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: "Review request", url: "https://tools.test/hub" },
          ],
        },
      ],
    });
  });

  it("sends no components without a button", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { id: "dm-1" }))
      .mockResolvedValueOnce(reply(200, {}));

    await sendDiscordDm("123", { embeds: MESSAGE.embeds });

    expect(JSON.parse(fetchMock.mock.calls[1][1].body).components).toEqual([]);
  });

  it("reports failures instead of throwing", async () => {
    fetchMock.mockResolvedValueOnce(reply(403, { code: 50007 }));
    await expect(sendDiscordDm("123", MESSAGE)).resolves.toBe(false);

    fetchMock
      .mockResolvedValueOnce(reply(200, { id: "dm-1" }))
      .mockResolvedValueOnce(reply(429, { retry_after: 1 }));
    await expect(sendDiscordDm("123", MESSAGE)).resolves.toBe(false);

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(sendDiscordDm("123", MESSAGE)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledTimes(3);
  });
});
