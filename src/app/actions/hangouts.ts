"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AttendanceStatus, HangoutStatus, Role, StopType } from "@prisma/client";
import { keepInWindow, rankRuns } from "@/lib/availability";
import { torontoToUtc } from "@/lib/calendar";
import { resplitCosts } from "@/lib/cost-shares";
import { uploadCover } from "@/lib/cover-upload";
import { getCurrentUser } from "@/lib/get-current-user";
import { prisma } from "@/lib/prisma";
import { recomputeRoutes } from "@/lib/routes";
import { locateAddress } from "@/lib/tomtom";

export type HangoutActionResult = { error: string } | { success: true };
export type CreateHangoutResult = { error: string } | { success: true; hangoutId: string };
export type AvailabilitySetupResult = HangoutActionResult | { confirmDrop: number };

const FORBIDDEN = "Forbidden: Admin access required";
const NOT_FOUND = "Hangout not found";
const NOT_COLLECTING = "Hangout not found or no longer collecting availability";

const hangoutDetailsSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title is too long"),
  description: z.string().trim().max(5000, "Description is too long").nullable(),
  discordThreadUrl: z
    .string()
    .trim()
    .regex(
      /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/\d+\/\d+/,
      "Thread link must be a discord.com/channels/... link"
    )
    .nullable(),
});

const updateHangoutSchema = hangoutDetailsSchema.extend({ hangoutId: z.string().uuid() });

async function requireAdmin() {
  const currentUser = await getCurrentUser();
  return currentUser?.role === Role.ADMIN ? currentUser : null;
}

function revalidateHangout(hangoutId: string) {
  revalidatePath("/hub");
  revalidatePath(`/hub/hangouts/${hangoutId}`);
}

export async function createHangoutAction(
  values: z.infer<typeof hangoutDetailsSchema>
): Promise<CreateHangoutResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = hangoutDetailsSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const hangout = await prisma.hangout.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      discordThreadUrl: parsed.data.discordThreadUrl || null,
    },
    select: { id: true },
  });

  revalidateHangout(hangout.id);
  return { success: true, hangoutId: hangout.id };
}

export async function updateHangoutAction(
  values: z.infer<typeof updateHangoutSchema>
): Promise<HangoutActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = updateHangoutSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await prisma.hangout.updateMany({
    where: { id: parsed.data.hangoutId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      discordThreadUrl: parsed.data.discordThreadUrl || null,
    },
  });
  if (result.count === 0) return { error: NOT_FOUND };

  revalidateHangout(parsed.data.hangoutId);
  return { success: true };
}

export async function setWeatherBufferAction(
  hangoutId: string,
  minutes: number
): Promise<HangoutActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = z
    .object({
      hangoutId: z.string().uuid(),
      minutes: z
        .number()
        .int("Use whole minutes")
        .min(0, "Minimum is 0")
        .max(120, "Maximum is 120"),
    })
    .safeParse({ hangoutId, minutes });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await prisma.hangout.updateMany({
    where: { id: parsed.data.hangoutId, status: { not: HangoutStatus.CANCELLED } },
    data: { weatherBufferMinutes: parsed.data.minutes },
  });
  if (result.count === 0) return { error: NOT_FOUND };

  revalidateHangout(parsed.data.hangoutId);
  return { success: true };
}

export async function cancelHangoutAction(hangoutId: string): Promise<HangoutActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = z.string().uuid().safeParse(hangoutId);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await prisma.hangout.updateMany({
    where: { id: parsed.data },
    data: { status: HangoutStatus.CANCELLED },
  });
  if (result.count === 0) return { error: NOT_FOUND };

  revalidateHangout(parsed.data);
  return { success: true };
}

async function saveHangoutCover(hangoutId: string, coverImageUrl: string | null) {
  const result = await prisma.hangout.updateMany({
    where: { id: hangoutId },
    data: { coverImageUrl },
  });
  if (result.count === 0) return { error: NOT_FOUND };

  revalidateHangout(hangoutId);
  return { success: true } as const;
}

export async function setHangoutCoverUrlAction(
  hangoutId: string,
  url: string | null
): Promise<HangoutActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = z
    .object({
      hangoutId: z.string().uuid(),
      url: z
        .string()
        .trim()
        .url("Enter a full image URL")
        .refine((value) => /^https?:\/\//i.test(value), "Image URLs must start with http(s)://")
        .nullable(),
    })
    .safeParse({ hangoutId, url });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  return saveHangoutCover(parsed.data.hangoutId, parsed.data.url);
}

