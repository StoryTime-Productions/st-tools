/* Shared by the scene and the card. Must not import three.js: the card loads the scene lazily. */

export const LOOP_FRAMES = 120; // 16 s at 7.5 fps
export const FPS = 7.5;
export const FRAME_INTERVAL_MS = 1000 / FPS;
/** the frame drawn when the visitor prefers reduced motion */
export const STILL_FRAME = 30;

/** the framebuffer is always this tall, so pixels stay square whatever the card's shape */
export const SCENE_PIXEL_HEIGHT = 90;
const MIN_PIXEL_WIDTH = 100;
const MAX_PIXEL_WIDTH = 640;
/** where the wide scene starts relative to the end of the longest text line (negative = tucked under its tail, chosen by Nirav) */
export const TEXT_MARGIN_PX = -60;
/** breathing room used only to decide when the text is too wide for the wide layout */
const CORNER_MARGIN_PX = 32;

export type SceneSize = "wide" | "narrow" | "compact";

export type SceneLayout = {
  size: SceneSize;
  /** framebuffer size */
  pixelWidth: number;
  pixelHeight: number;
  /** share of the card's width (0..1) the scene leaves free for the text */
  textFraction: number;
};

/**
 * What the scene needs to know about its card. `textEnd` is where the longest text line (heading, date or
 * weather) ends, in CSS px from the card's left edge; everything animated is kept to the right of it. On a phone-width card (a text line
 * reaches past ~78% of the width) the scene shrinks to the top-right corner and is masked there.
 */
export type EdgeMargins = { wide: number; corner: number };
/** phone-width cards tuck the scene further under the text (chosen by Nirav) */
export const DEFAULT_MARGINS: EdgeMargins = { wide: TEXT_MARGIN_PX, corner: -120 };

export function sceneLayout(
  width: number,
  height: number,
  textEnd: number,
  margins: EdgeMargins = DEFAULT_MARGINS
): SceneLayout {
  const pixelHeight = SCENE_PIXEL_HEIGHT;
  const scale = height / pixelHeight;
  const pixelWidth = Math.min(
    MAX_PIXEL_WIDTH,
    Math.max(MIN_PIXEL_WIDTH, Math.round(width / scale))
  );
  const fraction = (margin: number) => Math.min(0.93, Math.max(0.3, (textEnd + margin) / width));
  const cornerFraction = (textEnd + CORNER_MARGIN_PX) / width;
  if (width <= 340)
    return { size: "compact", pixelWidth, pixelHeight, textFraction: fraction(margins.corner) };
  if (cornerFraction >= 0.78)
    return { size: "narrow", pixelWidth, pixelHeight, textFraction: fraction(margins.corner) };
  return { size: "wide", pixelWidth, pixelHeight, textFraction: fraction(margins.wide) };
}

/**
 * In the corner layouts the scene is masked to the right of where it starts: transparent up to the
 * start, opaque a short way in, and full height (no bottom fade). The wide layout needs no mask.
 */
export function sceneMaskStyle(layout: SceneLayout): Record<string, string> {
  if (layout.size === "wide") return {};
  const start = Math.round(layout.textFraction * 100);
  const end = start + (layout.size === "compact" ? 8 : 12);
  const image = `linear-gradient(to right, transparent 0 ${start}%, #000 ${end}%)`;
  return { WebkitMaskImage: image, maskImage: image };
}
