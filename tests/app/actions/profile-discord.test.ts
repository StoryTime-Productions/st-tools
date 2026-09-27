import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadModule() {
  const auth = {
    linkIdentity: vi.fn(),
    getUser: vi.fn(),
    unlinkIdentity: vi.fn().mockResolvedValue({ error: null }),
  };
  const update = vi.fn();
  const revalidatePath = vi.fn();
  const redirect = vi.fn();
  const requestHeaders = new Headers({ origin: "https://tools.test" });

  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("next/headers", () => ({ headers: vi.fn(async () => requestHeaders) }));
  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth })) }));
  vi.doMock("@/lib/prisma", () => ({ prisma: { user: { update } } }));

  const actions = await import("@/app/actions/profile");
  return { ...actions, auth, update, revalidatePath, redirect, requestHeaders };
}

describe("Discord link actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("starts Discord identity linking and redirects to Discord", async () => {
    const m = await loadModule();
    m.auth.linkIdentity.mockResolvedValueOnce({
      data: { url: "https://discord.com/oauth2/authorize?x" },
      error: null,
    });

    await m.connectDiscordAction();

    expect(m.auth.linkIdentity).toHaveBeenCalledWith({
      provider: "discord",
      options: {
        redirectTo: "https://tools.test/auth/callback?next=/settings/profile",
        skipBrowserRedirect: true,
      },
    });
    expect(m.redirect).toHaveBeenCalledWith("https://discord.com/oauth2/authorize?x");
  });

  it("reports linking errors", async () => {
    const m = await loadModule();
    m.requestHeaders.delete("origin");
    m.auth.linkIdentity.mockResolvedValueOnce({
      data: { url: null },
      error: { message: "Manual linking is disabled" },
    });
    await expect(m.connectDiscordAction()).resolves.toEqual({
      error: "Manual linking is disabled",
    });
    expect(m.auth.linkIdentity.mock.calls[0][0].options.redirectTo).toMatch(
      /\/auth\/callback\?next=\/settings\/profile$/
    );

    m.auth.linkIdentity.mockResolvedValueOnce({ data: { url: null }, error: null });
    await expect(m.connectDiscordAction()).resolves.toEqual({
      error: "Could not start Discord linking",
    });
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it("unlinks Discord and clears the stored id", async () => {
    const m = await loadModule();

    m.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(m.disconnectDiscordAction()).resolves.toEqual({ error: "Not authenticated" });

    const discord = { provider: "discord", identity_id: "i2" };
    const user = { id: "u1", identities: [{ provider: "email" }, discord] };
    m.auth.getUser.mockResolvedValue({ data: { user } });
    m.auth.unlinkIdentity.mockResolvedValueOnce({ error: { message: "Needs 2 identities" } });
    await expect(m.disconnectDiscordAction()).resolves.toEqual({ error: "Needs 2 identities" });
    expect(m.update).not.toHaveBeenCalled();

    await expect(m.disconnectDiscordAction()).resolves.toEqual({ success: true });
    expect(m.auth.unlinkIdentity).toHaveBeenLastCalledWith(discord);
    expect(m.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { discordId: null } });
    expect(m.revalidatePath).toHaveBeenCalledWith("/settings/profile");

    m.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    m.auth.unlinkIdentity.mockClear();
    await expect(m.disconnectDiscordAction()).resolves.toEqual({ success: true });
    expect(m.auth.unlinkIdentity).not.toHaveBeenCalled();
  });
});