export async function uploadHangoutCoverAction(formData: FormData): Promise<HangoutActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: FORBIDDEN };

  const hangoutId = z.string().uuid().safeParse(formData.get("hangoutId"));
  if (!hangoutId.success) return { error: "Invalid hangout" };

  const cover = await uploadCover(
    formData.get("cover"),
    `${admin.id}/hangout-covers/${hangoutId.data}`
  );
  if ("error" in cover) return cover;

  return saveHangoutCover(hangoutId.data, cover.url);
}

const IDEA_GONE = "Idea not found or already promoted";

class IdeaTaken extends Error {}

export async function promoteIdeaAction(ideaId: string): Promise<CreateHangoutResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = z.string().uuid().safeParse(ideaId);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const hangoutId = await prisma.$transaction(async (tx) => {
      const idea = await tx.hangoutIdea.findFirst({
        where: { id: parsed.data, hangoutId: null },
        select: { title: true, details: true },
      });
      if (!idea) throw new IdeaTaken();

      const hangout = await tx.hangout.create({
        data: { title: idea.title, description: idea.details },
        select: { id: true },
      });
      const linked = await tx.hangoutIdea.updateMany({
        where: { id: parsed.data, hangoutId: null },
        data: { hangoutId: hangout.id },
      });
      if (linked.count === 0) throw new IdeaTaken();
      return hangout.id;
    });

    revalidateHangout(hangoutId);
    revalidatePath("/hub/ideas");
    return { success: true, hangoutId };
  } catch (error) {
    if (error instanceof IdeaTaken) return { error: IDEA_GONE };
    throw error;
  }
}

export async function dismissIdeaAction(ideaId: string): Promise<HangoutActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = z.string().uuid().safeParse(ideaId);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await prisma.hangoutIdea.deleteMany({
    where: { id: parsed.data, hangoutId: null },
  });
  if (result.count === 0) return { error: IDEA_GONE };

  revalidatePath("/hub/ideas");
  return { success: true };
}

const dayKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must look like 2026-10-03")
  .refine((key) => !Number.isNaN(Date.parse(`${key}T00:00:00Z`)), "Invalid date");

const availabilitySetupSchema = z
  .object({
    hangoutId: z.string().uuid(),
    dates: z.array(dayKey).min(1, "Pick at least one date").max(60, "Pick 60 dates or fewer"),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    deadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Deadline needs a date and time")
      .nullable(),
  })
  .refine((setup) => setup.endHour > setup.startHour, "End time must be after the start time");

export async function setAvailabilitySetupAction(
  values: z.infer<typeof availabilitySetupSchema>,
  confirmDrop = false
): Promise<AvailabilitySetupResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = availabilitySetupSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { hangoutId, dates, startHour, endHour, deadline } = parsed.data;
  const window = { dates: [...new Set(dates)].sort(), startHour, endHour };

  const responses = await prisma.hangoutAvailability.findMany({
    where: { hangoutId },
    select: { userId: true, slots: true },
  });
  const trimmed = responses
    .map(({ userId, slots }) => ({ userId, slots: keepInWindow(slots, window), before: slots }))
    .filter(({ slots, before }) => slots.length !== before.length);
  if (trimmed.length > 0 && !confirmDrop) return { confirmDrop: trimmed.length };

  const [deadlineDay, deadlineTime] = deadline?.split("T") ?? [];
  const [hours, minutes] = deadlineTime?.split(":").map(Number) ?? [];

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.hangout.updateMany({
      where: { id: hangoutId, status: HangoutStatus.COLLECTING },
      data: {
        availabilityDates: window.dates,
        windowStartHour: startHour,
        windowEndHour: endHour,
        availabilityDeadline: deadline ? torontoToUtc(deadlineDay, hours * 60 + minutes) : null,
      },
    });
    if (result.count === 0) return false;
    for (const { userId, slots } of trimmed) {
      const where = { hangoutId_userId: { hangoutId, userId } };
      if (slots.length === 0) await tx.hangoutAvailability.delete({ where });
      else await tx.hangoutAvailability.update({ where, data: { slots } });
    }
    return true;
  });
  if (!updated) return { error: NOT_COLLECTING };

  revalidateHangout(hangoutId);
  return { success: true };
}

const saveAvailabilitySchema = z.object({
  hangoutId: z.string().uuid(),
  slots: z.array(z.string()).max(6000),
});

