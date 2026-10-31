import { beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  const ingest = {
    applyVoiceEvent: vi.fn().mockResolvedValue({ closed: 0, opened: 1 }),
    recordMessages: vi.fn().mockResolvedValue(1),
    recordWordleStreak: vi.fn().mockResolvedValue(undefined),
  };
  vi.doMock("@/lib/discord-ingest", async () => ({
    ...(await vi.importActual<typeof import("@/lib/discord-ingest")>("@/lib/discord-ingest")),
    ...ingest,
  }));
  vi.doMock("@/lib/prisma", () => ({ prisma: {} }));
  return {
    voice: await import("@/app/api/bot/discord/voice/route"),
    messages: await import("@/app/api/bot/discord/messages/route"),
    wordle: await import("@/app/api/bot/discord/wordle/route"),
    ingest,
  };
}

function post(body: unknown, auth: string | null = "Bearer s3cret") {
  return new Request("https://tools.test/api/bot/discord/x", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VOICE = { type: "join", discordId: "1", name: "Kiara", channelId: "10", channelName: "D&D" };
const MESSAGES = { entries: [{ discordId: "1", name: "Kiara", day: "2026-10-30", count: 2 }] };
const WORDLE = { streak: 80, postedOn: "2026-10-30" };

describe("discord stats bot API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("BOT_API_SECRET", "s3cret");
  });

  it("rejects callers without the bot secret before doing any work", async () => {
    const mod = await load();

    for (const [route, body] of [
      [mod.voice, VOICE],
      [mod.messages, MESSAGES],
      [mod.wordle, WORDLE],
    ] as const) {
      expect((await route.POST(post(body, null))).status).toBe(401);
      expect((await route.POST(post(body, "Bearer nope"))).status).toBe(401);
    }
    expect(mod.ingest.applyVoiceEvent).not.toHaveBeenCalled();
    expect(mod.ingest.recordMessages).not.toHaveBeenCalled();
    expect(mod.ingest.recordWordleStreak).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies with 400", async () => {
    const mod = await load();

    expect((await mod.voice.POST(post({ type: "join" }))).status).toBe(400);
    expect((await mod.messages.POST(post({ entries: [] }))).status).toBe(400);
    expect((await mod.wordle.POST(post("not json"))).status).toBe(400);
  });

  it("passes valid events through and reports the result", async () => {
    const mod = await load();

    const voice = await mod.voice.POST(post(VOICE));
    expect(await voice.json()).toEqual({ ok: true, result: { closed: 0, opened: 1 } });
    expect(mod.ingest.applyVoiceEvent).toHaveBeenCalledWith(expect.objectContaining(VOICE));

    const messages = await mod.messages.POST(post(MESSAGES));
    expect(await messages.json()).toEqual({ ok: true, result: 1 });
    expect(mod.ingest.recordMessages).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "add" })
    );

    expect((await mod.wordle.POST(post(WORDLE))).status).toBe(200);
    expect(mod.ingest.recordWordleStreak).toHaveBeenCalledWith(WORDLE);
  });
});
