import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { LiveTimeWeather } from "@/app/dashboard/_components/live-time-weather";

vi.mock("@/lib/psx-weather/scene", () => ({
  createPsxScene: vi.fn(() => ({ setFrame: vi.fn(), setTime: vi.fn(), dispose: vi.fn() })),
}));

describe("LiveTimeWeather hydration", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("hydrates without a mismatch when the browser clock is seconds ahead of the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T20:00:01"));
    const html = renderToString(<LiveTimeWeather firstName="Nirav" />);

    vi.setSystemTime(new Date("2026-11-04T20:00:04"));
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable: unknown[] = [];

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <LiveTimeWeather firstName="Nirav" />, {
        onRecoverableError: (error) => recoverable.push(error),
      });
    });

    expect(recoverable).toEqual([]);
    act(() => root?.unmount());
    container.remove();
  });
});
