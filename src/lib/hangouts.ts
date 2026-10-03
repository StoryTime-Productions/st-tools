import type { AttendanceStatus, HangoutStatus, StopType } from "@prisma/client";
import type { AvailabilityResponse } from "@/lib/availability";
import { scheduleStops, spanDays } from "@/lib/itinerary";
import { prisma } from "@/lib/prisma";
import type { CarSchedule } from "@/lib/routes";

export interface HangoutSummary {
  id: string;
  title: string;
  coverImageUrl: string | null;
  status: HangoutStatus;
  startSlot: string | null;
}

export interface HangoutDetail extends HangoutSummary {
  weatherBufferMinutes: number;
  description: string | null;
  discordThreadUrl: string | null;
  proposerName: string | null;
  availabilityDates: string[];
  windowStartHour: number;
  windowEndHour: number;
  availabilityDeadline: Date | null;
  attendees: { userId: string; name: string; status: AttendanceStatus }[];
  stops: HangoutStopItem[];
  cars: HangoutCarItem[];
}

interface Person {
  userId: string;
  name: string;
  homeAddress: string | null;
  homeLat: number | null;
  homeLon: number | null;
}

export interface HangoutCarItem {
  id: string;
  seats: number;
  startAddress: string | null;
  startLat: number | null;
  startLon: number | null;
  commonPoint: string | null;
  commonLat: number | null;
  commonLon: number | null;
  schedule: CarSchedule | null;
  driver: Person;
  riders: (Person & { atCommonPoint: boolean })[];
}

const PERSON_SELECT = {
  id: true,
  name: true,
  email: true,
  homeAddress: true,
  homeLat: true,
  homeLon: true,
} as const;

function person(user: {
  id: string;
  name: string | null;
  email: string;
  homeAddress: string | null;
  homeLat: number | null;
  homeLon: number | null;
}) {
  return {
    userId: user.id,
    name: user.name ?? user.email,
    homeAddress: user.homeAddress,
    homeLat: user.homeLat,
    homeLon: user.homeLon,
  };
}

export interface HangoutStopItem {
  id: string;
  type: StopType;
  title: string;
  address: string | null;
  lat: number | null;
  lon: number | null;
  durationMinutes: number;
  arriveBy: string | null;
  notes: string | null;
  bring: string | null;
  cashCents: number | null;
}

const STOP_SELECT = {
  id: true,
  type: true,
  title: true,
  address: true,
  lat: true,
  lon: true,
  durationMinutes: true,
  arriveBy: true,
  notes: true,
  bring: true,
  cashCents: true,
} as const;

export interface HangoutIdeaItem {
  id: string;
  title: string;
  details: string | null;
  createdAt: Date;
  proposerName: string;
  proposerAvatarUrl: string | null;
}

export async function getHangoutSummaries(): Promise<HangoutSummary[]> {
  return prisma.hangout.findMany({
    select: { id: true, title: true, coverImageUrl: true, status: true, startSlot: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getHangoutDetail(hangoutId: string): Promise<HangoutDetail | null> {
  const hangout = await prisma.hangout.findUnique({
    where: { id: hangoutId },
    select: {
      id: true,
      title: true,
      coverImageUrl: true,
      status: true,
      startSlot: true,
      weatherBufferMinutes: true,
      description: true,
      discordThreadUrl: true,
      availabilityDates: true,
      windowStartHour: true,
      windowEndHour: true,
      availabilityDeadline: true,
      idea: { select: { proposerName: true } },
      attendees: {
        select: { userId: true, status: true, user: { select: { name: true, email: true } } },
        orderBy: { user: { name: "asc" } },
      },
      stops: { select: STOP_SELECT, orderBy: { position: "asc" } },
      cars: {
        select: {
          id: true,
          seats: true,
          startAddress: true,
          startLat: true,
          startLon: true,
          commonPoint: true,
          commonLat: true,
          commonLon: true,
          schedule: true,
          driver: { select: PERSON_SELECT },
          riders: {
            select: { atCommonPoint: true, user: { select: PERSON_SELECT } },
            orderBy: { user: { name: "asc" } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!hangout) return null;
  const { idea, attendees, cars, ...detail } = hangout;
  return {
    ...detail,
    proposerName: idea?.proposerName ?? null,
    cars: cars.map(({ driver, riders, schedule, ...car }) => ({
      ...car,
      schedule: schedule as CarSchedule | null,
      driver: person(driver),
      riders: riders.map(({ atCommonPoint, user }) => ({ ...person(user), atCommonPoint })),
    })),
    attendees: attendees.map(({ userId, status, user }) => ({
      userId,
      status,
      name: user.name ?? user.email,
    })),
  };
}

export async function getAvailabilityResponses(hangoutId: string): Promise<AvailabilityResponse[]> {
  const rows = await prisma.hangoutAvailability.findMany({
    where: { hangoutId },
    select: { userId: true, slots: true, user: { select: { name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map(({ userId, slots, user }) => ({ userId, slots, name: user.name ?? user.email }));
}

export async function getOpenIdeas(): Promise<HangoutIdeaItem[]> {
  const ideas = await prisma.hangoutIdea.findMany({
    where: { hangoutId: null },
    select: {
      id: true,
      title: true,
      details: true,
      createdAt: true,
      proposerName: true,
      proposerDiscordId: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const users = await prisma.user.findMany({
    where: { discordId: { in: ideas.map((idea) => idea.proposerDiscordId) } },
    select: { discordId: true, name: true, avatarUrl: true },
  });
  const byDiscordId = new Map(users.map((user) => [user.discordId, user]));

  return ideas.map(({ proposerDiscordId, ...idea }) => {
    const user = byDiscordId.get(proposerDiscordId);
    return {
      ...idea,
      proposerName: user?.name ?? idea.proposerName,
      proposerAvatarUrl: user?.avatarUrl ?? null,
    };
  });
}

export interface CalendarHangout {
  id: string;
  title: string;
  status: HangoutStatus;
  startSlot: string | null;
  days: string[];
  goingCount: number;
}

/** Scheduled hangouts on every day from start to itinerary end; collecting ones on each candidate date. */
export async function getCalendarHangouts(): Promise<CalendarHangout[]> {
  const hangouts = await prisma.hangout.findMany({
    where: { status: { in: ["COLLECTING", "SCHEDULED"] } },
    select: {
      id: true,
      title: true,
      status: true,
      startSlot: true,
      availabilityDates: true,
      stops: { select: { durationMinutes: true, arriveBy: true }, orderBy: { position: "asc" } },
      _count: { select: { attendees: { where: { status: "GOING" } } } },
    },
    orderBy: { title: "asc" },
  });
  return hangouts.map(({ availabilityDates, stops, _count, ...hangout }) => ({
    ...hangout,
    days: hangout.startSlot
      ? spanDays(hangout.startSlot.slice(0, 10), scheduleStops(hangout.startSlot, stops).end)
      : availabilityDates,
    goingCount: _count.attendees,
  }));
}
