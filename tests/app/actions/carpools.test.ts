import { beforeEach, describe, expect, it, vi } from "vitest";

type Locate = typeof import("@/lib/tomtom").locateAddress;
type GeocodeAddress = typeof import("@/lib/tomtom").geocodeAddress;

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
    hangoutAttendee: {
      findFirst: vi.fn().mockResolvedValue({ userId: driver.id }),
      findUnique: vi.fn(),
    },
    hangoutCar: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
    },
    hangoutPassenger: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    hangoutTransit: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  const geocodeAddress = vi.fn<GeocodeAddress>();
  vi.doMock("@/lib/tomtom", () => ({ locateAddress, geocodeAddress }));
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
    geocodeAddress,
    recomputeRoutes,
    hangoutEnded,
    queueUpdate,
  };
}

const ownedCar = (overrides = {}) => ({
  id: CAR_ID,
  hangoutId: HANGOUT_ID,
  driverId: driver.id,
  seats: 2,
  startAddress: null,
  driver: { name: null, email: "dana@x.test" },
  hangout: { status: "SCHEDULED" },
  passengers: [
    passenger("a", "PICKUP"),
    passenger("a", "DROPOFF"),
    passenger("b", "PICKUP"),
    passenger("b", "DROPOFF"),
  ],
  ...overrides,
});

