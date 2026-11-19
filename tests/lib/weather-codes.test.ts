import { describe, expect, it } from "vitest";
import { SCENE_CONDITIONS, describeWeather, sceneConditionFor } from "@/lib/weather-codes";

describe("sceneConditionFor", () => {
  it.each([
    [0, "clear"],
    [1, "partly"],
    [2, "partly"],
    [3, "overcast"],
    [45, "fog"],
    [48, "fog"],
    [51, "drizzle"],
    [57, "drizzle"],
    [61, "rain"],
    [82, "rain"],
    [71, "snow"],
    [86, "snow"],
    [95, "storm"],
    [99, "storm"],
    [999, "overcast"],
  ])("maps WMO code %i to %s", (code, scene) => {
    expect(sceneConditionFor(code)).toBe(scene);
  });

  it("only ever returns a known scene", () => {
    for (let code = 0; code < 100; code += 1) {
      expect(SCENE_CONDITIONS).toContain(sceneConditionFor(code));
    }
  });
});

describe("describeWeather", () => {
  it("keeps the text labels the card already shows", () => {
    expect(describeWeather(0).label).toBe("Clear sky");
    expect(describeWeather(95).label).toBe("Thunderstorm");
    expect(describeWeather(999).label).toBe("Weather available");
  });
});
