"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import "leaflet/dist/leaflet.css";
import { arrowsAlong, type buildCommuteMap } from "@/lib/commute-map";
import { Button } from "@/components/ui/button";

type MapData = ReturnType<typeof buildCommuteMap>;

type Phase = "there" | "between" | "home";

const PHASES: { id: Phase; label: string }[] = [
  { id: "there", label: "Getting there" },
  { id: "between", label: "Between stops" },
  { id: "home", label: "Getting home" },
];

const arrow = (position: [number, number], bearing: number, L: typeof import("leaflet")) =>
  L.marker(position, {
    interactive: false,
    keyboard: false,
    icon: L.divIcon({
      className: "",
      html: `<svg width="20" height="20" viewBox="0 0 20 20" style="transform:rotate(${bearing}deg)"><polygon points="10,1 18,18 10,13 2,18" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`,
      iconSize: [20, 20],
    }),
  });

const text = (value: string) =>
  Object.assign(document.createElement("div"), { textContent: value });

export function CommuteMap({ data, hasKey }: { data: MapData; hasKey: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const dark = useTheme().resolvedTheme === "dark";
  const [phase, setPhase] = useState<Phase>("there");
  const active = phase === "between" && !data.between ? "there" : phase;

  useEffect(() => {
    if (!hasKey || !container.current) return;
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !container.current) return;
      map = L.map(container.current, { attributionControl: false });
      L.tileLayer(`/api/map-tiles/{z}/{x}/{y}${dark ? "?style=night" : ""}`, {
        maxZoom: 22,
      }).addTo(map);

      const pin = (className: string, html: string, position: [number, number], color?: string) =>
        L.marker(position, {
          icon: L.divIcon({
            className: "",
            html: `<div class="${className}" style="${color ? `background:${color}` : ""}">${html}</div>`,
            iconSize: [26, 26],
          }),
        }).addTo(map!);

      const points: [number, number][] = [];
      for (const marker of data.markers) {
        pin(
          "flex size-[26px] items-center justify-center rounded-full border-2 border-white bg-neutral-900 text-xs font-semibold text-white shadow",
          String(marker.number),
          marker.position
        ).bindPopup(text(`${marker.title} · ${marker.time}`));
        points.push(marker.position);
      }
      for (const car of data.cars) {
        car.lines.forEach((line, index) => {
          const trip = car.trips[index];
          if ((trip === "back" ? "home" : "there") !== active) return;
          L.polyline(line, {
            color: car.color,
            weight: 5,
            dashArray: car.dashed ? "8 8" : undefined,
          })
            .bindTooltip(
              text(`${car.driver}'s car: ${trip === "back" ? "Getting home" : "Getting there"}`),
              { sticky: true }
            )
            .addTo(map!);
          if (!car.dashed) {
            for (const { position, bearing } of arrowsAlong(line)) {
              arrow(position, bearing, L).addTo(map!);
            }
          }
          points.push(...line);
        });
        for (const home of car.homes) {
          pin(
            "flex size-[22px] items-center justify-center rounded-md border-2 border-white text-xs text-white shadow",
            "⌂",
            home.position,
            car.color
          ).bindTooltip(text(home.name), { permanent: true, direction: "bottom" });
          points.push(home.position);
        }
      }
      if (active === "between" && data.between) {
        const { legs, dashed, guide } = data.between;
        const lines = dashed
          ? [{ path: guide, label: "Between stops" }]
          : legs.map((leg) => ({
              path: leg.path,
              label: `Stop ${leg.from} to stop ${leg.to}: ${leg.minutes} min`,
            }));
        for (const { path, label } of lines) {
          L.polyline(path, { color: "#111", weight: 5, dashArray: dashed ? "8 8" : undefined })
            .bindTooltip(text(label), { sticky: true })
            .addTo(map);
          if (!dashed) {
            for (const { position, bearing } of arrowsAlong(path)) {
              arrow(position, bearing, L).addTo(map);
            }
          }
          points.push(...path);
        }
      }
      if (points.length > 0) map.fitBounds(points, { padding: [24, 24] });
      else map.setView([43.65, -79.38], 10);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [data, hasKey, dark, active]);

  if (!hasKey) {
    return <p className="text-muted-foreground text-sm">The map isn&apos;t set up yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Map phase" className="flex flex-wrap gap-2">
        {PHASES.filter(({ id }) => id !== "between" || data.between).map(({ id, label }) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={active === id ? "default" : "outline"}
            aria-pressed={active === id}
            onClick={() => setPhase(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div
        ref={container}
        className="relative z-0 h-72 w-full overflow-hidden rounded-2xl sm:h-96"
        role="group"
        aria-label="Map of the hangout's stops and carpool routes. The itinerary lists the same stops."
      />
      <p className="text-muted-foreground text-xs">© TomTom</p>
      {data.cars.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {data.cars.map((car) => (
            <li key={car.id} className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-0 w-6 border-t-4"
                style={{ borderColor: car.color, borderTopStyle: car.dashed ? "dashed" : "solid" }}
              />
              {car.driver}&apos;s car
            </li>
          ))}
        </ul>
      ) : null}
      {data.cars.some((car) => !car.dashed && car.lines.length > 0) ||
      (data.between && !data.between.dashed) ? (
        <p className="text-muted-foreground text-xs">Arrows show the direction of travel.</p>
      ) : null}
      {active === "between" && data.between && !data.between.dashed ? (
        <ul className="text-sm">
          {data.between.legs.map((leg) => (
            <li key={leg.from}>
              Stop {leg.from} to stop {leg.to}: {leg.minutes} min
            </li>
          ))}
        </ul>
      ) : null}
      {data.cars.some((car) => car.needsStart) ? (
        <p className="text-muted-foreground text-sm">
          Needs a start address:{" "}
          {data.cars
            .filter((car) => car.needsStart)
            .map((car) => `${car.driver}'s car`)
            .join(", ")}
        </p>
      ) : null}
      {data.notOnMap.length > 0 ? (
        <p className="text-muted-foreground text-sm">Not on map: {data.notOnMap.join(", ")}</p>
      ) : null}
    </div>
  );
}
