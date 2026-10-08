import { beforeEach, describe, expect, it, vi } from "vitest";

type Locate = typeof import("@/lib/tomtom").locateAddress;

const HANGOUT_ID = "22222222-2222-4222-8222-222222222222";
const CAR_ID = "77777777-7777-4777-8777-777777777777";
const admin = { id: "33333333-3333-4333-8333-333333333333", role: "ADMIN" };
const driver = {
  id: "44444444-4444-4444-8444-444444444444",
  role: "MEMBER",
  name: "Dana",
  email: "dana@x.test",
  homeAddress: "1 Main St",
};
const rider = {
  id: "55555555-5555-4555-8555-555555555555",
  role: "MEMBER",
  name: null,
  email: "riley@x.test",
};

async function loadModule() {
  const revalidatePath = vi.fn();
  const getCurrentUser = vi.fn().mockResolvedValue(driver);
  const locateAddress = vi.fn<Locate>(async (address, previous) =>
    !address
      ? { address: null, lat: null, lon: null }
      : address === previous
        ? null
        : { address: `${address} (found)`, lat: 1, lon: 2 }
  );
  const prisma = {
    user: { update: vi.fn() },
    hangoutAttendee: { findFirst: vi.fn().mockResolvedValue({ userId: driver.id }) },
    hangoutCar: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
    },
    hangoutRider: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  vi.doMock("@/lib/tomtom", () => ({ locateAddress }));
  const recomputeRoutes = vi.fn();
  const queueUpdate = vi.fn();
  vi.doMock("@/lib/hangout-updates", async (importActual) => ({
    ...(await importActual<typeof import("@/lib/hangout-updates")>()),
    queueUpdate,
  }));
  vi.doMock("@/lib/routes", () => ({ recomputeRoutes }));
  const hangoutEnded = vi.fn().mockResolvedValue(false);
  vi.doMock("@/lib/hangouts", () => ({ hangoutEnded }));
  const actions = await import("@/app/actions/carpools");
  return {
    ...actions,
    revalidatePath,
    getCurrentUser,
    prisma,
    locateAddress,
    recomputeRoutes,
    hangoutEnded,
    queueUpdate,
  };
}

const ownedCar = (overrides = {}) => ({
  id: CAR_ID,
  hangoutId: HANGOUT_ID,
  driverId: driver.id,
  startAddress: null,
  commonPoint: "Union Station",
  driver: { name: null, email: "dana@x.test" },
  _count: { riders: 2 },
  ...overrides,
});

