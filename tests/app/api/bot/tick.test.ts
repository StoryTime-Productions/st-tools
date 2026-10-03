import { beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  const sendNudges = vi.fn().mockResolvedValue(1);
  const flushUpdates = vi.fn().mockResolvedValue(2);
  const sendPaymentReminders = vi.fn().mockResolvedValue(3);
  vi.doMock("@/lib/bot-tick", () => ({ sendNudges, flushUpdates, sendPaymentReminders }));
  vi.doMock("@/lib/hangout-discord", () => ({ siteUrl: async () => "https://tools.test" }));
  const route = await import("@/app/api/bot/tick/route");
  return { route, sendNudges, flushUpdates, sendPaymentReminders };
}

const tick = (auth: string | null) =>
  new Request("https://tools.test/api/bot/tick", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });

describe("POST /api/bot/tick", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("BOT_API_SECRET", "s3cret");
  });

  it("rejects callers without the secret before running any rule", async () => {
    const mod = await load();

    expect((await mod.route.POST(tick(null))).status).toBe(401);
    expect((await mod.route.POST(tick("Bearer nope"))).status).toBe(401);
    expect(mod.sendNudges).not.toHaveBeenCalled();
    expect(mod.flushUpdates).not.toHaveBeenCalled();
    expect(mod.sendPaymentReminders).not.toHaveBeenCalled();
  });

  it("runs the three rules and reports how many messages each sent", async () => {
    const mod = await load();

    const res = await mod.route.POST(tick("Bearer s3cret"));

    expect(await res.json()).toEqual({ ok: true, nudges: 1, updates: 2, reminders: 3 });
    expect(mod.sendNudges).toHaveBeenCalledWith("https://tools.test");
    expect(mod.flushUpdates).toHaveBeenCalledWith("https://tools.test");
    expect(mod.sendPaymentReminders).toHaveBeenCalledWith("https://tools.test");
  });
});
