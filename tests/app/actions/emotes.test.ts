import { beforeEach, describe, expect, it, vi } from "vitest";

type MockedUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "ADMIN" | "MEMBER";
  createdAt: Date;
  updatedAt: Date;
};

function buildActor(id: string, name: string | null = "Alice"): MockedUser {
  return {
    id,
    email: `${id}@example.com`,
    name,
    avatarUrl: null,
    role: "MEMBER",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function loadEmotesModule() {
  const getCurrentUser = vi.fn();

  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));

  const { sendEmoteAction } = await import("@/app/actions/emotes");

  return { sendEmoteAction, getCurrentUser };
}

describe("sendEmoteAction", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T12:00:00.000Z"));
  });

  it("rejects invalid emote id", async () => {
    const { sendEmoteAction } = await loadEmotesModule();

    const result = await sendEmoteAction({ emoteId: "not-an-emote" as never });

    expect(result).toEqual({ error: "Invalid emote." });
  });

  it("requires authentication", async () => {
    const { sendEmoteAction, getCurrentUser } = await loadEmotesModule();

    getCurrentUser.mockResolvedValue(null);

    const result = await sendEmoteAction({ emoteId: "locked-in" });

    expect(result).toEqual({ error: "Not authenticated." });
  });

  it("returns success payload with correct fields", async () => {
    const { sendEmoteAction, getCurrentUser } = await loadEmotesModule();
    const actor = buildActor("user-1", "Alice");
    getCurrentUser.mockResolvedValue(actor);

    const result = await sendEmoteAction({ emoteId: "locked-in" });

    expect(result).toMatchObject({
      success: true,
      payload: {
        emoteId: "locked-in",
        fromUserId: "user-1",
        fromName: "Alice",
        fromAvatarUrl: null,
      },
    });
    expect("payload" in result && result.payload.createdAt).toBeTruthy();
  });

  it("uses email as fromName when name is null", async () => {
    const { sendEmoteAction, getCurrentUser } = await loadEmotesModule();
    const actor = buildActor("user-2", null);
    getCurrentUser.mockResolvedValue(actor);

    const result = await sendEmoteAction({ emoteId: "burnt-out" });

    expect("payload" in result && result.payload.fromName).toBe("user-2@example.com");
  });

  it("enforces per-user cooldown between emotes", async () => {
    const { sendEmoteAction, getCurrentUser } = await loadEmotesModule();
    const actor = buildActor("user-3");
    getCurrentUser.mockResolvedValue(actor);

    await sendEmoteAction({ emoteId: "locked-in" });

    vi.advanceTimersByTime(2000);

    const result = await sendEmoteAction({ emoteId: "crashing-out" });

    expect(result).toMatchObject({
      error: expect.stringContaining("Wait"),
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("allows emoting again after cooldown expires", async () => {
    const { sendEmoteAction, getCurrentUser } = await loadEmotesModule();
    const actor = buildActor("user-4");
    getCurrentUser.mockResolvedValue(actor);

    await sendEmoteAction({ emoteId: "locked-in" });

    vi.advanceTimersByTime(5001);

    const result = await sendEmoteAction({ emoteId: "doom-scrolling" });

    expect(result).toMatchObject({ success: true });
  });

  it("enforces window rate limit after many emotes", async () => {
    const { sendEmoteAction, getCurrentUser } = await loadEmotesModule();
    const actor = buildActor("user-5");
    getCurrentUser.mockResolvedValue(actor);

    for (let i = 0; i < 10; i += 1) {
      vi.advanceTimersByTime(5001);
      await sendEmoteAction({ emoteId: "locked-in" });
    }

    vi.advanceTimersByTime(5001);
    const result = await sendEmoteAction({ emoteId: "locked-in" });

    expect(result).toMatchObject({
      error: expect.stringContaining("too fast"),
      retryAfterSeconds: expect.any(Number),
    });
  });
});