describe("carpool actions", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("freezes cars once the hangout has ended", async () => {
    const mod = await loadModule();
    mod.hangoutEnded.mockResolvedValue(true);
    mod.prisma.hangoutCar.findUnique.mockResolvedValue(ownedCar());
    const ended = { error: "This hangout has already ended" };

    await expect(mod.offerCarAction(HANGOUT_ID, 3)).resolves.toEqual(ended);
    await expect(mod.removeCarAction(CAR_ID)).resolves.toEqual(ended);
    mod.getCurrentUser.mockResolvedValue(admin);
    await expect(mod.recomputeRoutesAction(HANGOUT_ID)).resolves.toEqual(ended);
    expect(mod.prisma.hangoutCar.create).not.toHaveBeenCalled();
    expect(mod.recomputeRoutes).not.toHaveBeenCalled();
  });

  it("lets a Going member offer one car", async () => {
    const mod = await loadModule();

    await expect(mod.offerCarAction(HANGOUT_ID, 3)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutAttendee.findFirst).toHaveBeenCalledWith({
      where: {
        hangoutId: HANGOUT_ID,
        userId: driver.id,
        status: "GOING",
        hangout: { status: "SCHEDULED" },
      },
      select: { userId: true },
    });
    expect(mod.prisma.hangoutCar.create).toHaveBeenCalledWith({
      data: { hangoutId: HANGOUT_ID, driverId: driver.id, seats: 3 },
    });
    expect(mod.revalidatePath).toHaveBeenCalledWith(`/hub/hangouts/${HANGOUT_ID}`);
    expect(mod.recomputeRoutes).toHaveBeenCalledWith(HANGOUT_ID);
    expect(mod.queueUpdate).toHaveBeenCalledWith(
      HANGOUT_ID,
      "Carpools",
      "—",
      "Dana offers a car (3 seats)"
    );

    mod.prisma.hangoutCar.findFirst.mockResolvedValueOnce({ id: CAR_ID });
    await expect(mod.offerCarAction(HANGOUT_ID, 3)).resolves.toEqual({
      error: "You already have a car",
    });
    mod.prisma.hangoutRider.findUnique.mockResolvedValueOnce({ carId: CAR_ID });
    await expect(mod.offerCarAction(HANGOUT_ID, 3)).resolves.toEqual({
      error: "Leave the car you're riding in first",
    });
    await expect(mod.offerCarAction(HANGOUT_ID, 0)).resolves.toEqual({ error: "At least 1 seat" });
    await expect(mod.offerCarAction("nope", 3)).resolves.toEqual({ error: "Hangout not found" });

    mod.prisma.hangoutAttendee.findFirst.mockResolvedValueOnce(null);
    await expect(mod.offerCarAction(HANGOUT_ID, 3)).resolves.toEqual({
      error: "Only people going can drive or ride",
    });
    mod.getCurrentUser.mockResolvedValueOnce(null);
    await expect(mod.offerCarAction(HANGOUT_ID, 3)).resolves.toEqual({ error: "Unauthorized" });
    expect(mod.prisma.hangoutCar.create).toHaveBeenCalledTimes(1);
    // A driver who already has a home address is never asked for one (AC1).
    expect(mod.locateAddress).not.toHaveBeenCalled();
    expect(mod.prisma.user.update).not.toHaveBeenCalled();
  });

  it("asks a driver with no home address for one, saves it to their profile, then offers the car (AC2, AC3)", async () => {
    const mod = await loadModule();
    mod.getCurrentUser.mockResolvedValue({ ...driver, homeAddress: null });

    await expect(mod.offerCarAction(HANGOUT_ID, 3)).resolves.toEqual({
      error: "Add your start address so the route can be computed",
    });
    await expect(mod.offerCarAction(HANGOUT_ID, 3, "   ")).resolves.toEqual({
      error: "Add your start address so the route can be computed",
    });
    await expect(mod.offerCarAction(HANGOUT_ID, 3, "x".repeat(301))).resolves.toEqual({
      error: "Address is too long",
    });

    mod.locateAddress.mockResolvedValueOnce({
      error: "Couldn't find that address. Check it and try again.",
    });
    await expect(mod.offerCarAction(HANGOUT_ID, 3, "Nowhere")).resolves.toEqual({
      error: "Couldn't find that address. Check it and try again.",
    });
    expect(mod.prisma.hangoutCar.create).not.toHaveBeenCalled();
    expect(mod.prisma.user.update).not.toHaveBeenCalled();

    await expect(mod.offerCarAction(HANGOUT_ID, 3, " 39 Rue Fountain ")).resolves.toEqual({
      success: true,
    });
    expect(mod.locateAddress).toHaveBeenLastCalledWith("39 Rue Fountain");
    expect(mod.prisma.user.update).toHaveBeenCalledWith({
      where: { id: driver.id },
      data: { homeAddress: "39 Rue Fountain (found)", homeLat: 1, homeLon: 2 },
    });
    expect(mod.prisma.hangoutCar.create).toHaveBeenCalledWith({
      data: { hangoutId: HANGOUT_ID, driverId: driver.id, seats: 3 },
    });
    expect(mod.recomputeRoutes).toHaveBeenCalledWith(HANGOUT_ID);

    mod.locateAddress.mockResolvedValueOnce(null);
    await expect(mod.offerCarAction(HANGOUT_ID, 3, "somewhere")).resolves.toEqual({
      error: "Couldn't use that address",
    });
  });

  it("updates seats and geocodes changed addresses for the driver or an admin", async () => {
    const mod = await loadModule();
    mod.prisma.hangoutCar.findUnique.mockResolvedValue(ownedCar());

    await expect(
      mod.updateCarAction(CAR_ID, {
        seats: 3,
        startAddress: " 1 Main St ",
        commonPoint: "Union Station",
      })
    ).resolves.toEqual({ success: true });
    expect(mod.locateAddress).toHaveBeenCalledWith("1 Main St", null);
    expect(mod.prisma.hangoutCar.update).toHaveBeenCalledWith({
      where: { id: CAR_ID },
      data: { seats: 3, startAddress: "1 Main St (found)", startLat: 1, startLon: 2 },
    });
    expect(mod.prisma.hangoutRider.updateMany).not.toHaveBeenCalled();

    mod.getCurrentUser.mockResolvedValue(admin);
    await mod.updateCarAction(CAR_ID, { seats: 2, startAddress: "", commonPoint: "" });
    expect(mod.prisma.hangoutCar.update).toHaveBeenLastCalledWith({
      where: { id: CAR_ID },
      data: {
        seats: 2,
        startAddress: null,
        startLat: null,
        startLon: null,
        commonPoint: null,
        commonLat: null,
        commonLon: null,
      },
    });
    expect(mod.prisma.hangoutRider.updateMany).toHaveBeenCalledWith({
      where: { carId: CAR_ID },
      data: { atCommonPoint: false },
    });
  });

  it("refuses bad car edits", async () => {
    const mod = await loadModule();
    mod.prisma.hangoutCar.findUnique.mockResolvedValue(ownedCar());
    const values = { seats: 3, startAddress: null, commonPoint: null };

    await expect(mod.updateCarAction(CAR_ID, { ...values, seats: 1 })).resolves.toEqual({
      error: "2 riders already; remove some first",
    });
    await expect(mod.updateCarAction(CAR_ID, { ...values, seats: 13 })).resolves.toEqual({
      error: "12 seats or fewer",
    });

    mod.locateAddress.mockResolvedValueOnce({ error: "No match" });
    await expect(mod.updateCarAction(CAR_ID, { ...values, startAddress: "zzqq" })).resolves.toEqual(
      { error: "No match" }
    );
    mod.locateAddress
      .mockResolvedValueOnce({ address: null, lat: null, lon: null })
      .mockResolvedValueOnce({ error: "No match" });
    await expect(mod.updateCarAction(CAR_ID, { ...values, commonPoint: "zzqq" })).resolves.toEqual({
      error: "No match",
    });

    mod.getCurrentUser.mockResolvedValue(rider);
    await expect(mod.updateCarAction(CAR_ID, values)).resolves.toEqual({
      error: "Only the driver or an admin can change this car",
    });
    mod.prisma.hangoutCar.findUnique.mockResolvedValue(null);
    await expect(mod.updateCarAction(CAR_ID, values)).resolves.toEqual({
      error: "Car not found",
    });
    await expect(mod.removeCarAction("nope")).resolves.toEqual({ error: "Car not found" });
    mod.getCurrentUser.mockResolvedValue(null);
    await expect(mod.removeCarAction(CAR_ID)).resolves.toEqual({ error: "Unauthorized" });
    expect(mod.prisma.hangoutCar.update).not.toHaveBeenCalled();
  });

  it("removes a car and its riders", async () => {
    const mod = await loadModule();
    mod.prisma.hangoutCar.findUnique.mockResolvedValue(ownedCar());

    await expect(mod.removeCarAction(CAR_ID)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutCar.delete).toHaveBeenCalledWith({ where: { id: CAR_ID } });
    expect(mod.recomputeRoutes).not.toHaveBeenCalled();
    await expect(mod.removeRiderAction(CAR_ID, rider.id)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutRider.deleteMany).toHaveBeenCalledWith({
      where: { carId: CAR_ID, userId: rider.id },
    });

    mod.getCurrentUser.mockResolvedValue(rider);
    await expect(mod.removeRiderAction(CAR_ID, driver.id)).resolves.toEqual({
      error: "Only the driver or an admin can change this car",
    });
  });

  it("joins a car with a seat, switching cars or pick-up point", async () => {
    const mod = await loadModule();
    mod.getCurrentUser.mockResolvedValue(rider);
    const car = {
      hangoutId: HANGOUT_ID,
      driverId: driver.id,
      seats: 2,
      commonPoint: "Union Station",
      riders: [{ userId: "someone" }],
      driver: { name: "Dana", email: "dana@x.test" },
    };
    mod.prisma.hangoutCar.findUnique.mockResolvedValue(car);
    const key = { hangoutId: HANGOUT_ID, userId: rider.id };

    await expect(mod.joinCarAction(CAR_ID, true)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutRider.upsert).toHaveBeenCalledWith({
      where: { hangoutId_userId: key },
      create: { ...key, carId: CAR_ID, atCommonPoint: true },
      update: { carId: CAR_ID, atCommonPoint: true },
    });
    expect(mod.queueUpdate).toHaveBeenCalledWith(
      HANGOUT_ID,
      "Carpools",
      "—",
      "riley rides with Dana"
    );

    mod.prisma.hangoutCar.findUnique.mockResolvedValue({
      ...car,
      commonPoint: null,
      riders: [{ userId: "someone" }, { userId: rider.id }],
    });
    await expect(mod.joinCarAction(CAR_ID, true)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutRider.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: { carId: CAR_ID, atCommonPoint: false } })
    );

    mod.prisma.hangoutCar.findUnique.mockResolvedValue({
      ...car,
      riders: [{ userId: "a" }, { userId: "b" }],
    });
    await expect(mod.joinCarAction(CAR_ID, false)).resolves.toEqual({
      error: "That car is full",
    });
  });

  it("refuses rides for drivers, people not going and missing cars", async () => {
    const mod = await loadModule();
    const car = {
      hangoutId: HANGOUT_ID,
      driverId: driver.id,
      seats: 2,
      commonPoint: null,
      riders: [],
    };
    mod.prisma.hangoutCar.findUnique.mockResolvedValue(car);

    await expect(mod.joinCarAction(CAR_ID, false)).resolves.toEqual({
      error: "You're driving this car",
    });
    mod.getCurrentUser.mockResolvedValue(rider);
    mod.prisma.hangoutCar.findFirst.mockResolvedValueOnce({ id: "own" });
    await expect(mod.joinCarAction(CAR_ID, false)).resolves.toEqual({
      error: "Remove your own car before riding in another",
    });
    mod.prisma.hangoutAttendee.findFirst.mockResolvedValueOnce(null);
    await expect(mod.joinCarAction(CAR_ID, false)).resolves.toEqual({
      error: "Only people going can drive or ride",
    });
    mod.prisma.hangoutCar.findUnique.mockResolvedValue(null);
    await expect(mod.joinCarAction(CAR_ID, false)).resolves.toEqual({ error: "Car not found" });
    await expect(mod.joinCarAction("nope", false)).resolves.toEqual({ error: "Car not found" });
    expect(mod.prisma.hangoutRider.upsert).not.toHaveBeenCalled();
  });

  it("lets riders leave", async () => {
    const mod = await loadModule();
    mod.getCurrentUser.mockResolvedValue(rider);

    await expect(mod.leaveCarAction(HANGOUT_ID)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutRider.deleteMany).toHaveBeenCalledWith({
      where: { hangoutId: HANGOUT_ID, userId: rider.id },
    });
    expect(mod.queueUpdate).toHaveBeenCalledWith(HANGOUT_ID, "Carpools", "riley", "left their car");
    mod.queueUpdate.mockClear();
    mod.prisma.hangoutRider.deleteMany.mockResolvedValueOnce({ count: 0 });
    await mod.leaveCarAction(HANGOUT_ID);
    expect(mod.queueUpdate).toHaveBeenCalledTimes(0);
    await expect(mod.leaveCarAction("nope")).resolves.toEqual({ error: "Hangout not found" });
    mod.getCurrentUser.mockResolvedValue(null);
    await expect(mod.leaveCarAction(HANGOUT_ID)).resolves.toEqual({ error: "Unauthorized" });
  });

  it("lets admins recompute every route", async () => {
    const mod = await loadModule();
    mod.getCurrentUser.mockResolvedValue(admin);

    await expect(mod.recomputeRoutesAction(HANGOUT_ID)).resolves.toEqual({ success: true });
    expect(mod.recomputeRoutes).toHaveBeenCalledWith(HANGOUT_ID);
    await expect(mod.recomputeRoutesAction("nope")).resolves.toEqual({
      error: "Hangout not found",
    });

    mod.getCurrentUser.mockResolvedValue(driver);
    await expect(mod.recomputeRoutesAction(HANGOUT_ID)).resolves.toEqual({
      error: "Forbidden: Admin access required",
    });
    expect(mod.recomputeRoutes).toHaveBeenCalledTimes(1);
  });
});
