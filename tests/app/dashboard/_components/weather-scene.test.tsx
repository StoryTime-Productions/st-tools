import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { WeatherScene } from "@/app/dashboard/_components/weather-scene";
import {
  FRAME_INTERVAL_MS,
  LOOP_FRAMES,
  STILL_FRAME,
  TEXT_MARGIN_PX,
  DEFAULT_MARGINS,
} from "@/lib/psx-weather/config";

type FakeScene = {
  setFrame: ReturnType<typeof vi.fn>;
  setTime: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};
type Opts = Record<string, unknown>;

const created = vi.hoisted(() => ({ scenes: [] as unknown[], opts: [] as unknown[], fail: false }));

vi.mock("@/lib/psx-weather/scene", () => ({
  createPsxScene: vi.fn((_canvas: HTMLCanvasElement, opts: Opts) => {
    if (created.fail) throw new Error("WebGL is not available");
    const scene = { setFrame: vi.fn(), setTime: vi.fn(), dispose: vi.fn() };
    created.scenes.push(scene);
    created.opts.push(opts);
    return scene;
  }),
}));

const scenes = () => created.scenes as FakeScene[];
const opts = () => created.opts as Opts[];

let resizeCallback:
  | ((entries: Array<{ contentRect: { width: number; height: number } }>) => void)
  | null = null;
let intersectCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;

async function flush() {
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function mountScene(props: Partial<React.ComponentProps<typeof WeatherScene>> = {}) {
  return render(
    <WeatherScene
      condition="rain"
      baseMinutes={585}
      baseAt={Date.now()}
      sunrise={390}
      sunset={1005}
      {...props}
    />
  );
}

function stubMatchMedia(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: reduce, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  created.scenes.length = 0;
  created.opts.length = 0;
  created.fail = false;
  resizeCallback = null;
  intersectCallback = null;
  stubMatchMedia(false);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: typeof resizeCallback) {
        resizeCallback = cb;
      }
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: typeof intersectCallback) {
        intersectCallback = cb;
      }
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(document, "fonts", { configurable: true, value: undefined });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

