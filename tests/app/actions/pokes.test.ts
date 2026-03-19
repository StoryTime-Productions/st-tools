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

function buildActor(id: string, name = "Owner"): MockedUser {
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

async function loadPokesModule() {
  const getCurrentUser = vi.fn();
  const findUnique = vi.fn();

  vi.doMock("@/lib/get-current-user", () => ({
    getCurrentUser,
  }));

  vi.doMock("@/lib/prisma", () => ({
    prisma: {
      user: {
        findUnique,
      },
    },
  }));

  const { sendPokeAction } = await import("@/app/actions/pokes");

  return {
    sendPokeAction,
    getCurrentUser,
    findUnique,
  };
}

describe("sendPokeAction", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T12:00:00.000Z"));
  });

  it("rejects invalid payload", async () => {
    const { sendPokeAction } = await loadPokesModule();

    const result = await sendPokeAction({ targetUserId: "not-a-uuid" });

    expect(result).toEqual({ error: "Invalid poke request." });
  });

  it("requires authentication", async () => {
    const { sendPokeAction, getCurrentUser } = await loadPokesModule();

    getCurrentUser.mockResolvedValue(null);

    const result = await sendPokeAction({
      targetUserId: "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toEqual({ error: "Not authenticated." });
  });

  it("rejects self poke", async () => {
    const { sendPokeAction, getCurrentUser } = await loadPokesModule();

    getCurrentUser.mockResolvedValue(buildActor("11111111-1111-4111-8111-111111111111"));

    const result = await sendPokeAction({
      targetUserId: "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toEqual({ error: "You cannot poke yourself." });
  });

  it("rejects unknown target user", async () => {
    const { sendPokeAction, getCurrentUser, findUnique } = await loadPokesModule();

    getCurrentUser.mockResolvedValue(buildActor("11111111-1111-4111-8111-111111111111"));
    findUnique.mockResolvedValue(null);

    const result = await sendPokeAction({
      targetUserId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result).toEqual({ error: "That user is no longer available." });
  });

  it("returns success payload with fallback name", async () => {
    const { sendPokeAction, getCurrentUser, findUnique } = await loadPokesModule();

    getCurrentUser.mockResolvedValue({
      ...buildActor("11111111-1111-4111-8111-111111111111", "   "),
      email: "owner@example.com",
      avatarUrl: "https://example.com/avatar.png",
    });
    findUnique.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" });

    const result = await sendPokeAction({
      targetUserId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result).toEqual({
      success: true,
      payload: {
        pokeId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        ),
        fromUserId: "11111111-1111-4111-8111-111111111111",
        fromName: "owner@example.com",
        fromAvatarUrl: "https://example.com/avatar.png",
        toUserId: "22222222-2222-4222-8222-222222222222",
        createdAt: "2026-03-18T12:00:00.000Z",
      },
    });
  });

  it("enforces per-target cooldown", async () => {
    const { sendPokeAction, getCurrentUser, findUnique } = await loadPokesModule();

    getCurrentUser.mockResolvedValue(buildActor("11111111-1111-4111-8111-111111111111"));
    findUnique.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" });

    const first = await sendPokeAction({
      targetUserId: "22222222-2222-4222-8222-222222222222",
    });
    const second = await sendPokeAction({
      targetUserId: "22222222-2222-4222-8222-222222222222",
    });

    expect(first).toMatchObject({ success: true });
    expect(second).toEqual({
      error: "You can poke this user again in 5s.",
      retryAfterSeconds: 5,
    });
  });

  it("allows poke again after cooldown elapses", async () => {
    const { sendPokeAction, getCurrentUser, findUnique } = await loadPokesModule();

    getCurrentUser.mockResolvedValue(buildActor("11111111-1111-4111-8111-111111111111"));
    findUnique.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" });

    const first = await sendPokeAction({
      targetUserId: "22222222-2222-4222-8222-222222222222",
    });

    vi.advanceTimersByTime(5000);

    const second = await sendPokeAction({
      targetUserId: "22222222-2222-4222-8222-222222222222",
    });

    expect(first).toMatchObject({ success: true });
    expect(second).toMatchObject({ success: true });
  });

  it("enforces sender window limit across multiple targets", async () => {
    const { sendPokeAction, getCurrentUser, findUnique } = await loadPokesModule();

    getCurrentUser.mockResolvedValue(buildActor("11111111-1111-4111-8111-111111111111"));

    findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
    }));

    const targetIds = [
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
      "77777777-7777-4777-8777-777777777777",
    ];

    for (const targetUserId of targetIds.slice(0, 5)) {
      const result = await sendPokeAction({ targetUserId });
      expect(result).toMatchObject({ success: true });
    }

    const blocked = await sendPokeAction({ targetUserId: targetIds[5] });

    expect(blocked).toEqual({
      error: "You're poking too fast. Try again in 60s.",
      retryAfterSeconds: 60,
    });
  });

  it("allows sender again after rolling window passes", async () => {
    const { sendPokeAction, getCurrentUser, findUnique } = await loadPokesModule();

    getCurrentUser.mockResolvedValue(buildActor("11111111-1111-4111-8111-111111111111"));

    findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
    }));

    await sendPokeAction({ targetUserId: "22222222-2222-4222-8222-222222222222" });
    await sendPokeAction({ targetUserId: "33333333-3333-4333-8333-333333333333" });
    await sendPokeAction({ targetUserId: "44444444-4444-4444-8444-444444444444" });
    await sendPokeAction({ targetUserId: "55555555-5555-4555-8555-555555555555" });
    await sendPokeAction({ targetUserId: "66666666-6666-4666-8666-666666666666" });

    vi.advanceTimersByTime(60000);

    const result = await sendPokeAction({
      targetUserId: "77777777-7777-4777-8777-777777777777",
    });

    expect(result).toMatchObject({ success: true });
  });
});
