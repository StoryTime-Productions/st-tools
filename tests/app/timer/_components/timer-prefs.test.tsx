import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import {
  DEFAULT_TIMER_PREFS,
  useTimerPrefs,
  writeTimerPrefs,
} from "@/app/timer/_components/timer-prefs";

function Probe() {
  const prefs = useTimerPrefs();
  return <span data-testid="prefs">{JSON.stringify(prefs)}</span>;
}

describe("useTimerPrefs", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the defaults on the server even when prefs are stored", () => {
    window.localStorage.setItem(
      "timer-color-preferences-v1",
      JSON.stringify({ ...DEFAULT_TIMER_PREFS, focusColor: "#1968e6" })
    );

    expect(renderToString(<Probe />)).toContain(DEFAULT_TIMER_PREFS.focusColor);
    expect(renderToString(<Probe />)).not.toContain("#1968e6");
  });

  it("reads stored prefs on the client and normalizes bad values", () => {
    window.localStorage.setItem(
      "timer-color-preferences-v1",
      JSON.stringify({ focusColor: "#1968E6", breakColor: "nope", autoStartFocus: true })
    );

    render(<Probe />);
    const prefs = JSON.parse(screen.getByTestId("prefs").textContent ?? "{}");

    expect(prefs).toEqual({
      ...DEFAULT_TIMER_PREFS,
      focusColor: "#1968e6",
      autoStartFocus: true,
    });
  });

  it("falls back to defaults for corrupt storage", () => {
    window.localStorage.setItem("timer-color-preferences-v1", "{not json");

    render(<Probe />);

    expect(JSON.parse(screen.getByTestId("prefs").textContent ?? "{}")).toEqual(
      DEFAULT_TIMER_PREFS
    );
  });

  it("persists writes and re-renders subscribers", () => {
    render(<Probe />);

    act(() => writeTimerPrefs({ ...DEFAULT_TIMER_PREFS, autoStartBreaks: true }));

    expect(JSON.parse(screen.getByTestId("prefs").textContent ?? "{}").autoStartBreaks).toBe(true);
    expect(
      JSON.parse(window.localStorage.getItem("timer-color-preferences-v1") ?? "{}").autoStartBreaks
    ).toBe(true);
  });

  it("defaults sound cues on and honours a stored off", () => {
    render(<Probe />);
    expect(JSON.parse(screen.getByTestId("prefs").textContent ?? "{}").soundEnabled).toBe(true);

    act(() => writeTimerPrefs({ ...DEFAULT_TIMER_PREFS, soundEnabled: false }));

    expect(JSON.parse(screen.getByTestId("prefs").textContent ?? "{}").soundEnabled).toBe(false);
  });
});
