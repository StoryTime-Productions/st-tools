// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COUNTDOWN_CHANNEL,
  COUNTDOWNS_CHANGED,
  notifyCountdownsChanged,
} from "@/lib/countdown-sync";

afterEach(() => vi.unstubAllGlobals());

describe("notifyCountdownsChanged", () => {
  it("tells this tab through a window event and other tabs through the channel", () => {
    const posted: unknown[] = [];
    const closed = vi.fn();
    class FakeChannel {
      constructor(public name: string) {
        expect(name).toBe(COUNTDOWN_CHANNEL);
      }
      postMessage(message: unknown) {
        posted.push(message);
      }
      close = closed;
    }
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const heard = vi.fn();
    window.addEventListener(COUNTDOWNS_CHANGED, heard);
    notifyCountdownsChanged();
    window.removeEventListener(COUNTDOWNS_CHANGED, heard);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(posted).toEqual([{ type: "changed" }]);
    expect(closed).toHaveBeenCalled();
  });

  it("still tells this tab when BroadcastChannel is missing", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const heard = vi.fn();
    window.addEventListener(COUNTDOWNS_CHANGED, heard);
    notifyCountdownsChanged();
    window.removeEventListener(COUNTDOWNS_CHANGED, heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