export async function saveAvailabilityAction(
  values: z.infer<typeof saveAvailabilitySchema>
): Promise<HangoutActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Unauthorized" };

  const parsed = saveAvailabilitySchema.safeParse(values);
  if (!parsed.success) return { error: "Invalid availability" };
  const { hangoutId } = parsed.data;

  const hangout = await prisma.hangout.findUnique({
    where: { id: hangoutId },
    select: { status: true, availabilityDates: true, windowStartHour: true, windowEndHour: true },
  });
  if (hangout?.status !== HangoutStatus.COLLECTING) return { error: NOT_COLLECTING };

  const slots = keepInWindow(parsed.data.slots, {
    dates: hangout.availabilityDates,
    startHour: hangout.windowStartHour,
    endHour: hangout.windowEndHour,
  });
  const where = { hangoutId, userId: currentUser.id };
  if (slots.length === 0) await prisma.hangoutAvailability.deleteMany({ where });
  else
    await prisma.hangoutAvailability.upsert({
      where: { hangoutId_userId: where },
      create: { ...where, slots },
      update: { slots },
    });

  revalidatePath(`/hub/hangouts/${hangoutId}`);
  return { success: true };
}

const lockInSchema = z.object({
  hangoutId: z.string().uuid(),
  slot: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Invalid time"),
});

export async function lockInHangoutAction(
  values: z.infer<typeof lockInSchema>
): Promise<HangoutActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = lockInSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { hangoutId, slot } = parsed.data;

  const hangout = await prisma.hangout.findUnique({
    where: { id: hangoutId },
    select: {
      status: true,
      availabilityDates: true,
      windowStartHour: true,
      windowEndHour: true,
      availability: { select: { userId: true, slots: true } },
    },
  });
  if (hangout?.status !== HangoutStatus.COLLECTING) return { error: NOT_COLLECTING };

  const responses = hangout.availability;
  const window = {
    dates: hangout.availabilityDates,
    startHour: hangout.windowStartHour,
    endHour: hangout.windowEndHour,
  };
  const run = rankRuns(window, responses).find((r) => `${r.day}T${r.start}` === slot);
  if (!run) return { error: "That time is no longer a top option" };

  const locked = await prisma.$transaction(async (tx) => {
    const result = await tx.hangout.updateMany({
      where: { id: hangoutId, status: HangoutStatus.COLLECTING },
      data: { status: HangoutStatus.SCHEDULED, startSlot: slot },
    });
    if (result.count === 0) return false;
    await tx.hangoutAttendee.deleteMany({ where: { hangoutId } });
    await tx.hangoutAttendee.createMany({
      data: responses.map(({ userId }) => ({
        hangoutId,
        userId,
        status: run.free.includes(userId) ? AttendanceStatus.GOING : AttendanceStatus.MAYBE,
      })),
    });
    return true;
  });
  if (!locked) return { error: NOT_COLLECTING };
  await resplitCosts(hangoutId);

  revalidateHangout(hangoutId);
  return { success: true };
}

export async function reopenAvailabilityAction(hangoutId: string): Promise<HangoutActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = z.string().uuid().safeParse(hangoutId);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const reopened = await prisma.$transaction(async (tx) => {
    const result = await tx.hangout.updateMany({
      where: { id: parsed.data, status: HangoutStatus.SCHEDULED },
      data: { status: HangoutStatus.COLLECTING, startSlot: null },
    });
    if (result.count === 0) return false;
    await tx.hangoutAttendee.deleteMany({ where: { hangoutId: parsed.data } });
    await tx.hangoutCar.deleteMany({ where: { hangoutId: parsed.data } });
    await tx.hangoutCostShare.deleteMany({ where: { cost: { hangoutId: parsed.data } } });
    return true;
  });
  if (!reopened) return { error: "Hangout not found or not scheduled" };

  revalidateHangout(parsed.data);
  return { success: true };
}

const attendanceSchema = z.object({
  hangoutId: z.string().uuid(),
  status: z.nativeEnum(AttendanceStatus),
});

export async function setAttendanceAction(
  values: z.infer<typeof attendanceSchema>
): Promise<HangoutActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Unauthorized" };

  const parsed = attendanceSchema.safeParse(values);
  if (!parsed.success) return { error: "Invalid attendance" };
  const { hangoutId, status } = parsed.data;

  const hangout = await prisma.hangout.findUnique({
    where: { id: hangoutId },
    select: { status: true },
  });
  if (hangout?.status !== HangoutStatus.SCHEDULED) return { error: "Hangout is not scheduled" };

  const key = { hangoutId, userId: currentUser.id };
  await prisma.$transaction([
    prisma.hangoutAttendee.upsert({
      where: { hangoutId_userId: key },
      create: { ...key, status },
      update: { status },
    }),
    ...(status === AttendanceStatus.GOING
      ? []
      : [
          prisma.hangoutRider.deleteMany({ where: key }),
          prisma.hangoutCar.deleteMany({ where: { hangoutId, driverId: currentUser.id } }),
        ]),
  ]);

  if (status !== AttendanceStatus.GOING) await recomputeRoutes(hangoutId);
  await resplitCosts(hangoutId);
  revalidateHangout(hangoutId);
  return { success: true };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);

