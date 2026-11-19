import { afterEach, describe, expect, it, vi } from "vitest";
import { currentTabTitle, setTabTitle, subscribeTabTitle } from "@/lib/tab-title";

afterEach(() => {
  setTabTitle("pomodoro", null);
  setTabTitle("countdown", null);
});

describe("tab title store", () => {
  it("lets a running pomodoro win over a countdown", () => {
    setTabTitle("countdown", "2h 05m · Dinner");
    expect(currentTabTitle()).toBe("2h 05m · Dinner");
    setTabTitle("pomodoro", "24:10 · Focus");
    expect(currentTabTitle()).toBe("24:10 · Focus");
    setTabTitle("pomodoro", null);
    expect(currentTabTitle()).toBe("2h 05m · Dinner");
  });

  it("notifies subscribers only on a real change and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTabTitle(listener);
    setTabTitle("countdown", "A");
    setTabTitle("countdown", "A");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setTabTitle("countdown", "B");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
