import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { LiveStats } from "@/app/dashboard/_components/live-stats";

const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));
const supabaseMocks = vi.hoisted(() => {
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return { channel, removeChannel: vi.fn(), createClient: vi.fn() };
});

vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("@/lib/supabase/client", () => ({ createClient: supabaseMocks.createClient }));

function onPulse() {
  const handler = supabaseMocks.channel.on.mock.calls[0]?.[2] as () => void;
  act(() => handler());
}

function reportStatus(status: string) {
  const callback = supabaseMocks.channel.subscribe.mock.calls[0]?.[0] as (s: string) => void;
  act(() => callback(status));
}

describe("LiveStats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    routerMocks.refresh.mockClear();
    supabaseMocks.channel.on.mockClear();
    supabaseMocks.channel.subscribe.mockClear();
    supabaseMocks.removeChannel.mockClear();
    supabaseMocks.createClient.mockReset();
    supabaseMocks.createClient.mockReturnValue({
      channel: () => supabaseMocks.channel,
      removeChannel: supabaseMocks.removeChannel,
    });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("listens to the pulse table and refreshes once, shortly after a burst of changes", () => {
    render(<LiveStats debounceMs={500} />);
    reportStatus("SUBSCRIBED");

    expect(supabaseMocks.channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "*", schema: "public", table: "discord_stats_pulse" },
      expect.any(Function)
    );

    onPulse();
    onPulse();
    onPulse();
    act(() => vi.advanceTimersByTime(499));
    expect(routerMocks.refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not poll while the realtime subscription is healthy", () => {
    render(<LiveStats fallbackPollMs={1000} />);
    reportStatus("SUBSCRIBED");

    act(() => vi.advanceTimersByTime(10_000));

    expect(routerMocks.refresh).not.toHaveBeenCalled();
  });

  it("polls until the subscription is up, and again if it errors, times out or closes", () => {
    render(<LiveStats fallbackPollMs={1000} />);

    act(() => vi.advanceTimersByTime(2000));
    expect(routerMocks.refresh).toHaveBeenCalledTimes(2);

    reportStatus("SUBSCRIBED");
    act(() => vi.advanceTimersByTime(3000));
    expect(routerMocks.refresh).toHaveBeenCalledTimes(2);

    for (const status of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]) {
      routerMocks.refresh.mockClear();
      reportStatus(status);
      reportStatus(status);
      act(() => vi.advanceTimersByTime(1000));
      expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
      reportStatus("SUBSCRIBED");
    }
  });

  it("does not poll in a hidden tab, but refreshes when the tab becomes visible again", () => {
    render(<LiveStats fallbackPollMs={1000} />);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => vi.advanceTimersByTime(3000));
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(routerMocks.refresh).not.toHaveBeenCalled();

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("stops listening, stops polling and drops a pending refresh when it unmounts", () => {
    const { unmount } = render(<LiveStats fallbackPollMs={1000} />);
    onPulse();

    unmount();
    act(() => vi.advanceTimersByTime(5000));

    expect(supabaseMocks.removeChannel).toHaveBeenCalledWith(supabaseMocks.channel);
    expect(routerMocks.refresh).not.toHaveBeenCalled();
  });

  it("polls instead when Supabase is not configured", () => {
    supabaseMocks.createClient.mockImplementation(() => {
      throw new Error("Missing Supabase browser configuration");
    });

    render(<LiveStats fallbackPollMs={1000} />);
    act(() => vi.advanceTimersByTime(1000));

    expect(supabaseMocks.channel.on).not.toHaveBeenCalled();
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
  });
});
