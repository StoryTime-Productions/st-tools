"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  LoaderCircle,
  Sun,
} from "lucide-react";

type WeatherInfo = {
  temperature: number;
  unit: string;
  weatherCode: number;
  locationLabel: string;
};

type IpLocation = {
  latitude: number;
  longitude: number;
  city?: string;
  region?: string;
  country_name?: string;
};

const WEATHER_REFRESH_MS = 15 * 60 * 1000;

function describeWeather(code: number): { label: string; Icon: typeof Sun } {
  if (code === 0) return { label: "Clear sky", Icon: Sun };
  if (code === 1 || code === 2) return { label: "Partly cloudy", Icon: CloudSun };
  if (code === 3) return { label: "Overcast", Icon: Cloud };
  if (code === 45 || code === 48) return { label: "Fog", Icon: CloudFog };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: "Drizzle", Icon: CloudDrizzle };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: "Rain", Icon: CloudRain };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "Snow", Icon: CloudSnow };
  if ([95, 96, 99].includes(code)) return { label: "Thunderstorm", Icon: CloudLightning };
  return { label: "Weather available", Icon: Cloud };
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
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`
  );

  if (!forecastRes.ok) {
    throw new Error("Could not load weather.");
  }

  const forecast = (await forecastRes.json()) as {
    current?: { temperature_2m?: number; weather_code?: number };
    current_units?: { temperature_2m?: string };
  };

  if (
    typeof forecast.current?.temperature_2m !== "number" ||
    typeof forecast.current?.weather_code !== "number"
  ) {
    throw new Error("Weather data was incomplete.");
  }

  return {
    temperature: forecast.current.temperature_2m,
    weatherCode: forecast.current.weather_code,
    unit: forecast.current_units?.temperature_2m ?? "C",
    locationLabel,
  };
}

export function LiveTimeWeather({ firstName }: { firstName: string }) {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshWeather() {
      setIsWeatherLoading(true);
      setWeatherError(null);

      try {
        const nextWeather = await loadWeather();
        if (!cancelled) {
          setWeather(nextWeather);
        }
      } catch (error) {
        if (!cancelled) {
          setWeatherError(
            error instanceof Error ? error.message : "Weather unavailable right now."
          );
        }
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
  }, []);

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
        <p className="flex items-center gap-2 text-sm text-slate-300">
          <LoaderCircle className="size-4 animate-spin" />
          Loading weather...
        </p>
      );
    }

    if (!weather) {
      return (
        <p className="text-sm text-slate-300">{weatherError ?? "Weather unavailable right now."}</p>
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
  }, [isWeatherLoading, weather, weatherError]);

  return (
    <div className="space-y-3">
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
      {weatherView}
    </div>
  );
}