function passenger(userId: string, direction: "PICKUP" | "DROPOFF", home = { lat: 1, lon: 2 }) {
  return { userId, direction, user: { homeLat: home.lat, homeLon: home.lon } };
}

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
    await expect(
      mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", { kind: "HOME" })
    ).resolves.toEqual(ended);
    await expect(mod.unassignPassengerAction(CAR_ID, rider.id, "PICKUP")).resolves.toEqual(ended);
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

  it("takes a new driver off every car list, and off lists that meet at their home (Q1, Q2)", async () => {
    const mod = await loadModule();

    await mod.offerCarAction(HANGOUT_ID, 3);

    expect(mod.prisma.hangoutPassenger.deleteMany).toHaveBeenCalledWith({
      where: {
        hangoutId: HANGOUT_ID,
        OR: [{ userId: driver.id }, { viaUserId: driver.id }],
      },
    });
    expect(mod.prisma.$transaction).toHaveBeenCalledTimes(1);
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

  it("updates seats and geocodes a changed start address for the driver or an admin", async () => {
    const mod = await loadModule();
    mod.prisma.hangoutCar.findUnique.mockResolvedValue(ownedCar());

    await expect(
      mod.updateCarAction(CAR_ID, { seats: 3, startAddress: " 1 Main St " })
    ).resolves.toEqual({ success: true });
    expect(mod.locateAddress).toHaveBeenCalledWith("1 Main St", null);
    expect(mod.prisma.hangoutCar.update).toHaveBeenCalledWith({
      where: { id: CAR_ID },
      data: { seats: 3, startAddress: "1 Main St (found)", startLat: 1, startLon: 2 },
    });

    mod.getCurrentUser.mockResolvedValue(admin);
    await mod.updateCarAction(CAR_ID, { seats: 2, startAddress: "" });
    expect(mod.prisma.hangoutCar.update).toHaveBeenLastCalledWith({
      where: { id: CAR_ID },
      data: { seats: 2, startAddress: null, startLat: null, startLon: null },
    });
  });

  it("refuses bad car edits", async () => {
    const mod = await loadModule();
    mod.prisma.hangoutCar.findUnique.mockResolvedValue(ownedCar());
    const values = { seats: 3, startAddress: null };

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
  });

  describe("assigning passengers", () => {
    const riderKey = (direction: "PICKUP" | "DROPOFF") => ({
      hangoutId: HANGOUT_ID,
      userId: rider.id,
      direction,
    });

    async function setup(car = ownedCar({ passengers: [] })) {
      const mod = await loadModule();
      mod.prisma.hangoutCar.findUnique.mockResolvedValue(car);
      mod.prisma.hangoutAttendee.findUnique.mockResolvedValue({
        status: "GOING",
        user: { name: null, email: "riley@x.test", homeLat: 5, homeLon: 6 },
      });
      return mod;
    }

    it("puts a Going attendee on the pick-up list at their home", async () => {
      const mod = await setup();

      await expect(
        mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", { kind: "HOME" })
      ).resolves.toEqual({ success: true });

      const values = {
        pointKind: "HOME",
        viaUserId: null,
        commonLabel: null,
        commonLat: null,
        commonLon: null,
      };
      expect(mod.prisma.hangoutPassenger.upsert).toHaveBeenCalledWith({
        where: { hangoutId_userId_direction: riderKey("PICKUP") },
        create: { ...riderKey("PICKUP"), carId: CAR_ID, ...values },
        update: values,
      });
      expect(mod.queueUpdate).toHaveBeenCalledWith(
        HANGOUT_ID,
        "Carpools",
        "—",
        "dana picks up riley"
      );
      expect(mod.recomputeRoutes).toHaveBeenCalledWith(HANGOUT_ID);
      await mod.assignPassengerAction(CAR_ID, rider.id, "DROPOFF", { kind: "HOME" });
      expect(mod.queueUpdate).toHaveBeenLastCalledWith(
        HANGOUT_ID,
        "Carpools",
        "—",
        "dana drops off riley"
      );
    });

    it("geocodes a typed common point and refuses one that can't be found (AC2)", async () => {
      const mod = await setup();
      mod.geocodeAddress.mockResolvedValueOnce({ address: "Union Station", lat: 3, lon: 4 });

      await expect(
        mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", {
          kind: "COMMON",
          address: " union ",
        })
      ).resolves.toEqual({ success: true });
      expect(mod.geocodeAddress).toHaveBeenCalledWith("union");
      expect(mod.prisma.hangoutPassenger.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            pointKind: "COMMON",
            viaUserId: null,
            commonLabel: "Union Station",
            commonLat: 3,
            commonLon: 4,
          },
        })
      );

      mod.prisma.hangoutPassenger.upsert.mockClear();
      for (const result of ["no-match", null] as const) {
        mod.geocodeAddress.mockResolvedValueOnce(result);
        await expect(
          mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", { kind: "COMMON", address: "zz" })
        ).resolves.toEqual({ error: "Couldn't find that address" });
      }
      await expect(
        mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", { kind: "COMMON", address: "  " })
      ).resolves.toEqual({ error: "That isn't a valid pick-up choice" });
      expect(mod.prisma.hangoutPassenger.upsert).not.toHaveBeenCalled();
    });

    it("meets at another rider's home only when they're on the same list with a home", async () => {
      const carol = "66666666-6666-4666-8666-666666666666";
      const nohome = "77777777-7777-4777-8777-777777777778";
      const mod = await setup(
        ownedCar({
          seats: 3,
          passengers: [
            passenger(carol, "PICKUP"),
            { ...passenger(nohome, "PICKUP"), user: { homeLat: null, homeLon: null } },
          ],
        })
      );
      const via = (viaUserId: string) => ({ kind: "RIDER_HOME" as const, viaUserId });

      await expect(
        mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", via(carol))
      ).resolves.toEqual({ success: true });
      expect(mod.prisma.hangoutPassenger.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ pointKind: "RIDER_HOME", viaUserId: carol }),
        })
      );

      // The other direction's list doesn't count, nor does yourself, nor a rider without a home.
      await expect(
        mod.assignPassengerAction(CAR_ID, rider.id, "DROPOFF", via(carol))
      ).resolves.toEqual({ error: "Pick someone else on this drop-off list" });
      await expect(
        mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", via(rider.id))
      ).resolves.toEqual({ error: "Pick someone else on this pick-up list" });
      await expect(
        mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", via(nohome))
      ).resolves.toEqual({ error: "That rider has no home address yet" });
    });

    it("limits the longer list to the seats (AC5), but lets a move stay put", async () => {
      const full = ownedCar({
        seats: 2,
        passengers: [
          passenger("a", "PICKUP"),
          passenger("b", "PICKUP"),
          { ...passenger(rider.id, "DROPOFF") },
        ],
      });
      const mod = await setup(full);

      await expect(
        mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", { kind: "HOME" })
      ).resolves.toEqual({ error: "That car is full" });

      // Already on that list: changing the point isn't a new seat.
      full.passengers.push(passenger(rider.id, "PICKUP"));
      full.passengers.splice(0, 1);
      mod.prisma.hangoutPassenger.findUnique.mockResolvedValue({ carId: CAR_ID });
      await expect(
        mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", { kind: "HOME" })
      ).resolves.toEqual({ success: true });
      // A move isn't announced again.
      expect(mod.queueUpdate).not.toHaveBeenCalled();
    });

    it("refuses people who can't ride this way", async () => {
      const mod = await setup();
      const assign = () => mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", { kind: "HOME" });

      mod.prisma.hangoutPassenger.findUnique.mockResolvedValueOnce({
        carId: "other",
        car: { driver: { name: "Zed", email: "z@x.test" } },
      });
      await expect(assign()).resolves.toEqual({
        error: "riley is already on Zed's car for the pick-up",
      });
      mod.prisma.hangoutTransit.findUnique.mockResolvedValueOnce({ id: "t" });
      await expect(assign()).resolves.toEqual({
        error: "riley is taking public transit for the pick-up",
      });
      mod.prisma.hangoutCar.findFirst.mockResolvedValueOnce({ id: "own" });
      await expect(assign()).resolves.toEqual({ error: "riley is driving their own car" });
      mod.prisma.hangoutAttendee.findUnique.mockResolvedValueOnce({
        status: "MAYBE",
        user: { name: null, email: "riley@x.test", homeLat: 5, homeLon: 6 },
      });
      await expect(assign()).resolves.toEqual({ error: "Only people going can ride" });
      mod.prisma.hangoutAttendee.findUnique.mockResolvedValueOnce(null);
      await expect(assign()).resolves.toEqual({ error: "Only people going can ride" });
      mod.prisma.hangoutAttendee.findUnique.mockResolvedValueOnce({
        status: "GOING",
        user: { name: "Riley", email: "riley@x.test", homeLat: null, homeLon: null },
      });
      await expect(assign()).resolves.toEqual({ error: "Riley has no home address yet" });
      await expect(
        mod.assignPassengerAction(CAR_ID, driver.id, "PICKUP", { kind: "HOME" })
      ).resolves.toEqual({ error: "The driver is already in the car" });
      expect(mod.prisma.hangoutPassenger.upsert).not.toHaveBeenCalled();
    });

    it("checks who is asking and what", async () => {
      const mod = await setup();
      const home = { kind: "HOME" as const };

      await expect(mod.assignPassengerAction(CAR_ID, "nope", "PICKUP", home)).resolves.toEqual({
        error: "That isn't a valid pick-up choice",
      });
      await expect(
        mod.assignPassengerAction(CAR_ID, rider.id, "SIDEWAYS" as never, home)
      ).resolves.toEqual({ error: "That isn't a valid pick-up choice" });
      await expect(
        mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", { kind: "RIDER_HOME" } as never)
      ).resolves.toEqual({ error: "That isn't a valid pick-up choice" });

      mod.prisma.hangoutCar.findUnique.mockResolvedValueOnce(
        ownedCar({ hangout: { status: "COLLECTING" } })
      );
      await expect(mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", home)).resolves.toEqual({
        error: "Hangout is not scheduled",
      });
      mod.getCurrentUser.mockResolvedValue(rider);
      await expect(mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", home)).resolves.toEqual({
        error: "Only the driver or an admin can change this car",
      });
      mod.getCurrentUser.mockResolvedValue(admin);
      await expect(mod.assignPassengerAction(CAR_ID, rider.id, "PICKUP", home)).resolves.toEqual({
        success: true,
      });
    });
  });

  describe("unassigning passengers", () => {
    it("takes someone off one list and anyone meeting at their home (Q2)", async () => {
      const mod = await loadModule();
      mod.prisma.hangoutCar.findUnique.mockResolvedValue(ownedCar());

      await expect(mod.unassignPassengerAction(CAR_ID, rider.id, "DROPOFF")).resolves.toEqual({
        success: true,
      });

      expect(mod.prisma.hangoutPassenger.deleteMany).toHaveBeenCalledWith({
        where: {
          carId: CAR_ID,
          direction: "DROPOFF",
          OR: [{ userId: rider.id }, { viaUserId: rider.id }],
        },
      });
      expect(mod.recomputeRoutes).toHaveBeenCalledWith(HANGOUT_ID);
    });

    it("is for the driver or an admin, with valid input", async () => {
      const mod = await loadModule();
      mod.prisma.hangoutCar.findUnique.mockResolvedValue(ownedCar());

      await expect(mod.unassignPassengerAction(CAR_ID, "nope", "PICKUP")).resolves.toEqual({
        error: "That isn't a valid pick-up choice",
      });
      await expect(
        mod.unassignPassengerAction(CAR_ID, rider.id, "SIDEWAYS" as never)
      ).resolves.toEqual({ error: "That isn't a valid pick-up choice" });
      mod.getCurrentUser.mockResolvedValue(rider);
      await expect(mod.unassignPassengerAction(CAR_ID, driver.id, "PICKUP")).resolves.toEqual({
        error: "Only the driver or an admin can change this car",
      });
      expect(mod.prisma.hangoutPassenger.deleteMany).not.toHaveBeenCalled();
    });
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
