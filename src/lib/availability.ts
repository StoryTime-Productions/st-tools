export const SLOT_MINUTES = 15;

export interface AvailabilityWindow {
  dates: string[];
  startHour: number;
  endHour: number;
}

export interface AvailabilityResponse {
  userId: string;
  name: string;
  slots: string[];
}

/** Slot start times for one day, as `HH:mm`. */
export function slotTimes(startHour: number, endHour: number) {
  const times: string[] = [];
  for (let minutes = startHour * 60; minutes < endHour * 60; minutes += SLOT_MINUTES) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    times.push(`${hh}:${String(minutes % 60).padStart(2, "0")}`);
  }
  return times;
}

/** Every slot key (`YYYY-MM-DDTHH:mm`, EST) in a setup. */
export function slotKeys({ dates, startHour, endHour }: AvailabilityWindow) {
  const times = slotTimes(startHour, endHour);
  return dates.flatMap((day) => times.map((time) => `${day}T${time}`));
}

/** The slots that still fit a setup, deduplicated and sorted. */
export function keepInWindow(slots: string[], window: AvailabilityWindow) {
  const valid = new Set(slotKeys(window));
  return [...new Set(slots)].filter((slot) => valid.has(slot)).sort();
}

export interface RankedRun {
  day: string;
  start: string;
  end: string;
  free: string[];
}

/** Contiguous same-day runs with the same free people, most free first, earliest on ties. */
export function rankRuns(
  window: AvailabilityWindow,
  responses: Pick<AvailabilityResponse, "userId" | "slots">[],
  limit = 5
) {
  const runs: RankedRun[] = [];
  const times = slotTimes(window.startHour, window.endHour);
  const ends = [...times.slice(1), `${String(window.endHour).padStart(2, "0")}:00`];
  for (const day of window.dates) {
    let run: RankedRun | null = null;
    times.forEach((time, index) => {
      const slot = `${day}T${time}`;
      const free = responses.filter((r) => r.slots.includes(slot)).map((r) => r.userId);
      if (run && run.free.join() === free.join()) run.end = ends[index];
      else {
        run = free.length > 0 ? { day, start: time, end: ends[index], free } : null;
        if (run) runs.push(run);
      }
    });
  }
  return runs
    .sort(
      (a, b) =>
        b.free.length - a.free.length || `${a.day}${a.start}`.localeCompare(`${b.day}${b.start}`)
    )
    .slice(0, limit);
}
