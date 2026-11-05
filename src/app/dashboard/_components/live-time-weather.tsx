"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parsePreviewOverride, type PreviewOverride } from "@/lib/psx-weather/preview";
import { parseLocalMinutes } from "@/lib/psx-weather/time-of-day";
import { describeWeather, sceneConditionFor } from "@/lib/weather-codes";
import { WeatherScene } from "./weather-scene";

type WeatherInfo = {
  temperature: number;
  unit: string;
  weatherCode: number;
  locationLabel: string;
  /** minutes since midnight at the weather location when the forecast was fetched (its own timezone) */
  localMinutes?: number;
  /** today's sunrise and sunset, minutes since midnight at the weather location */
  sunrise?: number;
  sunset?: number;
};

type IpLocation = {
  latitude: number;
  longitude: number;
  city?: string;
  region?: string;
  country_name?: string;
};

type CachedWeatherRecord = {
  weather: WeatherInfo;
  fetchedAt: number;
};

const WEATHER_REFRESH_MS = 60 * 60 * 1000;
const WEATHER_CACHE_KEY = "dashboard-weather-cache-v1";
const WEATHER_ERROR = "Weather unavailable right now.";

function isValidWeatherInfo(value: unknown): value is WeatherInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.temperature === "number" &&
    typeof candidate.unit === "string" &&
    typeof candidate.weatherCode === "number" &&
    typeof candidate.locationLabel === "string" &&
    ["localMinutes", "sunrise", "sunset"].every(
      (key) => candidate[key] === undefined || typeof candidate[key] === "number"
    )
  );
}

type CachedWeather = { weather: WeatherInfo; fetchedAt: number };

function readCachedWeather(): CachedWeather | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(WEATHER_CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CachedWeatherRecord;
    if (typeof parsed.fetchedAt !== "number" || !isValidWeatherInfo(parsed.weather)) {
      window.localStorage.removeItem(WEATHER_CACHE_KEY);
      return null;
    }

    const ageMs = Date.now() - parsed.fetchedAt;
    if (ageMs > WEATHER_REFRESH_MS) {
      window.localStorage.removeItem(WEATHER_CACHE_KEY);
      return null;
    }

    return { weather: parsed.weather, fetchedAt: parsed.fetchedAt };
  } catch {
    window.localStorage.removeItem(WEATHER_CACHE_KEY);
    return null;
  }
}

function writeCachedWeather(weather: WeatherInfo, fetchedAt: number) {
  if (typeof window === "undefined") {
    return;
  }

  const payload: CachedWeatherRecord = {
    weather,
    fetchedAt,
  };

  window.localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(payload));
}

