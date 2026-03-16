import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LiveTimeWeather } from "@/app/dashboard/_components/live-time-weather";

const WEATHER_CACHE_KEY = "dashboard-weather-cache-v1";

describe("LiveTimeWeather", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses fresh cached weather without fetching", async () => {
    window.localStorage.setItem(
      WEATHER_CACHE_KEY,
      JSON.stringify({
        weather: {
          temperature: 22.4,
          unit: "°C",
          weatherCode: 1,
          locationLabel: "Pune, Maharashtra, India",
        },
        fetchedAt: Date.now(),
      })
    );

    render(<LiveTimeWeather firstName="Nirav" />);

    expect(await screen.findByText("Partly cloudy")).toBeInTheDocument();
    expect(screen.getByText("Pune, Maharashtra, India")).toBeInTheDocument();
    expect(screen.getByText(/22\s*°C/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads weather from APIs and writes cache", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          latitude: 18.52,
          longitude: 73.85,
          city: "Pune",
          region: "Maharashtra",
          country_name: "India",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: 19.8,
            weather_code: 63,
          },
          current_units: {
            temperature_2m: "° C",
          },
        }),
      } as Response);

    render(<LiveTimeWeather firstName="Nirav" />);

    expect(await screen.findByText("Rain")).toBeInTheDocument();
    expect(screen.getByText("Pune, Maharashtra, India")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    const cached = window.localStorage.getItem(WEATHER_CACHE_KEY);
    expect(cached).not.toBeNull();

    const parsed = JSON.parse(cached as string) as {
      weather: {
        temperature: number;
        weatherCode: number;
        unit: string;
        locationLabel: string;
      };
    };

    expect(parsed.weather).toEqual({
      temperature: 19.8,
      weatherCode: 63,
      unit: "° C",
      locationLabel: "Pune, Maharashtra, India",
    });
  });

  it("clears malformed cache and fetches a fresh weather payload", async () => {
    window.localStorage.setItem(WEATHER_CACHE_KEY, "{not-json");

    const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem");

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          latitude: 40.71,
          longitude: -74,
          city: "New York",
          region: "NY",
          country_name: "USA",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: 8,
            weather_code: 0,
          },
          current_units: {
            temperature_2m: "°C",
          },
        }),
      } as Response);

    render(<LiveTimeWeather firstName="Nirav" />);

    expect(await screen.findByText("Clear sky")).toBeInTheDocument();
    expect(removeItemSpy).toHaveBeenCalledWith(WEATHER_CACHE_KEY);
  });

  it("clears stale cache entries and refreshes weather", async () => {
    window.localStorage.setItem(
      WEATHER_CACHE_KEY,
      JSON.stringify({
        weather: {
          temperature: 17,
          unit: "°C",
          weatherCode: 1,
          locationLabel: "Old cache",
        },
        fetchedAt: Date.now() - 60 * 60 * 1000 - 5,
      })
    );

    const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem");

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          latitude: 51.5,
          longitude: -0.12,
          city: "London",
          region: "England",
          country_name: "UK",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: 11,
            weather_code: 3,
          },
          current_units: {
            temperature_2m: "°C",
          },
        }),
      } as Response);

    render(<LiveTimeWeather firstName="Nirav" />);

    expect(await screen.findByText("Overcast")).toBeInTheDocument();
    expect(removeItemSpy).toHaveBeenCalledWith(WEATHER_CACHE_KEY);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("clears cache when stored weather shape is invalid", async () => {
    window.localStorage.setItem(
      WEATHER_CACHE_KEY,
      JSON.stringify({
        weather: {
          temperature: "warm",
          unit: "°C",
          weatherCode: 2,
          locationLabel: "Invalid",
        },
        fetchedAt: Date.now(),
      })
    );

    const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem");

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          latitude: 35.68,
          longitude: 139.69,
          city: "Tokyo",
          region: "Tokyo",
          country_name: "Japan",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: 24,
            weather_code: 61,
          },
          current_units: {
            temperature_2m: "°C",
          },
        }),
      } as Response);

    render(<LiveTimeWeather firstName="Nirav" />);

    expect(await screen.findByText("Rain")).toBeInTheDocument();
    expect(removeItemSpy).toHaveBeenCalledWith(WEATHER_CACHE_KEY);
  });

  it("shows a weather error when location lookup fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);

    render(<LiveTimeWeather firstName="Nirav" />);

    expect(await screen.findByText("Could not resolve location.")).toBeInTheDocument();
  });

  it("shows a weather error when location coordinates are incomplete", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        latitude: null,
        longitude: "nope",
      }),
    } as Response);

    render(<LiveTimeWeather firstName="Nirav" />);

    expect(await screen.findByText("Location lookup was incomplete.")).toBeInTheDocument();
  });

  it("shows a weather error when forecast payload is incomplete", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          latitude: 18.52,
          longitude: 73.85,
          city: "Pune",
          region: "Maharashtra",
          country_name: "India",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: 19.8,
          },
          current_units: {
            temperature_2m: "°C",
          },
        }),
      } as Response);

    render(<LiveTimeWeather firstName="Nirav" />);

    expect(await screen.findByText("Weather data was incomplete.")).toBeInTheDocument();
  });
});
