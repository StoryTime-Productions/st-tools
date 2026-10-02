import { addDays, todayKey } from "@/lib/calendar";

export interface HourForecast {
  temperature: number;
  precipitationChance: number;
  snowfall: number;
  gusts: number;
  code: number;
}

export type StopWeather =
  | { status: "ok"; temperature: number; chance: number; code: number; warnings: string[] }
  | { status: "none" | "far" | "unavailable" };

/** Open-Meteo forecasts reach 16 days, today included. */
const HORIZON_DAYS = 15;

const FREEZING_RAIN = [56, 57, 66, 67];
const THUNDERSTORM = [95, 96, 99];

/** Why an hour is risky (S2-11): snow, a 50% chance of precipitation, 60 km/h gusts, thunder or freezing rain. */
export function hourWarnings(hour: HourForecast) {
  const warnings: string[] = [];
  if (hour.snowfall > 0) warnings.push("Snow");
  if (hour.precipitationChance >= 50) warnings.push(`${hour.precipitationChance}% precipitation`);
  if (hour.gusts >= 60) warnings.push(`Gusts ${Math.round(hour.gusts)} km/h`);
  if (THUNDERSTORM.includes(hour.code)) warnings.push("Thunderstorm");
  if (FREEZING_RAIN.includes(hour.code)) warnings.push("Freezing rain");
  return warnings;
}

/** Summarise the hours a stop spans: first hour's conditions, worst chance, every distinct warning. */
export function summarizeHours(hours: HourForecast[]): StopWeather {
  if (hours.length === 0) return { status: "none" };
  const warnings = [...new Set(hours.flatMap(hourWarnings))];
  return {
    status: "ok",
    temperature: Math.round(hours[0].temperature),
    chance: Math.max(...hours.map((hour) => hour.precipitationChance)),
    code: hours[0].code,
    warnings,
  };
}

export interface WeatherStop {
  lat: number | null;
  lon: number | null;
  /** Minutes after Day 1 midnight, or null when the stop has no clock time. */
  at: number | null;
  durationMinutes: number;
}

interface Hourly {
  time: string[];
  temperature_2m: number[];
  precipitation_probability: number[];
  snowfall: number[];
  wind_gusts_10m: number[];
  weather_code: number[];
}

async function fetchHours(lat: number, lon: number, from: string, to: string) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: "temperature_2m,precipitation_probability,snowfall,wind_gusts_10m,weather_code",
    timezone: "America/Toronto",
    start_date: from,
    end_date: to,
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    next: { revalidate: 3600 },
  });
  if (!response.ok) return null;
  const { hourly } = (await response.json()) as { hourly?: Hourly };
  if (!hourly) return null;
  return new Map<string, HourForecast>(
    hourly.time.map((time, index) => [
      time.slice(0, 13),
      {
        temperature: hourly.temperature_2m[index],
        precipitationChance: hourly.precipitation_probability[index] ?? 0,
        snowfall: hourly.snowfall[index] ?? 0,
        gusts: hourly.wind_gusts_10m[index],
        code: hourly.weather_code[index],
      },
    ])
  );
}

/** Forecast per stop, in order. Never throws: outages come back as "unavailable" (W6). */
export async function getStopWeather(
  startDay: string,
  stops: WeatherStop[],
  today = todayKey()
): Promise<StopWeather[]> {
  const lastDay = addDays(today, HORIZON_DAYS);
  const spans = stops.map((stop) => {
    if (stop.lat === null || stop.lon === null || stop.at === null) return null;
    const first = Math.floor(stop.at / 60);
    const last = Math.floor((stop.at + Math.max(stop.durationMinutes, 1) - 1) / 60);
    const keys = Array.from({ length: last - first + 1 }, (_, offset) => {
      const hour = first + offset;
      return `${addDays(startDay, Math.floor(hour / 24))}T${String(hour % 24).padStart(2, "0")}`;
    });
    return { lat: stop.lat, lon: stop.lon, keys };
  });

  const locations = new Map<string, { lat: number; lon: number; from: string; to: string }>();
  for (const span of spans) {
    if (!span || span.keys[0].slice(0, 10) > lastDay) continue;
    const id = `${span.lat.toFixed(2)},${span.lon.toFixed(2)}`;
    const days = span.keys.map((key) => key.slice(0, 10));
    const known = locations.get(id);
    locations.set(id, {
      lat: Number(span.lat.toFixed(2)),
      lon: Number(span.lon.toFixed(2)),
      from: known && known.from < days[0] ? known.from : days[0],
      to: known && known.to > days[days.length - 1] ? known.to : days[days.length - 1],
    });
  }

  const forecasts = new Map<string, Map<string, HourForecast> | null>();
  await Promise.all(
    [...locations].map(async ([id, { lat, lon, from, to }]) => {
      try {
        forecasts.set(id, await fetchHours(lat, lon, from, to > lastDay ? lastDay : to));
      } catch {
        forecasts.set(id, null);
      }
    })
  );

  return spans.map((span): StopWeather => {
    if (!span) return { status: "none" };
    if (span.keys[0].slice(0, 10) > lastDay) return { status: "far" };
    const forecast = forecasts.get(`${span.lat.toFixed(2)},${span.lon.toFixed(2)}`);
    if (!forecast) return { status: "unavailable" };
    const hours = span.keys.flatMap((key) => forecast.get(key) ?? []);
    return hours.length > 0 ? summarizeHours(hours) : { status: "far" };
  });
}
