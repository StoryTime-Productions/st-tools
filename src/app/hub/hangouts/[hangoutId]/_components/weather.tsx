import { TriangleAlert } from "lucide-react";
import type { StopWeather } from "@/lib/weather";
import { describeWeather } from "@/lib/weather-codes";

const NO_FORECAST = {
  none: "No forecast (stop not on the map)",
  far: "Forecast not available yet",
  unavailable: "Forecast unavailable",
};

export function WeatherChip({ weather }: { weather: StopWeather }) {
  if (weather.status !== "ok") {
    return <p className="text-muted-foreground text-xs">{NO_FORECAST[weather.status]}</p>;
  }
  const { label, Icon } = describeWeather(weather.code);
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs">
      <Icon className="size-4" aria-hidden="true" />
      <span>
        {label}, {weather.temperature}°C · {weather.chance}% precipitation
      </span>
      {weather.warnings.length > 0 ? (
        <span className="text-destructive inline-flex items-center gap-1 font-medium">
          <TriangleAlert className="size-3.5" aria-hidden="true" />
          {weather.warnings.join(", ")}
        </span>
      ) : null}
    </p>
  );
}

export function WeatherCredit() {
  return (
    <p className="text-muted-foreground text-xs">
      Weather data by{" "}
      <a
        href="https://open-meteo.com/"
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2"
      >
        Open-Meteo.com
      </a>{" "}
      (CC BY 4.0)
    </p>
  );
}
