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
