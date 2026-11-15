import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountdownAlarm } from "@/components/layout/countdown-alarm";
import { setTabTitle } from "@/lib/tab-title";

const mocks = vi.hoisted(() => ({
  dismiss: vi.fn<(id: string) => Promise<{ success: true } | { error: string }>>(async () => ({
    success: true,
  })),
  toast: { error: vi.fn() },
  chime: vi.fn(async () => true),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/app/actions/countdowns", () => ({ dismissCountdownAction: mocks.dismiss }));
vi.mock("@/lib/countdown-chime", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/countdown-chime")>()),
  playAlarmChime: mocks.chime,
}));

const NOW = new Date("2026-11-14T12:00:00.000Z");
const HOUR = 3_600_000;

type Row = { id: string; title: string; targetAt: string; dismissed: boolean };
const row = (id: string, ms: number, dismissed = false): Row => ({
  id,
  title: id,
  targetAt: new Date(NOW.getTime() + ms).toISOString(),
  dismissed,
});

const channels: FakeChannel[] = [];
class FakeChannel {
  onmessage: (() => void) | null = null;
  posted: unknown[] = [];
  closed = false;
  constructor(public name: string) {
    channels.push(this);
  }
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  close() {
    this.closed = true;
  }
}

let rows: Row[];
const fetchMock = vi.fn();

async function mount(initial: Row[] = []) {
  const view = render(<CountdownAlarm initial={initial} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  return view;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  window.localStorage.clear();
  document.title = "Dashboard";
  rows = [];
  channels.length = 0;
  vi.clearAllMocks();
  fetchMock.mockImplementation(async () => ({ ok: true, json: async () => rows }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("BroadcastChannel", FakeChannel);
});

afterEach(() => {
  setTabTitle("pomodoro", null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CountdownAlarm", () => {
  it("shows nothing and leaves the title alone when no countdown applies", async () => {
    await mount();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.title).toBe("Dashboard");
  });

  it("puts the soonest countdown in the tab title and restores the page title on unmount", async () => {
    rows = [row("Dinner", 2 * HOUR + 5 * 60_000 + 1000)];
    const view = await mount();
    expect(document.title).toBe("2h 05m · Dinner");
    view.unmount();
    expect(document.title).toBe("Dashboard");
  });

  it("lets a running pomodoro take the title and hands it back", async () => {
    rows = [row("Dinner", 2 * HOUR + 1000)];
    await mount();
    act(() => setTabTitle("pomodoro", "24:10 · Focus"));
    expect(document.title).toBe("24:10 · Focus");
    act(() => setTabTitle("pomodoro", null));
    expect(document.title).toBe("2h 00m · Dinner");
  });

  it("treats a title changed by navigation as the new page title", async () => {
    rows = [row("Dinner", 2 * HOUR + 1000)];
    const view = await mount();
    document.title = "Boards";
    act(() => setTabTitle("pomodoro", "24:10 · Focus"));
    act(() => setTabTitle("pomodoro", null));
    view.unmount();
    expect(document.title).toBe("Boards");
  });

  it("rings once and shows the banner when an alarm arrives while the tab is open", async () => {
    window.localStorage.setItem("st-countdown-sound", "on");
    rows = [row("Dinner", 5_000)];
    await mount();
    expect(screen.queryByRole("alert")).toBeNull();
    await advance(6_000);
    expect(screen.getByRole("alert")).toHaveTextContent("Dinner is now");
    expect(screen.queryByText("Sound is off")).toBeNull();
    expect(document.title).toBe("Now · Dinner");
    await advance(10_000);
    expect(mocks.chime).toHaveBeenCalledTimes(1);
  });

  it("shows an alarm found already fired without ringing it", async () => {
    window.localStorage.setItem("st-countdown-sound", "on");
    rows = [row("Missed", -60_000)];
    await mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Missed is now");
    expect(mocks.chime).not.toHaveBeenCalled();
  });

  it("says the sound is off and lets the person turn it on", async () => {
    rows = [row("Missed", -60_000)];
    await mount();
    expect(screen.getByText("Sound is off")).toBeInTheDocument();
    mocks.chime.mockResolvedValueOnce(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Turn on sound" }));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(window.localStorage.getItem("st-countdown-sound")).toBe("on");
    expect(screen.getByText("Sound is off")).toBeInTheDocument();
    mocks.chime.mockResolvedValueOnce(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Turn on sound" }));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByText("Sound is off")).toBeNull();
  });

  it("reports a refused chime as sound off", async () => {
    window.localStorage.setItem("st-countdown-sound", "on");
    mocks.chime.mockResolvedValueOnce(false);
    rows = [row("Dinner", 2_000)];
    await mount();
    await advance(3_000);
    expect(screen.getByText("Sound is off")).toBeInTheDocument();
  });

  it("merges several alarms into one banner", async () => {
    rows = [row("A", -2 * 60_000), row("B", -60_000)];
    await mount();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("2 countdowns reached: A · B");
  });

  it("dismisses for this user, tells other tabs and hides the banner", async () => {
    rows = [row("A", -2 * 60_000), row("B", -60_000), row("Later", 5 * HOUR)];
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.dismiss.mock.calls.map((call) => call[0])).toEqual(["A", "B"]);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(channels[0].posted).toEqual([{ type: "dismissed", ids: ["A", "B"] }]);
    expect(document.title).toBe("5h 00m · Later");
  });

  it("re-reads when another tab broadcasts, the tab becomes visible, or a minute passes", async () => {
    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rows = [row("New", -1000)];
    await act(async () => {
      channels[0].onmessage?.();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("New is now");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await advance(60_000);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("skips refreshing while the tab is hidden", async () => {
    await mount();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it("keeps what it has when the request fails or is refused", async () => {
    rows = [row("Missed", -60_000)];
    await mount();
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => [] });
    await act(async () => {
      channels[0].onmessage?.();
      await vi.advanceTimersByTimeAsync(1);
    });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      channels[0].onmessage?.();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Missed is now");
  });

  it("works without BroadcastChannel and closes its channel on unmount", async () => {
    const view = await mount();
    view.unmount();
    expect(channels[0].closed).toBe(true);
    vi.stubGlobal("BroadcastChannel", undefined);
    rows = [row("Missed", -60_000)];
    const second = await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    second.unmount();
  });

  it("shows seeded alarms in the very first render, before any request", () => {
    render(<CountdownAlarm initial={[row("Seeded", -60_000)]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Seeded is now");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("brings the banner back and says so when a dismiss fails", async () => {
    mocks.dismiss.mockResolvedValueOnce({ error: "nope" });
    rows = [row("A", -60_000)];
    await mount(rows);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not dismiss that alarm. Try again.");
    expect(screen.getByRole("alert")).toHaveTextContent("A is now");
    expect(channels[0].posted).toEqual([]);
  });

  it("only tells other tabs when at least one dismiss worked", async () => {
    mocks.dismiss.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ error: "x" });
    rows = [row("A", -2 * 60_000), row("B", -60_000)];
    await mount(rows);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("B is now");
    expect(channels[0].posted).toHaveLength(1);
  });
});
