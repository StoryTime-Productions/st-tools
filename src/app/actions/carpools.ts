"use server";

import { revalidateHangoutPage } from "@/lib/hangout-live";
import { z } from "zod";
import {
  AttendanceStatus,
  HangoutStatus,
  PassengerPointKind,
  RideDirection,
  Role,
} from "@prisma/client";
import { getCurrentUser } from "@/lib/get-current-user";
import { queueUpdate } from "@/lib/hangout-updates";
import { hangoutEnded } from "@/lib/hangouts";
import { prisma } from "@/lib/prisma";
import { clearFromRides, goingUser } from "@/lib/rides";
import { recomputeRoutes } from "@/lib/routes";
import { geocodeAddress, locateAddress } from "@/lib/tomtom";

export type CarpoolActionResult = { error: string } | { success: true };

const UNAUTHORIZED = "Unauthorized";
const CAR_GONE = "Car not found";
const ENDED = "This hangout has already ended";
const NOT_YOURS = "Only the driver or an admin can change this car";

const uuid = z.string().uuid();

const personName = (user: { name: string | null; email: string }) =>
  user.name ?? user.email.split("@")[0];
const seatsSchema = z.number().int().min(1, "At least 1 seat").max(12, "12 seats or fewer");

async function reroute(hangoutId: string) {
  await recomputeRoutes(hangoutId);
  revalidateHangoutPage(hangoutId);
}

/** The car, if the caller is its driver or an admin. */
async function ownedCar(carId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: UNAUTHORIZED } as const;
  if (!uuid.safeParse(carId).success) return { error: CAR_GONE } as const;
  const car = await prisma.hangoutCar.findUnique({
    where: { id: carId },
    select: {
      id: true,
      hangoutId: true,
      driverId: true,
      startAddress: true,
      seats: true,
      driver: { select: { name: true, email: true } },
      hangout: { select: { status: true } },
      passengers: {
        select: {
          userId: true,
          direction: true,
          user: { select: { homeLat: true, homeLon: true } },
        },
      },
    },
  });
  if (!car) return { error: CAR_GONE } as const;
  if (car.driverId !== user.id && user.role !== Role.ADMIN) return { error: NOT_YOURS } as const;
  if (await hangoutEnded(car.hangoutId)) return { error: ENDED } as const;
  return { car };
}

const startAddressSchema = z
  .string()
  .trim()
  .min(1, "Add your start address so the route can be computed")
  .max(300, "Address is too long");

/**
 * A driver with no home address gives one when offering (O2): it is located and saved to their
 * profile first, so later offers need nothing and routing has an origin.
 */
export async function offerCarAction(
  hangoutId: string,
  seats: number,
  homeAddress?: string
): Promise<CarpoolActionResult> {
  if (!uuid.safeParse(hangoutId).success) return { error: "Hangout not found" };
  const parsedSeats = seatsSchema.safeParse(seats);
  if (!parsedSeats.success) return { error: parsedSeats.error.issues[0].message };

  const going = await goingUser(hangoutId);
  if (!going.user) return { error: going.error };
  if (await prisma.hangoutCar.findFirst({ where: { hangoutId, driverId: going.user.id } }))
    return { error: "You already have a car" };

  if (!going.user.homeAddress) {
    const typed = startAddressSchema.safeParse(homeAddress ?? "");
    if (!typed.success) return { error: typed.error.issues[0].message };
    const place = await locateAddress(typed.data);
    if (!place || "error" in place) return { error: place?.error ?? "Couldn't use that address" };
    await prisma.user.update({
      where: { id: going.user.id },
      data: { homeAddress: place.address, homeLat: place.lat, homeLon: place.lon },
    });
  }

  // Driving yourself means you no longer ride in anyone else's car (Q1).
  await prisma.$transaction([
    clearFromRides(hangoutId, going.user.id),
    prisma.hangoutCar.create({
      data: { hangoutId, driverId: going.user.id, seats: parsedSeats.data },
    }),
  ]);
  await queueUpdate(
    hangoutId,
    "Carpools",
    "—",
    `${personName(going.user)} offers a car (${parsedSeats.data} seats)`
  );
  await reroute(hangoutId);
  return { success: true };
}

const carSchema = z.object({
  seats: seatsSchema,
  startAddress: z.string().trim().max(300).nullable(),
});

/** Seats are taken by whoever is on the longer list: people ride one way or both, never more. */
const seatsUsed = (passengers: { direction: RideDirection }[]) =>
  Math.max(
    passengers.filter((p) => p.direction === RideDirection.PICKUP).length,
    passengers.filter((p) => p.direction === RideDirection.DROPOFF).length
  );

export async function updateCarAction(
  carId: string,
  values: z.input<typeof carSchema>
): Promise<CarpoolActionResult> {
  const parsed = carSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const owned = await ownedCar(carId);
  if (!owned.car) return { error: owned.error };
  const { car } = owned;
  const riding = seatsUsed(car.passengers);
  if (parsed.data.seats < riding) return { error: `${riding} riders already; remove some first` };

  const start = await locateAddress(parsed.data.startAddress || null, car.startAddress);
  if (start && "error" in start) return { error: start.error! };

  await prisma.hangoutCar.update({
    where: { id: car.id },
    data: {
      seats: parsed.data.seats,
      ...(start && { startAddress: start.address, startLat: start.lat, startLon: start.lon }),
    },
  });
  await reroute(car.hangoutId);
  return { success: true };
}

