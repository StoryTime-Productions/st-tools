import { SCENE_CONDITIONS, type SceneCondition } from "@/lib/weather-codes";
import { parseClockText } from "./time-of-day";

export type PreviewOverride = { condition?: SceneCondition; minutes?: number };

/**
 * `?weather=rain&time=16:45` pins the scene for design review. Ignored in production builds,
 * and anything that is not a known condition or a valid HH:MM is dropped.
 */
export function parsePreviewOverride(
  search: string,
  isProduction: boolean
): PreviewOverride | null {
  if (isProduction) return null;
  const params = new URLSearchParams(search);
  const weather = params.get("weather");
  const condition = SCENE_CONDITIONS.find((c) => c === weather);
  const minutes = parseClockText(params.get("time"));
  if (!condition && minutes === null) return null;
  return {
    ...(condition ? { condition } : {}),
    ...(minutes !== null ? { minutes } : {}),
  };
}