const stopSchema = z.object({
  type: z.nativeEnum(StopType),
  title: z.string().trim().min(1, "Stop name is required").max(120, "Stop name is too long"),
  address: optionalText(300),
  durationMinutes: z.number().int().min(0).max(1440, "Duration must be 24 hours or less"),
  arriveBy: z
    .string()
    .regex(/^([1-9]|1[0-4])T([01]\d|2[0-3]):[0-5]\d$/, "Arrive-by needs a day (1-14) and a time")
    .nullable(),
  notes: optionalText(2000),
  bring: optionalText(500),
  cashCents: z.number().int().min(0).max(1_000_000).nullable(),
});

export type StopValues = z.input<typeof stopSchema>;
const EDITABLE = { not: HangoutStatus.CANCELLED };
const STOP_NOT_FOUND = "Stop not found or hangout cancelled";

export async function addStopAction(
  hangoutId: string,
  values: StopValues
): Promise<HangoutActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = stopSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!z.string().uuid().safeParse(hangoutId).success) return { error: NOT_FOUND };

  const hangout = await prisma.hangout.findFirst({
    where: { id: hangoutId, status: EDITABLE },
    select: { stops: { select: { position: true }, orderBy: { position: "desc" }, take: 1 } },
  });
  if (!hangout) return { error: "Hangout not found or cancelled" };

  const place = await locateAddress(parsed.data.address);
  if (place && "error" in place) return { error: place.error! };

  await prisma.hangoutStop.create({
    data: {
      ...parsed.data,
      ...place,
      hangoutId,
      position: (hangout.stops[0]?.position ?? -1) + 1,
    },
  });

  await recomputeRoutes(hangoutId);
  revalidateHangout(hangoutId);
  return { success: true };
}

async function findEditableStop(stopId: string) {
  if (!z.string().uuid().safeParse(stopId).success) return null;
  return prisma.hangoutStop.findFirst({
    where: { id: stopId, hangout: { status: EDITABLE } },
    select: { id: true, hangoutId: true, position: true, address: true },
  });
}

export async function updateStopAction(
  stopId: string,
  values: StopValues
): Promise<HangoutActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = stopSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const stop = await findEditableStop(stopId);
  if (!stop) return { error: STOP_NOT_FOUND };

  const place = await locateAddress(parsed.data.address, stop.address);
  if (place && "error" in place) return { error: place.error! };

  await prisma.hangoutStop.update({ where: { id: stop.id }, data: { ...parsed.data, ...place } });

  await recomputeRoutes(stop.hangoutId);
  revalidateHangout(stop.hangoutId);
  return { success: true };
}

export async function deleteStopAction(stopId: string): Promise<HangoutActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const stop = await findEditableStop(stopId);
  if (!stop) return { error: STOP_NOT_FOUND };

  await prisma.hangoutStop.delete({ where: { id: stop.id } });

  await recomputeRoutes(stop.hangoutId);
  revalidateHangout(stop.hangoutId);
  return { success: true };
}

export async function moveStopAction(
  stopId: string,
  direction: -1 | 1
): Promise<HangoutActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const stop = await findEditableStop(stopId);
  if (!stop) return { error: STOP_NOT_FOUND };

  const neighbour = await prisma.hangoutStop.findFirst({
    where: {
      hangoutId: stop.hangoutId,
      position: direction < 0 ? { lt: stop.position } : { gt: stop.position },
    },
    orderBy: { position: direction < 0 ? "desc" : "asc" },
    select: { id: true, position: true },
  });
  if (!neighbour) return { success: true };

  await prisma.$transaction([
    prisma.hangoutStop.update({ where: { id: stop.id }, data: { position: neighbour.position } }),
    prisma.hangoutStop.update({ where: { id: neighbour.id }, data: { position: stop.position } }),
  ]);

  await recomputeRoutes(stop.hangoutId);
  revalidateHangout(stop.hangoutId);
  return { success: true };
}
