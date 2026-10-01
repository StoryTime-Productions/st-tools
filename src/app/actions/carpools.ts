"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AttendanceStatus, HangoutStatus, Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/get-current-user";
import { prisma } from "@/lib/prisma";
import { locateAddress } from "@/lib/tomtom";

export type CarpoolActionResult = { error: string } | { success: true };

const UNAUTHORIZED = "Unauthorized";
const NOT_GOING = "Only people going can drive or ride";
const CAR_GONE = "Car not found";
const NOT_YOURS = "Only the driver or an admin can change this car";

const uuid = z.string().uuid();
const seatsSchema = z.number().int().min(1, "At least 1 seat").max(12, "12 seats or fewer");

function revalidate(hangoutId: string) {
  revalidatePath(`/hub/hangouts/${hangoutId}`);
}

/** The caller, if they are Going to this scheduled hangout. */
async function goingUser(hangoutId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: UNAUTHORIZED } as const;
  const attendee = await prisma.hangoutAttendee.findFirst({
    where: {
      hangoutId,
      userId: user.id,
      status: AttendanceStatus.GOING,
      hangout: { status: HangoutStatus.SCHEDULED },
    },
    select: { userId: true },
  });
  return attendee ? { user } : ({ error: NOT_GOING } as const);
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
      commonPoint: true,
      _count: { select: { riders: true } },
    },
  });
  if (!car) return { error: CAR_GONE } as const;
  if (car.driverId !== user.id && user.role !== Role.ADMIN) return { error: NOT_YOURS } as const;
  return { car };
}

export async function offerCarAction(
  hangoutId: string,
  seats: number
): Promise<CarpoolActionResult> {
  if (!uuid.safeParse(hangoutId).success) return { error: "Hangout not found" };
  const parsedSeats = seatsSchema.safeParse(seats);
  if (!parsedSeats.success) return { error: parsedSeats.error.issues[0].message };

  const going = await goingUser(hangoutId);
  if (!going.user) return { error: going.error };
  const key = { hangoutId, userId: going.user.id };
  if (await prisma.hangoutRider.findUnique({ where: { hangoutId_userId: key } }))
    return { error: "Leave the car you're riding in first" };
  if (await prisma.hangoutCar.findFirst({ where: { hangoutId, driverId: going.user.id } }))
    return { error: "You already have a car" };

  await prisma.hangoutCar.create({
    data: { hangoutId, driverId: going.user.id, seats: parsedSeats.data },
  });
  revalidate(hangoutId);
  return { success: true };
}

const carSchema = z.object({
  seats: seatsSchema,
  startAddress: z.string().trim().max(300).nullable(),
  commonPoint: z.string().trim().max(300).nullable(),
});

export async function updateCarAction(
  carId: string,
  values: z.input<typeof carSchema>
): Promise<CarpoolActionResult> {
  const parsed = carSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const owned = await ownedCar(carId);
  if (!owned.car) return { error: owned.error };
  const { car } = owned;
  if (parsed.data.seats < car._count.riders)
    return { error: `${car._count.riders} riders already; remove some first` };

  const start = await locateAddress(parsed.data.startAddress || null, car.startAddress);
  if (start && "error" in start) return { error: start.error! };
  const common = await locateAddress(parsed.data.commonPoint || null, car.commonPoint);
  if (common && "error" in common) return { error: common.error! };

  await prisma.$transaction([
    prisma.hangoutCar.update({
      where: { id: car.id },
      data: {
        seats: parsed.data.seats,
        ...(start && { startAddress: start.address, startLat: start.lat, startLon: start.lon }),
        ...(common && {
          commonPoint: common.address,
          commonLat: common.lat,
          commonLon: common.lon,
        }),
      },
    }),
    ...(common?.address === null
      ? [
          prisma.hangoutRider.updateMany({
            where: { carId: car.id },
            data: { atCommonPoint: false },
          }),
        ]
      : []),
  ]);
  revalidate(car.hangoutId);
  return { success: true };
}

export async function removeCarAction(carId: string): Promise<CarpoolActionResult> {
  const owned = await ownedCar(carId);
  if (!owned.car) return { error: owned.error };

  await prisma.hangoutCar.delete({ where: { id: owned.car.id } });
  revalidate(owned.car.hangoutId);
  return { success: true };
}

export async function joinCarAction(
  carId: string,
  atCommonPoint: boolean
): Promise<CarpoolActionResult> {
  if (!uuid.safeParse(carId).success) return { error: CAR_GONE };
  const car = await prisma.hangoutCar.findUnique({
    where: { id: carId },
    select: { hangoutId: true, driverId: true, seats: true, commonPoint: true, riders: true },
  });
  if (!car) return { error: CAR_GONE };

  const going = await goingUser(car.hangoutId);
  if (!going.user) return { error: going.error };
  const userId = going.user.id;
  if (car.driverId === userId) return { error: "You're driving this car" };
  if (await prisma.hangoutCar.findFirst({ where: { hangoutId: car.hangoutId, driverId: userId } }))
    return { error: "Remove your own car before riding in another" };
  const alreadyIn = car.riders.some((rider) => rider.userId === userId);
  // ponytail: seat count isn't locked; two joins at the same instant can overfill by one.
  if (!alreadyIn && car.riders.length >= car.seats) return { error: "That car is full" };

  const key = { hangoutId: car.hangoutId, userId };
  const data = { carId, atCommonPoint: atCommonPoint && Boolean(car.commonPoint) };
  await prisma.hangoutRider.upsert({
    where: { hangoutId_userId: key },
    create: { ...key, ...data },
    update: data,
  });
  revalidate(car.hangoutId);
  return { success: true };
}

export async function leaveCarAction(hangoutId: string): Promise<CarpoolActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: UNAUTHORIZED };
  if (!uuid.safeParse(hangoutId).success) return { error: "Hangout not found" };

  await prisma.hangoutRider.deleteMany({ where: { hangoutId, userId: user.id } });
  revalidate(hangoutId);
  return { success: true };
}

export async function removeRiderAction(
  carId: string,
  userId: string
): Promise<CarpoolActionResult> {
  const owned = await ownedCar(carId);
  if (!owned.car) return { error: owned.error };

  await prisma.hangoutRider.deleteMany({ where: { carId: owned.car.id, userId } });
  revalidate(owned.car.hangoutId);
  return { success: true };
}