describe("WeatherScene", () => {
  it("draws a decorative canvas behind the text", async () => {
    const { container } = mountScene();
    await flush();
    const host = container.querySelector('[aria-hidden="true"]');
    expect(host).not.toBeNull();
    expect(host).toHaveClass("pointer-events-none", "absolute", "inset-0");
    expect(host?.querySelector("canvas")).not.toBeNull();
    expect(host?.getAttribute("data-scene-size")).toBe("wide");
  });

  it("creates the scene with the weather, the location clock and the sun times", async () => {
    mountScene({ condition: "snow", baseMinutes: 600, sunrise: 400, sunset: 1000 });
    await flush();
    expect(scenes()).toHaveLength(1);
    expect(opts()[0]).toMatchObject({
      condition: "snow",
      layout: expect.objectContaining({ size: "wide", pixelHeight: 90, pixelWidth: 245 }),
      minutes: 600,
      sunrise: 400,
      sunset: 1000,
    });
    expect(scenes()[0].setFrame).toHaveBeenCalledWith(0);
  });

  it("advances at 7.5 fps and wraps at the end of the loop", async () => {
    mountScene();
    await flush();
    const scene = scenes()[0];
    advance(FRAME_INTERVAL_MS + 1);
    expect(scene.setFrame).toHaveBeenLastCalledWith(1);
    advance(FRAME_INTERVAL_MS * (LOOP_FRAMES - 1));
    expect(scene.setFrame).toHaveBeenLastCalledWith(0);
  });

  it("stops drawing while the tab is hidden and resumes after", async () => {
    mountScene();
    await flush();
    const scene = scenes()[0];
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    scene.setFrame.mockClear();
    advance(FRAME_INTERVAL_MS * 5);
    expect(scene.setFrame).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    advance(FRAME_INTERVAL_MS + 1);
    expect(scene.setFrame).toHaveBeenCalledTimes(1);
  });

  it("stops drawing while the card is off screen", async () => {
    mountScene();
    await flush();
    const scene = scenes()[0];
    act(() => intersectCallback?.([{ isIntersecting: false }]));
    scene.setFrame.mockClear();
    advance(FRAME_INTERVAL_MS * 5);
    expect(scene.setFrame).not.toHaveBeenCalled();
    act(() => intersectCallback?.([{ isIntersecting: true }]));
    advance(FRAME_INTERVAL_MS + 1);
    expect(scene.setFrame).toHaveBeenCalledTimes(1);
  });

  it("draws one still frame for visitors who prefer reduced motion", async () => {
    stubMatchMedia(true);
    mountScene();
    await flush();
    const scene = scenes()[0];
    expect(scene.setFrame).toHaveBeenCalledTimes(1);
    expect(scene.setFrame).toHaveBeenCalledWith(STILL_FRAME);
    advance(FRAME_INTERVAL_MS * 10);
    expect(scene.setFrame).toHaveBeenCalledTimes(1);
  });

  it("redraws the still frame when the clock moves under reduced motion", async () => {
    stubMatchMedia(true);
    mountScene();
    await flush();
    const scene = scenes()[0];
    advance(60_000);
    expect(scene.setTime).toHaveBeenCalled();
    expect(scene.setFrame).toHaveBeenLastCalledWith(STILL_FRAME);
  });

  it("moves the clock about once a minute without rebuilding the scene", async () => {
    mountScene({ baseMinutes: 585, baseAt: Date.now() });
    await flush();
    const scene = scenes()[0];
    advance(60_000);
    const [minutes] = scene.setTime.mock.calls[scene.setTime.mock.calls.length - 1];
    expect(minutes).toBeCloseTo(586, 0);
    expect(scenes()).toHaveLength(1);
  });

  it("holds a pinned clock still (preview override)", async () => {
    mountScene({ baseMinutes: 1005, baseAt: 0, fixedClock: true });
    await flush();
    const scene = scenes()[0];
    expect(opts()[0].minutes).toBe(1005);
    scene.setTime.mockClear();
    advance(5 * 60_000);
    expect(scene.setTime).not.toHaveBeenCalled();
  });

  it("frames the scene from the card's own size, not the viewport's", async () => {
    const { container } = mountScene();
    await flush();
    const first = scenes()[0];
    const host = container.querySelector("[data-scene-size]") as HTMLElement;
    expect(host.getAttribute("data-scene-size")).toBe("wide");

    // a phone-width card: scene moves to the corner, framebuffer matches the card's shape
    act(() => resizeCallback?.([{ contentRect: { width: 358, height: 188 } }]));
    advance(200);
    await flush();
    expect(first.dispose).toHaveBeenCalled();
    expect(opts()[1]).toMatchObject({
      layout: expect.objectContaining({ size: "narrow", pixelWidth: 171, pixelHeight: 90 }),
    });
    expect(host.getAttribute("data-scene-size")).toBe("narrow");
    expect(host.style.maskImage || host.style.getPropertyValue("-webkit-mask-image")).toBeTruthy();

    act(() => resizeCallback?.([{ contentRect: { width: 328, height: 188 } }]));
    advance(200);
    await flush();
    expect(opts()[2]).toMatchObject({ layout: expect.objectContaining({ size: "compact" }) });
    expect(host.getAttribute("data-scene-size")).toBe("compact");
  });

  it("waits for a resize to settle before rebuilding, and ignores sizes that change nothing", async () => {
    mountScene();
    await flush();
    act(() => resizeCallback?.([{ contentRect: { width: 358, height: 188 } }]));
    act(() => resizeCallback?.([{ contentRect: { width: 340, height: 188 } }]));
    act(() => resizeCallback?.([{ contentRect: { width: 352, height: 188 } }]));
    advance(100);
    await flush();
    expect(scenes()).toHaveLength(1); // still settling
    advance(100);
    await flush();
    expect(scenes()).toHaveLength(2); // one rebuild for the whole drag

    act(() => resizeCallback?.([{ contentRect: { width: 352, height: 188 } }]));
    advance(200);
    await flush();
    expect(scenes()).toHaveLength(2); // same framing: nothing to rebuild

    act(() => resizeCallback?.([{ contentRect: { width: 0, height: 0 } }]));
    advance(200);
    await flush();
    expect(scenes()).toHaveLength(2); // a hidden card is ignored
  });

  it("rebuilds when the weather condition changes and releases the old scene", async () => {
    const { rerender } = mountScene({ condition: "rain" });
    await flush();
    const first = scenes()[0];
    rerender(<WeatherScene condition="clear" baseMinutes={585} baseAt={Date.now()} />);
    await flush();
    expect(first.dispose).toHaveBeenCalled();
    expect(opts()[1]).toMatchObject({ condition: "clear" });
  });

  it("disappears quietly when WebGL is unavailable", async () => {
    created.fail = true;
    const { container } = mountScene();
    await flush();
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("disappears when the GPU context is lost", async () => {
    const { container } = mountScene();
    await flush();
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    const event = new Event("webglcontextlost", { cancelable: true });
    act(() => {
      fireEvent(canvas, event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("never builds the scene if it unmounts before three.js has loaded", async () => {
    const { unmount } = mountScene();
    unmount();
    await flush();
    expect(scenes()).toHaveLength(0);
  });

  it("releases the scene and stops drawing on unmount", async () => {
    const { unmount } = mountScene();
    await flush();
    const scene = scenes()[0];
    unmount();
    expect(scene.dispose).toHaveBeenCalled();
    scene.setFrame.mockClear();
    advance(FRAME_INTERVAL_MS * 5);
    expect(scene.setFrame).not.toHaveBeenCalled();
  });

  it("still works in browsers without ResizeObserver, IntersectionObserver or matchMedia", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.stubGlobal("matchMedia", undefined);
    mountScene();
    await flush();
    expect(scenes()).toHaveLength(1);
    advance(FRAME_INTERVAL_MS + 1);
    expect(scenes()[0].setFrame).toHaveBeenLastCalledWith(1);
  });

  describe("text extent", () => {
    function mockTextRights(rights: Record<string, number>) {
      vi.spyOn(document, "createRange").mockImplementation(() => {
        let line = "";
        return {
          selectNodeContents: (node: Element) => {
            line = node.getAttribute("data-line") ?? "";
          },
          getBoundingClientRect: () => ({ right: rights[line] ?? 0 }),
        } as unknown as Range;
      });
    }
    const textTree = (textKey?: string) => (
      <div>
        <WeatherScene condition="rain" baseMinutes={585} baseAt={Date.now()} textKey={textKey} />
        <h2 data-line="heading">Welcome back</h2>
        <p data-line="date">date</p>
        <p data-line="weather">weather</p>
      </div>
    );
    function mountWithText(textKey?: string) {
      return render(textTree(textKey));
    }
    function stubHostRect(container: HTMLElement, width: number, height: number) {
      const host = container.querySelector("[data-scene-size]") as HTMLElement;
      vi.spyOn(host, "getBoundingClientRect").mockReturnValue({
        width,
        height,
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
    }
    const lastLayout = () =>
      opts()[opts().length - 1].layout as { size: string; textFraction: number };

    it("moves to the corner as soon as ANY line reaches most of the card, not only the heading", async () => {
      // heading alone would give (290 + 8) / 440 = 0.68 (wide); the weather line gives 0.89
      mockTextRights({ heading: 290, date: 250, weather: 360 });
      mountWithText();
      await flush();
      act(() => resizeCallback?.([{ contentRect: { width: 440, height: 188 } }]));
      advance(200);
      await flush();
      expect(lastLayout().size).toBe("narrow");
    });

    it("keeps the wide layout when every line stays left of the scene", async () => {
      mockTextRights({ heading: 290, date: 250, weather: 300 });
      mountWithText();
      await flush();
      act(() => resizeCallback?.([{ contentRect: { width: 600, height: 220 } }]));
      advance(200);
      await flush();
      expect(lastLayout().size).toBe("wide");
      expect(lastLayout().textFraction).toBeCloseTo((300 + TEXT_MARGIN_PX) / 600);
    });

    it("moves to the corner when a long city name stretches the weather line", async () => {
      mockTextRights({ heading: 360, date: 330, weather: 480 });
      mountWithText();
      await flush();
      act(() => resizeCallback?.([{ contentRect: { width: 600, height: 220 } }]));
      advance(200);
      await flush();
      // (480 + 32) / 600 = 0.85: the line reaches most of the card, so the scene yields to the corner
      expect(lastLayout().size).toBe("narrow");
      expect(lastLayout().textFraction).toBeCloseTo((480 + DEFAULT_MARGINS.corner) / 600);
    });

    it("falls back to the default text extent when the lines cannot be measured", async () => {
      vi.spyOn(document, "createRange").mockImplementation(() => {
        throw new Error("no ranges here");
      });
      mountWithText();
      await flush();
      act(() => resizeCallback?.([{ contentRect: { width: 600, height: 220 } }]));
      advance(200);
      await flush();
      expect(scenes()).toHaveLength(1); // same framing as the default: nothing to rebuild
    });

    it("measures again when the text changes but the card keeps its size", async () => {
      const rights = { heading: 290, date: 250, weather: 300 };
      mockTextRights(rights);
      const { container, rerender } = mountWithText("loading");
      await flush();
      stubHostRect(container, 600, 220);
      // the status line has not changed yet and the card has not resized: nothing triggers a measure
      expect(scenes()).toHaveLength(1);
      // a longer city arrives; the card keeps its size, so only the new key can trigger a measure
      rights.weather = 480;
      rerender(textTree("loaded"));
      await flush();
      expect(lastLayout().size).toBe("narrow");
    });

    it("measures again once web fonts have loaded", async () => {
      const rights = { heading: 290, date: 250, weather: 300 };
      mockTextRights(rights);
      let fontsLoaded = () => {};
      Object.defineProperty(document, "fonts", {
        configurable: true,
        value: { ready: new Promise<void>((resolve) => (fontsLoaded = resolve)) },
      });
      const { container } = mountWithText();
      await flush();
      stubHostRect(container, 600, 220);
      expect(scenes()).toHaveLength(1);
      rights.weather = 480; // the real font is wider than the fallback
      await act(async () => {
        fontsLoaded();
        await Promise.resolve();
      });
      await flush();
      expect(lastLayout().size).toBe("narrow");
    });

    it("ignores fonts that finish loading after the card has gone", async () => {
      mockTextRights({ heading: 290, date: 250, weather: 480 });
      let fontsLoaded = () => {};
      Object.defineProperty(document, "fonts", {
        configurable: true,
        value: { ready: new Promise<void>((resolve) => (fontsLoaded = resolve)) },
      });
      const { container, unmount } = mountWithText();
      await flush();
      stubHostRect(container, 600, 220);
      const before = scenes().length;
      unmount();
      await act(async () => {
        fontsLoaded();
        await Promise.resolve();
      });
      await flush();
      expect(scenes()).toHaveLength(before);
    });

    it("falls back to the default text extent when there is no text or no width on the lines", async () => {
      mockTextRights({});
      mountWithText();
      await flush();
      act(() => resizeCallback?.([{ contentRect: { width: 600, height: 220 } }]));
      advance(200);
      await flush();
      expect(scenes()).toHaveLength(1);
    });
  });
});
