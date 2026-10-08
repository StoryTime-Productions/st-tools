"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import "leaflet/dist/leaflet.css";
import { arrowsAlong, type buildCommuteMap } from "@/lib/commute-map";

type MapData = ReturnType<typeof buildCommuteMap>;

const text = (value: string) =>
  Object.assign(document.createElement("div"), { textContent: value });

export function CommuteMap({ data, hasKey }: { data: MapData; hasKey: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const dark = useTheme().resolvedTheme === "dark";

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
          const label = trip === "back" ? "Way back" : "Way there";
          L.polyline(line, {
            color: car.color,
            weight: trip === "back" ? 3 : 5,
            opacity: trip === "back" ? 0.6 : 1,
            dashArray: car.dashed ? "8 8" : undefined,
          })
            .bindTooltip(text(trip ? `${car.driver}'s car: ${label}` : `${car.driver}'s car`), {
              sticky: true,
            })
            .addTo(map!);
          if (trip) {
            for (const { position, bearing } of arrowsAlong(line)) {
              L.marker(position, {
                interactive: false,
                icon: L.divIcon({
                  className: "",
                  html: `<svg width="20" height="20" viewBox="0 0 20 20" style="transform:rotate(${bearing}deg)"><polygon points="10,1 18,18 10,13 2,18" fill="${trip === "back" ? "#fff" : "#111"}" stroke="${trip === "back" ? "#111" : "#fff"}" stroke-width="2" stroke-linejoin="round"/></svg>`,
                  iconSize: [20, 20],
                }),
              }).addTo(map!);
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
      if (points.length > 0) map.fitBounds(points, { padding: [24, 24] });
      else map.setView([43.65, -79.38], 10);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [data, hasKey, dark]);

  if (!hasKey) {
    return <p className="text-muted-foreground text-sm">The map isn&apos;t set up yet.</p>;
  }

  return (
    <div className="space-y-3">
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
              {car.trips.length > 0 ? (
                <span className="text-muted-foreground text-xs">
                  Arrows show the direction: black = way there, white = way back
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {data.notOnMap.length > 0 ? (
        <p className="text-muted-foreground text-sm">Not on map: {data.notOnMap.join(", ")}</p>
      ) : null}
    </div>
  );
}
