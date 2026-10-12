import { beforeEach, describe, expect, it, vi } from "vitest";

type Geocode = typeof import("@/lib/tomtom").geocodeAddress;

const HANGOUT_ID = "22222222-2222-4222-8222-222222222222";
const user = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Dana",
  email: "dana@x.test",
  homeAddress: "1 Main St",
  homeLat: 10,
  homeLon: 20,
};

async function loadModule() {
  const revalidatePath = vi.fn();
  const getCurrentUser = vi.fn().mockResolvedValue(user);
  const geocodeAddress = vi.fn<Geocode>(async (query) => ({
    address: `${query} (found)`,
    lat: 1,
    lon: 2,
  }));
  const prisma = {
    hangoutAttendee: { findFirst: vi.fn().mockResolvedValue({ userId: user.id }) },
    hangoutCar: { findFirst: vi.fn().mockResolvedValue(null) },
    hangoutPassenger: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    hangoutTransit: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  vi.doMock("@/lib/tomtom", () => ({ geocodeAddress }));
  const recomputeRoutes = vi.fn();
  const queueUpdate = vi.fn();
  vi.doMock("@/lib/hangout-updates", () => ({ queueUpdate }));
  vi.doMock("@/lib/routes", () => ({ recomputeRoutes }));
  const hangoutEnded = vi.fn().mockResolvedValue(false);
  vi.doMock("@/lib/hangouts", () => ({ hangoutEnded }));
  const actions = await import("@/app/actions/hangout-transit");
  return {
    ...actions,
    revalidatePath,
    getCurrentUser,
    geocodeAddress,
    prisma,
    recomputeRoutes,
    queueUpdate,
    hangoutEnded,
  };
}

const key = (direction: "PICKUP" | "DROPOFF") => ({
  hangoutId: HANGOUT_ID,
  userId: user.id,
  direction,
});

describe("transit actions", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("marks getting there as transit from a located start (R4)", async () => {
    const mod = await loadModule();

    await expect(
      mod.setTransitAction(HANGOUT_ID, "PICKUP", { start: " 5 Rue Start " })
    ).resolves.toEqual({ success: true });

    const data = {
      startAddress: "5 Rue Start (found)",
      startLat: 1,
      startLon: 2,
      destAddress: null,
      destLat: null,
      destLon: null,
    };
    expect(mod.geocodeAddress).toHaveBeenCalledWith("5 Rue Start");
    expect(mod.prisma.hangoutTransit.upsert).toHaveBeenCalledWith({
      where: { hangoutId_userId_direction: key("PICKUP") },
      create: { ...key("PICKUP"), ...data },
      update: data,
    });
    expect(mod.queueUpdate).toHaveBeenCalledWith(
      HANGOUT_ID,
      "Carpools",
      "—",
      "Dana takes public transit (getting there)"
    );
    expect(mod.revalidatePath).toHaveBeenCalledWith(`/hub/hangouts/${HANGOUT_ID}`);
  });

  it("needs a destination for getting home, and ignores one for getting there", async () => {
    const mod = await loadModule();

    await expect(
      mod.setTransitAction(HANGOUT_ID, "DROPOFF", { start: "Bar", destination: "  " })
    ).resolves.toEqual({ error: "Add an address" });
    await expect(mod.setTransitAction(HANGOUT_ID, "DROPOFF", { start: "Bar" })).resolves.toEqual({
      error: "Add an address",
    });
    expect(mod.prisma.hangoutTransit.upsert).not.toHaveBeenCalled();

    await mod.setTransitAction(HANGOUT_ID, "DROPOFF", { start: "Bar", destination: "7 Home Rd" });
    expect(mod.prisma.hangoutTransit.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          destAddress: "7 Home Rd (found)",
          destLat: 1,
          destLon: 2,
        }),
      })
    );
    expect(mod.queueUpdate).toHaveBeenLastCalledWith(
      HANGOUT_ID,
      "Carpools",
      "—",
      "Dana takes public transit (getting home)"
    );

    await mod.setTransitAction(HANGOUT_ID, "PICKUP", { start: "Bar", destination: "7 Home Rd" });
    expect(mod.prisma.hangoutTransit.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ destAddress: null }) })
    );
  });

  it("reuses the profile home without a lookup", async () => {
    const mod = await loadModule();

    await mod.setTransitAction(HANGOUT_ID, "DROPOFF", {
      start: "Bar",
      destination: "1 Main St",
    });

    expect(mod.geocodeAddress).toHaveBeenCalledTimes(1);
    expect(mod.prisma.hangoutTransit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ destAddress: "1 Main St", destLat: 10, destLon: 20 }),
      })
    );

    // A home saved without coordinates still has to be looked up.
    mod.getCurrentUser.mockResolvedValue({ ...user, homeLat: null, homeLon: null });
    await mod.setTransitAction(HANGOUT_ID, "PICKUP", { start: "1 Main St" });
    expect(mod.geocodeAddress).toHaveBeenLastCalledWith("1 Main St");
  });

  it("rejects an address that can't be found and saves nothing (AC6)", async () => {
    const mod = await loadModule();

    for (const result of ["no-match", null] as const) {
      mod.geocodeAddress.mockResolvedValueOnce(result);
      await expect(mod.setTransitAction(HANGOUT_ID, "PICKUP", { start: "zzqq" })).resolves.toEqual({
        error: "Couldn't find that address",
      });
    }
    mod.geocodeAddress.mockResolvedValueOnce({ address: "Bar", lat: 1, lon: 2 });
    mod.geocodeAddress.mockResolvedValueOnce("no-match");
    await expect(
      mod.setTransitAction(HANGOUT_ID, "DROPOFF", { start: "Bar", destination: "zzqq" })
    ).resolves.toEqual({ error: "Couldn't find that address" });
    expect(mod.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("takes the caller off that direction's car lists, and re-routes only then (AC6)", async () => {
    const mod = await loadModule();

    await mod.setTransitAction(HANGOUT_ID, "PICKUP", { start: "Bar" });
    expect(mod.prisma.hangoutPassenger.deleteMany).toHaveBeenCalledWith({
      where: {
        hangoutId: HANGOUT_ID,
        direction: "PICKUP",
        OR: [{ userId: user.id }, { viaUserId: user.id }],
      },
    });
    expect(mod.recomputeRoutes).not.toHaveBeenCalled();

    mod.prisma.hangoutPassenger.deleteMany.mockResolvedValueOnce({ count: 1 });
    await mod.setTransitAction(HANGOUT_ID, "PICKUP", { start: "Bar" });
    expect(mod.recomputeRoutes).toHaveBeenCalledWith(HANGOUT_ID);
  });

  it("doesn't announce a change to an existing choice again", async () => {
    const mod = await loadModule();
    mod.prisma.hangoutTransit.findUnique.mockResolvedValue({ id: "t1" });

    await mod.setTransitAction(HANGOUT_ID, "PICKUP", { start: "Bar" });

    expect(mod.prisma.hangoutTransit.upsert).toHaveBeenCalled();
    expect(mod.queueUpdate).not.toHaveBeenCalled();
  });

  it("is for Going members of a scheduled hangout who aren't driving", async () => {
    const mod = await loadModule();
    const set = () => mod.setTransitAction(HANGOUT_ID, "PICKUP", { start: "Bar" });

    mod.prisma.hangoutCar.findFirst.mockResolvedValueOnce({ id: "own" });
    await expect(set()).resolves.toEqual({ error: "You're driving your own car" });
    mod.prisma.hangoutAttendee.findFirst.mockResolvedValueOnce(null);
    await expect(set()).resolves.toEqual({ error: "Only people going can drive or ride" });
    mod.hangoutEnded.mockResolvedValueOnce(true);
    await expect(set()).resolves.toEqual({ error: "This hangout has already ended" });
    mod.getCurrentUser.mockResolvedValueOnce(null);
    await expect(set()).resolves.toEqual({ error: "Unauthorized" });
    expect(mod.prisma.hangoutTransit.upsert).not.toHaveBeenCalled();
  });

  it("checks the input", async () => {
    const mod = await loadModule();

    await expect(mod.setTransitAction("nope", "PICKUP", { start: "Bar" })).resolves.toEqual({
      error: "Hangout not found",
    });
    await expect(
      mod.setTransitAction(HANGOUT_ID, "SIDEWAYS" as never, { start: "Bar" })
    ).resolves.toEqual({ error: "That isn't a valid trip" });
    await expect(mod.setTransitAction(HANGOUT_ID, "PICKUP", { start: " " })).resolves.toEqual({
      error: "Add an address",
    });
    await expect(
      mod.setTransitAction(HANGOUT_ID, "PICKUP", { start: "x".repeat(301) })
    ).resolves.toEqual({ error: "Address is too long" });
    expect(mod.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("names people without a display name by their email", async () => {
    const mod = await loadModule();
    mod.getCurrentUser.mockResolvedValue({ ...user, name: null });

    await mod.setTransitAction(HANGOUT_ID, "PICKUP", { start: "Bar" });

    expect(mod.queueUpdate).toHaveBeenCalledWith(
      HANGOUT_ID,
      "Carpools",
      "—",
      "dana takes public transit (getting there)"
    );
  });

  describe("clearing", () => {
    it("removes the choice and says so once", async () => {
      const mod = await loadModule();

      await expect(mod.clearTransitAction(HANGOUT_ID, "DROPOFF")).resolves.toEqual({
        success: true,
      });
      expect(mod.prisma.hangoutTransit.deleteMany).toHaveBeenCalledWith({
        where: { hangoutId: HANGOUT_ID, userId: user.id, direction: "DROPOFF" },
      });
      expect(mod.queueUpdate).toHaveBeenCalledWith(
        HANGOUT_ID,
        "Carpools",
        "—",
        "Dana no longer takes public transit (getting home)"
      );

      mod.queueUpdate.mockClear();
      mod.prisma.hangoutTransit.deleteMany.mockResolvedValueOnce({ count: 0 });
      await mod.clearTransitAction(HANGOUT_ID, "DROPOFF");
      expect(mod.queueUpdate).not.toHaveBeenCalled();
    });

    it("is for Going members, with valid input", async () => {
      const mod = await loadModule();

      await expect(mod.clearTransitAction("nope", "PICKUP")).resolves.toEqual({
        error: "Hangout not found",
      });
      await expect(mod.clearTransitAction(HANGOUT_ID, "SIDEWAYS" as never)).resolves.toEqual({
        error: "That isn't a valid trip",
      });
      mod.prisma.hangoutAttendee.findFirst.mockResolvedValueOnce(null);
      await expect(mod.clearTransitAction(HANGOUT_ID, "PICKUP")).resolves.toEqual({
        error: "Only people going can drive or ride",
      });
      expect(mod.prisma.hangoutTransit.deleteMany).not.toHaveBeenCalled();
    });
  });
});
