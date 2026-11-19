"use client";

import { useEffect, useRef, useState } from "react";
import {
  FRAME_INTERVAL_MS,
  LOOP_FRAMES,
  STILL_FRAME,
  sceneLayout,
  sceneMaskStyle,
  type SceneLayout,
} from "@/lib/psx-weather/config";
import type { PsxScene } from "@/lib/psx-weather/scene";
import { clockAt } from "@/lib/psx-weather/time-of-day";
import type { SceneCondition } from "@/lib/weather-codes";

type WeatherSceneProps = {
  condition: SceneCondition;
  /** minutes since midnight at the weather location when `baseAt` was taken */
  baseMinutes: number;
  baseAt: number;
  sunrise?: number;
  sunset?: number;
  /** pin the clock at `baseMinutes` (dev preview override) */
  fixedClock?: boolean;
  /**
   * changes whenever the card's text does (city, condition, loading state): the text can get longer
   * without the card changing size, so the framing has to be measured again
   */
  textKey?: string;
};

const CLOCK_TICK_MS = 60_000;
const RESIZE_SETTLE_MS = 150;
// the dashboard's welcome card: 600 px wide, longest line ending at 360 px (used until the real card is measured)
const DEFAULT_LAYOUT = sceneLayout(600, 220, 360);
const DEFAULT_TEXT_END = 360;

/**
 * Where the longest text line (heading, date or weather) ends, in px from the card's left edge; the scene
 * keeps clear of it. The weather line is the widest on narrow cards and grows with a long city name.
 */
function measureTextEnd(host: HTMLElement): number {
  try {
    const lines = host.parentElement?.querySelectorAll("h2, p");
    if (!lines?.length) return DEFAULT_TEXT_END;
    const left = host.getBoundingClientRect().left;
    let end = 0;
    lines.forEach((line) => {
      const range = document.createRange();
      range.selectNodeContents(line);
      end = Math.max(end, range.getBoundingClientRect().right - left);
    });
    return end > 0 ? end : DEFAULT_TEXT_END;
  } catch {
    return DEFAULT_TEXT_END;
  }
}

const sameLayout = (a: SceneLayout, b: SceneLayout) =>
  a.size === b.size &&
  a.pixelWidth === b.pixelWidth &&
  Math.round(a.textFraction * 500) === Math.round(b.textFraction * 500);

/**
 * A decorative 3D PSX sky behind the welcome card text. Three.js is imported only when this mounts,
 * and everything about it is optional: no WebGL, a lost context or any error just removes it and the
 * card stays plain navy. It stops drawing while the tab is hidden or the card is off screen, and draws
 * one still frame for visitors who prefer reduced motion. The framebuffer is derived from the card's
 * real size and the extent of its longest text line, so pixels stay square and nothing animated lands
 * on the text.
 */
export function WeatherScene({
  condition,
  baseMinutes,
  baseAt,
  sunrise,
  sunset,
  fixedClock = false,
  textKey,
}: WeatherSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PsxScene | null>(null);
  const reduceRef = useRef(false);
  const [layout, setLayout] = useState<SceneLayout>(DEFAULT_LAYOUT);
  const [failed, setFailed] = useState(false);
  const [minutes, setMinutes] = useState(() =>
    fixedClock ? baseMinutes : clockAt(baseMinutes, baseAt, Date.now())
  );
  const minutesRef = useRef(minutes);
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // the weather location's clock: re-read about once a minute, never per frame
  useEffect(() => {
    const read = () => (fixedClock ? baseMinutes : clockAt(baseMinutes, baseAt, Date.now()));
    setMinutes(read());
    if (fixedClock) return;
    const timer = setInterval(() => setMinutes(read()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [baseMinutes, baseAt, fixedClock]);

  useEffect(() => {
    minutesRef.current = minutes;
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setTime(minutes);
    if (reduceRef.current) scene.setFrame(STILL_FRAME);
  }, [minutes]);

  // framing from the card's own size (not the viewport's) and where its longest text line ends
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const apply = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      const next = sceneLayout(width, height, measureTextEnd(host));
      setLayout((current) => (sameLayout(current, next) ? current : next));
    };
    const rect = host.getBoundingClientRect();
    apply(rect.width, rect.height);
    // a web font arriving later changes how wide the lines are
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (cancelled) return;
      const now = host.getBoundingClientRect();
      apply(now.width, now.height);
    });
    if (typeof ResizeObserver === "undefined") {
      return () => {
        cancelled = true;
      };
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      clearTimeout(settle);
      settle = setTimeout(
        () => apply(entry.contentRect.width, entry.contentRect.height),
        RESIZE_SETTLE_MS
      );
    });
    observer.observe(host);
    return () => {
      cancelled = true;
      clearTimeout(settle);
      observer.disconnect();
    };
  }, [failed, textKey]);

  const layoutKey = `${layout.size}-${layout.pixelWidth}-${Math.round(layout.textFraction * 500)}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || failed) return;
    let cancelled = false;
    let scene: PsxScene | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let inView = true;
    let frame = 0;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    reduceRef.current = reduce;

    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            const entry = entries[entries.length - 1];
            if (entry) inView = entry.isIntersecting;
          });
    observer?.observe(canvas);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    import("@/lib/psx-weather/scene")
      .then(({ createPsxScene }) => {
        if (cancelled) return;
        scene = createPsxScene(canvas, {
          condition,
          layout: layoutRef.current,
          minutes: minutesRef.current,
          sunrise,
          sunset,
        });
        sceneRef.current = scene;
        frame = reduce ? STILL_FRAME : 0;
        scene.setFrame(frame);
        if (reduce) return;
        timer = setInterval(() => {
          if (document.hidden || !inView) return;
          frame = (frame + 1) % LOOP_FRAMES;
          scene?.setFrame(frame);
        }, FRAME_INTERVAL_MS);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      observer?.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      sceneRef.current = null;
      scene?.dispose();
    };
  }, [condition, layoutKey, sunrise, sunset, failed]);

  if (failed) return null;

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      data-scene-size={layout.size}
      className="pointer-events-none absolute inset-0 z-0"
      style={sceneMaskStyle(layout)}
    >
      <canvas
        key={`${condition}-${layoutKey}`}
        ref={canvasRef}
        className="absolute inset-0 h-full w-full [image-rendering:pixelated]"
      />
    </div>
  );
}
