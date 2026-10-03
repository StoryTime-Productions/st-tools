import { addDays, dayLabel, timeLabel } from "@/lib/calendar";

export interface TimedStop {
  durationMinutes: number;
  /** `<day>T<HH:mm>`, day 1 = the locked day, e.g. `2T01:30`. */
  arriveBy: string | null;
}

/** Minutes after Day 1 midnight, or before anything pins the clock, minutes after the start. */
export type StopTime = { at: number; lateBy: number } | { offset: number };

const clockMinutes = (clock: string) => +clock.slice(0, 2) * 60 + +clock.slice(3, 5);

export function arriveByMinutes(arriveBy: string) {
  const [day, clock] = arriveBy.split("T");
  return (Number(day) - 1) * 1440 + clockMinutes(clock);
}

/** Chain stops from the start slot; an arrive-by pins its stop and wins over a later chained time. */
export function scheduleStops(start: string | null, stops: TimedStop[]) {
  let cursor = start ? clockMinutes(start.slice(11)) : 0;
  let pinned = Boolean(start);
  const times: StopTime[] = stops.map((stop) => {
    let time: StopTime;
    if (stop.arriveBy) {
      const at = arriveByMinutes(stop.arriveBy);
      time = { at, lateBy: pinned ? Math.max(0, cursor - at) : 0 };
      cursor = at;
      pinned = true;
    } else {
      time = pinned ? { at: cursor, lateBy: 0 } : { offset: cursor };
    }
    cursor += stop.durationMinutes;
    return time;
  });
  return { times, end: pinned && stops.length > 0 ? cursor : null };
}

/** Day number (1 = locked day) and `HH:mm` for minutes after Day 1 midnight. */
export function dayAndClock(minutes: number) {
  const inDay = minutes % 1440;
  return {
    day: Math.floor(minutes / 1440) + 1,
    clock: `${String(Math.floor(inDay / 60)).padStart(2, "0")}:${String(inDay % 60).padStart(2, "0")}`,
  };
}

export function timeText(time: StopTime, startDay: string | null) {
  if ("offset" in time) {
    return `+${Math.floor(time.offset / 60)}:${String(time.offset % 60).padStart(2, "0")}`;
  }
  const { day, clock } = dayAndClock(time.at);
  if (!startDay) return `Day ${day}, ${timeLabel(clock)}`;
  if (day === 1) return timeLabel(clock);
  return `${dayLabel(addDays(startDay, day - 1), { weekday: "short" })} ${timeLabel(clock)}`;
}

/** Every EST day key from the locked day through the end (an end at midnight stays on the day before). */
export function spanDays(startDay: string, end: number | null) {
  const lastIndex = end ? Math.max(0, Math.floor((end - 1) / 1440)) : 0;
  return Array.from({ length: lastIndex + 1 }, (_, index) => addDays(startDay, index));
}
