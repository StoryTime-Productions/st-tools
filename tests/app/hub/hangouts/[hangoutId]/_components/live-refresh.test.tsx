import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRefresh } from "@/app/hub/hangouts/[hangoutId]/_components/live-refresh";

const refresh = vi.hoisted(() => vi.fn());
const removeChannel = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ topic: "", onChanged: () => {} }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: (topic: string) => {
      state.topic = topic;
      const channel = {
        on: (_type: string, _filter: unknown, callback: () => void) => {
          state.onChanged = callback;
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel,
  }),
}));

describe("LiveRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("collapses a burst of changes into one refresh", () => {
    render(<LiveRefresh hangoutId="h1" />);
    expect(state.topic).toBe("hangout:h1");

    act(() => {
      state.onChanged();
      state.onChanged();
      state.onChanged();
      vi.advanceTimersByTime(500);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes and drops a pending refresh on unmount", () => {
    const { unmount } = render(<LiveRefresh hangoutId="h1" />);
    act(() => state.onChanged());
    unmount();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(removeChannel).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});
