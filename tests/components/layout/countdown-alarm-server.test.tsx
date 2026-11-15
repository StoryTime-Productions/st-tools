import { beforeEach, describe, expect, it, vi } from "vitest";

const getVisibleCountdowns = vi.hoisted(() => vi.fn());
vi.mock("@/lib/countdowns", () => ({ getVisibleCountdowns }));
vi.mock("@/components/layout/countdown-alarm", () => ({ CountdownAlarm: () => null }));

import { CountdownAlarmServer } from "@/components/layout/countdown-alarm-server";

describe("CountdownAlarmServer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the user's countdowns down as plain data", async () => {
    getVisibleCountdowns.mockResolvedValueOnce([
      {
        id: "c1",
        title: "Dinner",
        targetAt: new Date("2026-11-16T13:00:00Z"),
        dismissed: false,
        scope: "GLOBAL",
      },
    ]);
    const element = await CountdownAlarmServer({ userId: "u1" });
    expect(getVisibleCountdowns).toHaveBeenCalledWith("u1", expect.any(Date));
    expect(element.props.initial).toEqual([
      { id: "c1", title: "Dinner", targetAt: "2026-11-16T13:00:00.000Z", dismissed: false },
    ]);
  });

  it("falls back to an empty list when the query fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    getVisibleCountdowns.mockRejectedValueOnce(new Error("db down"));
    const element = await CountdownAlarmServer({ userId: "u1" });
    expect(element.props.initial).toEqual([]);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
