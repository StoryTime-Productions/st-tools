import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  editMessage,
  postToChannel,
  renameThread,
  sendDiscordDm,
  startThread,
} from "@/lib/discord";

const MESSAGE = {
  embeds: [{ title: "Board access request", description: "Alice wants in" }],
  components: [
    {
      type: 1 as const,
      components: [
        {
          type: 2 as const,
          style: 5 as const,
          label: "Review request",
          url: "https://tools.test/hub",
        },
      ],
    },
  ],
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
      .mockResolvedValueOnce(reply(200, { id: "m-1" }));

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
      components: MESSAGE.components,
    });
  });

  it("sends no components without a button", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { id: "dm-1" }))
      .mockResolvedValueOnce(reply(200, { id: "m-1" }));

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

describe("channel REST layer", () => {
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

  it("posts to a channel and returns the message id", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { id: "m-1" }));

    await expect(postToChannel("c-1", MESSAGE)).resolves.toBe("m-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://discord.com/api/v10/channels/c-1/messages");
    expect(init.method).toBe("POST");
  });

  it("returns null without a token or on failure", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "");
    await expect(postToChannel("c-1", MESSAGE)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
    fetchMock.mockResolvedValueOnce(reply(403, {}));
    await expect(postToChannel("c-1", MESSAGE)).resolves.toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(postToChannel("c-1", MESSAGE)).resolves.toBeNull();
  });

  it("edits a message in place", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, {}));
    await expect(editMessage("c-1", "m-1", MESSAGE)).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://discord.com/api/v10/channels/c-1/messages/m-1");
    expect(init.method).toBe("PATCH");

    fetchMock.mockResolvedValueOnce(reply(404, {}));
    await expect(editMessage("c-1", "m-1", MESSAGE)).resolves.toBe(false);
  });

  it("starts a thread from the opener message", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { id: "m-1" }))
      .mockResolvedValueOnce(reply(200, { id: "m-1" }));

    await expect(startThread("c-1", "Movie night", MESSAGE)).resolves.toEqual({
      threadId: "m-1",
      messageId: "m-1",
    });

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://discord.com/api/v10/channels/c-1/messages/m-1/threads");
    expect(JSON.parse(init.body)).toEqual({ name: "Movie night" });
  });

  it("renames a thread", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { id: "t-1" }));
    await expect(renameThread("t-1", "Movie night · Oct 3")).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://discord.com/api/v10/channels/t-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ name: "Movie night · Oct 3" });

    fetchMock.mockResolvedValueOnce(reply(403, {}));
    await expect(renameThread("t-1", "x")).resolves.toBe(false);
  });

  it("returns null when the opener or the thread fails", async () => {
    fetchMock.mockResolvedValueOnce(reply(500, {}));
    await expect(startThread("c-1", "x", MESSAGE)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock
      .mockResolvedValueOnce(reply(200, { id: "m-1" }))
      .mockResolvedValueOnce(reply(403, {}));
    await expect(startThread("c-1", "x", MESSAGE)).resolves.toBeNull();
  });
});