export async function removeCarAction(carId: string): Promise<CarpoolActionResult> {
  const owned = await ownedCar(carId);
  if (!owned.car) return { error: owned.error };

  await prisma.hangoutCar.delete({ where: { id: owned.car.id } });
  await queueUpdate(
    owned.car.hangoutId,
    "Carpools",
    `${personName(owned.car.driver)}'s car`,
    "removed"
  );
  revalidateHangoutPage(owned.car.hangoutId);
  return { success: true };
}

const pointSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal(PassengerPointKind.HOME) }),
  z.object({ kind: z.literal(PassengerPointKind.RIDER_HOME), viaUserId: uuid }),
  z.object({
    kind: z.literal(PassengerPointKind.COMMON),
    address: z.string().trim().min(1, "Add the meeting address").max(300, "Address is too long"),
  }),
]);

export type PassengerPoint = z.input<typeof pointSchema>;

const directionSchema = z.nativeEnum(RideDirection);

const wording = {
  [RideDirection.PICKUP]: { list: "pick-up", verb: "picks up" },
  [RideDirection.DROPOFF]: { list: "drop-off", verb: "drops off" },
};

/** Puts one Going attendee on a car's pick-up or drop-off list, or moves their point (R1-R3). */
export async function assignPassengerAction(
  carId: string,
  userId: string,
  direction: RideDirection,
  point: PassengerPoint
): Promise<CarpoolActionResult> {
  const parsedDirection = directionSchema.safeParse(direction);
  const parsedPoint = pointSchema.safeParse(point);
  if (!parsedDirection.success || !parsedPoint.success || !uuid.safeParse(userId).success)
    return { error: "That isn't a valid pick-up choice" };
  const chosen = parsedPoint.data;

  const owned = await ownedCar(carId);
  if (!owned.car) return { error: owned.error };
  const { car } = owned;
  if (car.hangout.status !== HangoutStatus.SCHEDULED) return { error: "Hangout is not scheduled" };
  if (userId === car.driverId) return { error: "The driver is already in the car" };

  const attendee = await prisma.hangoutAttendee.findUnique({
    where: { hangoutId_userId: { hangoutId: car.hangoutId, userId } },
    select: {
      status: true,
      user: { select: { name: true, email: true, homeLat: true, homeLon: true } },
    },
  });
  if (attendee?.status !== AttendanceStatus.GOING) return { error: "Only people going can ride" };
  const name = personName(attendee.user);
  const { list, verb } = wording[direction];

  if (await prisma.hangoutCar.findFirst({ where: { hangoutId: car.hangoutId, driverId: userId } }))
    return { error: `${name} is driving their own car` };
  const key = { hangoutId: car.hangoutId, userId, direction };
  if (await prisma.hangoutTransit.findUnique({ where: { hangoutId_userId_direction: key } }))
    return { error: `${name} is taking public transit for the ${list}` };
  const existing = await prisma.hangoutPassenger.findUnique({
    where: { hangoutId_userId_direction: key },
    select: { carId: true, car: { select: { driver: { select: { name: true, email: true } } } } },
  });
  if (existing && existing.carId !== car.id)
    return {
      error: `${name} is already on ${personName(existing.car.driver)}'s car for the ${list}`,
    };

  const onList = car.passengers.filter((p) => !(p.userId === userId && p.direction === direction));
  if (seatsUsed([...onList, { direction }]) > car.seats) return { error: "That car is full" };

  const values = {
    pointKind: chosen.kind,
    viaUserId: null as string | null,
    commonLabel: null as string | null,
    commonLat: null as number | null,
    commonLon: null as number | null,
  };
  if (chosen.kind === PassengerPointKind.HOME) {
    if (attendee.user.homeLat === null || attendee.user.homeLon === null)
      return { error: `${name} has no home address yet` };
  } else if (chosen.kind === PassengerPointKind.RIDER_HOME) {
    const via = onList.find((p) => p.userId === chosen.viaUserId && p.direction === direction);
    if (!via || via.userId === userId) return { error: `Pick someone else on this ${list} list` };
    if (via.user.homeLat === null || via.user.homeLon === null)
      return { error: "That rider has no home address yet" };
    values.viaUserId = via.userId;
  } else {
    const place = await geocodeAddress(chosen.address);
    if (!place || place === "no-match") return { error: "Couldn't find that address" };
    Object.assign(values, {
      commonLabel: place.address,
      commonLat: place.lat,
      commonLon: place.lon,
    });
  }

  await prisma.hangoutPassenger.upsert({
    where: { hangoutId_userId_direction: key },
    create: { ...key, carId: car.id, ...values },
    update: values,
  });
  if (!existing)
    await queueUpdate(car.hangoutId, "Carpools", "—", `${personName(car.driver)} ${verb} ${name}`);
  await reroute(car.hangoutId);
  return { success: true };
}

/** Takes someone off one list of a car, along with anyone set to meet at their home (Q2). */
export async function unassignPassengerAction(
  carId: string,
  userId: string,
  direction: RideDirection
): Promise<CarpoolActionResult> {
  if (!directionSchema.safeParse(direction).success || !uuid.safeParse(userId).success)
    return { error: "That isn't a valid pick-up choice" };
  const owned = await ownedCar(carId);
  if (!owned.car) return { error: owned.error };

  await prisma.hangoutPassenger.deleteMany({
    where: {
      carId: owned.car.id,
      direction,
      OR: [{ userId }, { viaUserId: userId }],
    },
  });
  await reroute(owned.car.hangoutId);
  return { success: true };
}

export async function recomputeRoutesAction(hangoutId: string): Promise<CarpoolActionResult> {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) return { error: "Forbidden: Admin access required" };
  if (!uuid.safeParse(hangoutId).success) return { error: "Hangout not found" };
  if (await hangoutEnded(hangoutId)) return { error: ENDED };

  await reroute(hangoutId);
  return { success: true };
}
