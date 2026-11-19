import { describe, expect, it } from "vitest";
import {
  FPS,
  FRAME_INTERVAL_MS,
  TEXT_MARGIN_PX,
  sceneLayout,
  sceneMaskStyle,
  DEFAULT_MARGINS,
} from "@/lib/psx-weather/config";
import { parsePreviewOverride } from "@/lib/psx-weather/preview";

describe("sceneLayout", () => {
  it("keeps square pixels: always 90px tall, as wide as the card's shape needs", () => {
    const desktop = sceneLayout(600, 220, 360);
    expect(desktop.pixelHeight).toBe(90);
    expect(desktop.pixelWidth).toBe(245);
    expect(sceneLayout(852, 220, 360).pixelWidth).toBe(349);
  });

  it("leaves the measured text width free on a desktop card", () => {
    const desktop = sceneLayout(600, 220, 360);
    expect(desktop.size).toBe("wide");
    expect(desktop.textFraction).toBeCloseTo((360 + TEXT_MARGIN_PX) / 600);
    const roomy = sceneLayout(852, 220, 360);
    expect(roomy.size).toBe("wide");
    expect(roomy.textFraction).toBeLessThan(desktop.textFraction);
  });

  it("moves the scene to the top-right corner when the heading reaches most of the card", () => {
    const phone = sceneLayout(358, 188, 293);
    expect(phone.size).toBe("narrow");
    expect(phone.textFraction).toBeCloseTo((293 + DEFAULT_MARGINS.corner) / 358);
    expect(phone.pixelWidth).toBe(171);
    const small = sceneLayout(328, 188, 293);
    expect(small.size).toBe("compact");
    expect(small.textFraction).toBeCloseTo((293 + DEFAULT_MARGINS.corner) / 328);
    expect(sceneLayout(500, 188, 360).size).toBe("narrow");
  });

  it("clamps the framebuffer width and the text fraction", () => {
    expect(sceneLayout(3000, 100, 360).pixelWidth).toBe(640);
    expect(sceneLayout(400, 600, 360).pixelWidth).toBe(100);
    expect(sceneLayout(600, 220, 0).textFraction).toBeCloseTo(0.3);
    expect(sceneLayout(600, 220, 5000).size).toBe("narrow");
  });
});

describe("sceneMaskStyle", () => {
  it("leaves the wide card unmasked", () => {
    expect(sceneMaskStyle(sceneLayout(600, 220, 360))).toEqual({});
  });

  it("starts the corner mask where the scene starts, with no bottom fade", () => {
    const layout = sceneLayout(358, 188, 293);
    const mask = sceneMaskStyle(layout);
    const start = Math.round(layout.textFraction * 100);
    expect(mask.maskImage).toContain(`transparent 0 ${start}%`);
    expect(mask.maskImage).toContain(`#000 ${start + 12}%`);
    expect(mask.maskImage).not.toContain("to bottom");
    expect(mask.WebkitMaskImage).toBe(mask.maskImage);
  });

  it("uses a shorter ramp on very narrow cards", () => {
    const layout = sceneLayout(328, 188, 293);
    const start = Math.round(layout.textFraction * 100);
    expect(sceneMaskStyle(layout).maskImage).toContain(`#000 ${start + 8}%`);
  });
});

describe("frame rate", () => {
  it("runs at the choppy PSX cadence", () => {
    expect(FPS).toBe(7.5);
    expect(FRAME_INTERVAL_MS).toBeCloseTo(133.33, 1);
  });
});

describe("parsePreviewOverride", () => {
  it("is ignored in production builds", () => {
    expect(parsePreviewOverride("?weather=rain&time=16:45", true)).toBeNull();
  });

  it("reads a known weather and a valid time", () => {
    expect(parsePreviewOverride("?weather=rain&time=16:45", false)).toEqual({
      condition: "rain",
      minutes: 1005,
    });
    expect(parsePreviewOverride("?weather=snow", false)).toEqual({ condition: "snow" });
    expect(parsePreviewOverride("?time=07:05", false)).toEqual({ minutes: 425 });
  });

  it("drops unknown weather and invalid times", () => {
    expect(parsePreviewOverride("?weather=hail&time=99:99", false)).toBeNull();
    expect(parsePreviewOverride("", false)).toBeNull();
    expect(parsePreviewOverride("?weather=fog&time=nope", false)).toEqual({ condition: "fog" });
  });
});