async function loadWeather(): Promise<WeatherInfo> {
  const locationRes = await fetch("https://ipapi.co/json/");
  if (!locationRes.ok) {
    throw new Error("Could not resolve location.");
  }

  const location = (await locationRes.json()) as IpLocation;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Location lookup was incomplete.");
  }

  const locationLabel = [location.city, location.region, location.country_name]
    .filter(Boolean)
    .join(", ");

  const forecastRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=sunrise,sunset&forecast_days=1&timezone=auto`
  );

  if (!forecastRes.ok) {
    throw new Error("Could not load weather.");
  }

  const forecast = (await forecastRes.json()) as {
    current?: { time?: string; temperature_2m?: number; weather_code?: number };
    current_units?: { temperature_2m?: string };
    daily?: { sunrise?: string[]; sunset?: string[] };
  };

  if (
    typeof forecast.current?.temperature_2m !== "number" ||
    typeof forecast.current?.weather_code !== "number"
  ) {
    throw new Error("Weather data was incomplete.");
  }

  // the timestamps are in the weather location's own timezone (timezone=auto), not the viewer's
  const localMinutes = parseLocalMinutes(forecast.current.time);
  const sunrise = parseLocalMinutes(forecast.daily?.sunrise?.[0]);
  const sunset = parseLocalMinutes(forecast.daily?.sunset?.[0]);

  return {
    temperature: forecast.current.temperature_2m,
    weatherCode: forecast.current.weather_code,
    unit: forecast.current_units?.temperature_2m ?? "C",
    locationLabel,
    ...(localMinutes !== null ? { localMinutes } : {}),
    ...(sunrise !== null ? { sunrise } : {}),
    ...(sunset !== null ? { sunset } : {}),
  };
}

function viewerMinutes(at: number) {
  const date = new Date(at);
  return date.getHours() * 60 + date.getMinutes();
}

export function LiveTimeWeather({ firstName }: { firstName: string }) {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [override, setOverride] = useState<PreviewOverride | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // `?weather=rain&time=16:45` pins the scene for design review; never in production
    setOverride(
      parsePreviewOverride(window.location.search, process.env.NODE_ENV === "production")
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshWeather() {
      const cachedWeather = readCachedWeather();

      if (cachedWeather) {
        if (!cancelled) {
          setWeather(cachedWeather.weather);
          setFetchedAt(cachedWeather.fetchedAt);
          setIsWeatherLoading(false);
        }

        return;
      }

      setIsWeatherLoading(true);

      try {
        const nextWeather = await loadWeather();
        if (!cancelled) {
          const now = Date.now();
          setWeather(nextWeather);
          setFetchedAt(now);
          writeCachedWeather(nextWeather, now);
        }
      } catch {
        // The card shows a friendly message with Retry; the cause is not useful on a dashboard.
      } finally {
        if (!cancelled) {
          setIsWeatherLoading(false);
        }
      }
    }

    refreshWeather();
    const refreshTimer = setInterval(refreshWeather, WEATHER_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
    };
  }, [attempt]);

  const liveDate = useMemo(
    () =>
      now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [now]
  );

  const liveTime = useMemo(() => {
    const parts = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(now);

    return {
      timeText: parts
        .filter(
          (part) =>
            part.type !== "dayPeriod" &&
            !(part.type === "literal" && part.value.trim().length === 0)
        )
        .map((part) => part.value)
        .join(""),
      dayPeriod: parts.find((part) => part.type === "dayPeriod")?.value ?? null,
    };
  }, [now]);

  const weatherView = useMemo(() => {
    if (isWeatherLoading) {
      return (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-300">
          <LoaderCircle className="size-4 animate-spin" />
          Loading weather...
        </p>
      );
    }

    if (!weather) {
      return (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-300"
        >
          {WEATHER_ERROR}
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="rounded-full border-slate-500 bg-transparent text-slate-100 hover:bg-slate-800 hover:text-white dark:border-slate-500 dark:bg-transparent dark:hover:bg-slate-800"
            onClick={() => {
              setAttempt((count) => count + 1);
              // the button is replaced by the loading line, so keep keyboard focus on the card
              statusRef.current?.focus();
            }}
          >
            Retry
          </Button>
        </p>
      );
    }

    const { label, Icon } = describeWeather(weather.weatherCode);
    const displayUnit = weather.unit.replace(/\s+/g, "") || "°C";

    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-200">
        <Icon className="size-4" />
        <span>
          {Math.round(weather.temperature)}
          {displayUnit}
        </span>
        <span className="text-slate-400">-</span>
        <span>{label}</span>
        {weather.locationLabel ? (
          <>
            <span className="text-slate-400">-</span>
            <span>{weather.locationLabel}</span>
          </>
        ) : null}
      </p>
    );
  }, [isWeatherLoading, weather]);

  // the scene needs the weather (or a preview override); loading and error states stay plain navy
  const sceneCondition =
    override?.condition ?? (weather ? sceneConditionFor(weather.weatherCode) : null);
  const sceneMinutes =
    override?.minutes ?? weather?.localMinutes ?? viewerMinutes(fetchedAt || Date.now());

  return (
    <>
      {sceneCondition ? (
        <WeatherScene
          condition={sceneCondition}
          baseMinutes={sceneMinutes}
          baseAt={override?.minutes !== undefined ? 0 : fetchedAt || Date.now()}
          sunrise={weather?.sunrise}
          sunset={weather?.sunset}
          fixedClock={override?.minutes !== undefined}
          textKey={`${isWeatherLoading}|${weather?.locationLabel}|${weather?.weatherCode}|${weather?.temperature}`}
        />
      ) : null}
      <div className="relative z-10 space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Welcome back, {firstName}
        </h2>
        <p className="text-sm text-slate-300 md:text-base">
          {liveDate} -{" "}
          <span className="inline-flex items-baseline gap-2">
            <span className="tabular-nums">{liveTime.timeText}</span>
            {liveTime.dayPeriod ? (
              <span className="inline-flex w-10 justify-start">{liveTime.dayPeriod}</span>
            ) : null}
          </span>
        </p>
        <div ref={statusRef} tabIndex={-1} className="outline-none">
          {weatherView}
        </div>
      </div>
    </>
  );
}
