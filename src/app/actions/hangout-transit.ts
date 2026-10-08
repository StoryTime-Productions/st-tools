"use server";

import { z } from "zod";
import { RideDirection } from "@prisma/client";
import { queueUpdate } from "@/lib/hangout-updates";
import { revalidateHangoutPage } from "@/lib/hangout-live";
import { prisma } from "@/lib/prisma";
import { goingUser } from "@/lib/rides";
import { recomputeRoutes } from "@/lib/routes";
import { geocodeAddress } from "@/lib/tomtom";

export type TransitActionResult = { error: string } | { success: true };

const uuid = z.string().uuid();
const direction = z.nativeEnum(RideDirection);
const address = z.string().trim().min(1, "Add an address").max(300, "Address is too long");

const wording = {
  [RideDirection.PICKUP]: "getting there",
  [RideDirection.DROPOFF]: "getting home",
};

const personName = (user: { name: string | null; email: string }) =>
  user.name ?? user.email.split("@")[0];

/** A typed place as coordinates; the profile home is reused as is so no lookup is spent on it. */
async function place(
  text: string,
  home: { homeAddress: string | null; homeLat: number | null; homeLon: number | null }
) {
  if (text === home.homeAddress && home.homeLat !== null && home.homeLon !== null)
    return { address: text, lat: home.homeLat, lon: home.homeLon };
  const match = await geocodeAddress(text);
  return match && match !== "no-match" ? match : null;
}

/**
 * Marks the caller as taking public transit for one direction (R4). The start is where they set
 * off from (getting there) or from (getting home); getting home also needs where they end up.
 * Choosing transit takes them off that direction's car lists (AC6).
 */
export async function setTransitAction(
  hangoutId: string,
  rideDirection: RideDirection,
  values: { start: string; destination?: string | null }
): Promise<TransitActionResult> {
  if (!uuid.safeParse(hangoutId).success) return { error: "Hangout not found" };
  const parsedDirection = direction.safeParse(rideDirection);
  const start = address.safeParse(values.start);
  if (!parsedDirection.success) return { error: "That isn't a valid trip" };
  if (!start.success) return { error: start.error.issues[0].message };
  const needsDestination = rideDirection === RideDirection.DROPOFF;
  const destination = needsDestination ? address.safeParse(values.destination ?? "") : null;
  if (destination && !destination.success) return { error: destination.error.issues[0].message };

  const going = await goingUser(hangoutId);
  if (!going.user) return { error: going.error };
  const { user } = going;
  if (await prisma.hangoutCar.findFirst({ where: { hangoutId, driverId: user.id } }))
    return { error: "You're driving your own car" };

  const from = await place(start.data, user);
  const to = destination?.success ? await place(destination.data, user) : null;
  if (!from || (destination && !to)) return { error: "Couldn't find that address" };

  const key = { hangoutId, userId: user.id, direction: rideDirection };
  const data = {
    startAddress: from.address,
    startLat: from.lat,
    startLon: from.lon,
    destAddress: to?.address ?? null,
    destLat: to?.lat ?? null,
    destLon: to?.lon ?? null,
  };
  const [dropped, existing] = await prisma.$transaction([
    prisma.hangoutPassenger.deleteMany({
      where: {
        hangoutId,
        direction: rideDirection,
        OR: [{ userId: user.id }, { viaUserId: user.id }],
      },
    }),
    prisma.hangoutTransit.findUnique({
      where: { hangoutId_userId_direction: key },
      select: { id: true },
    }),
    prisma.hangoutTransit.upsert({
      where: { hangoutId_userId_direction: key },
      create: { ...key, ...data },
      update: data,
    }),
  ]);
  if (!existing)
    await queueUpdate(
      hangoutId,
      "Carpools",
      "—",
      `${personName(user)} takes public transit (${wording[rideDirection]})`
    );
  // Only cars that lost a stop need new times.
  if (dropped.count > 0) await recomputeRoutes(hangoutId);
  revalidateHangoutPage(hangoutId);
  return { success: true };
}

/** Goes back to having no ride arranged for that direction. */
export async function clearTransitAction(
  hangoutId: string,
  rideDirection: RideDirection
): Promise<TransitActionResult> {
  if (!uuid.safeParse(hangoutId).success) return { error: "Hangout not found" };
  if (!direction.safeParse(rideDirection).success) return { error: "That isn't a valid trip" };

  const going = await goingUser(hangoutId);
  if (!going.user) return { error: going.error };

  const cleared = await prisma.hangoutTransit.deleteMany({
    where: { hangoutId, userId: going.user.id, direction: rideDirection },
  });
  if (cleared.count > 0)
    await queueUpdate(
      hangoutId,
      "Carpools",
      "—",
      `${personName(going.user)} no longer takes public transit (${wording[rideDirection]})`
    );
  revalidateHangoutPage(hangoutId);
  return { success: true };
}
