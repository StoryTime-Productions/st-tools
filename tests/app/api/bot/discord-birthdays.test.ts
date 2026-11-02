import { beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  const replaceBirthdays = vi.fn().mockResolvedValue(2);
  vi.doMock("@/lib/discord-ingest", async () => ({
    ...(await vi.importActual<typeof import("@/lib/discord-ingest")>("@/lib/discord-ingest")),
    replaceBirthdays,
  }));
  vi.doMock("@/lib/prisma", () => ({ prisma: {} }));
  return { route: await import("@/app/api/bot/discord/birthdays/route"), replaceBirthdays };
}

function post(body: unknown, auth: string | null = "Bearer s3cret") {
  return new Request("https://tools.test/api/bot/discord/birthdays", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const BODY = {
  birthdays: [
    { discordId: "1", name: "Kiara", avatarUrl: "https://cdn.test/a.png", month: 11, day: 14 },
    { discordId: "2", name: "Denmar", month: 2, day: 29 },
  ],
};

describe("birthdays bot API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("BOT_API_SECRET", "s3cret");
  });

  it("rejects callers without the bot secret before doing any work", async () => {
    const { route, replaceBirthdays } = await load();
    expect((await route.POST(post(BODY, null))).status).toBe(401);
    expect((await route.POST(post(BODY, "Bearer nope"))).status).toBe(401);
    expect(replaceBirthdays).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies and dates that do not exist", async () => {
    const { route, replaceBirthdays } = await load();
    expect((await route.POST(post("not json"))).status).toBe(400);
    expect(
      (await route.POST(post({ birthdays: [{ discordId: "x", name: "A", month: 1, day: 1 }] })))
        .status
    ).toBe(400);
    expect(
      (await route.POST(post({ birthdays: [{ discordId: "1", name: "A", month: 2, day: 30 }] })))
        .status
    ).toBe(400);
    expect(
      (await route.POST(post({ birthdays: [{ discordId: "1", name: "A", month: 13, day: 1 }] })))
        .status
    ).toBe(400);
    expect(replaceBirthdays).not.toHaveBeenCalled();
  });

  it("accepts the full list, including Feb 29 and an empty list", async () => {
    const { route, replaceBirthdays } = await load();
    const response = await route.POST(post(BODY));
    expect(await response.json()).toEqual({ ok: true, result: 2 });
    expect(replaceBirthdays).toHaveBeenCalledWith(BODY);

    expect((await route.POST(post({ birthdays: [] }))).status).toBe(200);
  });
});
