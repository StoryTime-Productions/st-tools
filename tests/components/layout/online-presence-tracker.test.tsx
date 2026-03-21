import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { OnlinePresenceTracker } from "@/components/layout/online-presence-tracker";
import { WORKSPACE_ONLINE_CHANNEL } from "@/lib/online-presence";

const channelMocks = vi.hoisted(() => ({
  track: vi.fn(),
  untrack: vi.fn(),
  subscribe: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => supabaseMocks,
}));

describe("OnlinePresenceTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    channelMocks.subscribe.mockImplementation((callback?: (status: string) => void) => {
      callback?.("SUBSCRIBED");
      return channelMocks;
    });

    supabaseMocks.channel.mockReturnValue(channelMocks);
    supabaseMocks.removeChannel.mockResolvedValue(undefined);
  });

  it("tracks current user presence when the channel subscribes", async () => {
    render(
      <OnlinePresenceTracker
        user={{
          id: "11111111-1111-4111-8111-111111111111",
          name: "Online User",
          email: "online@example.com",
          avatarUrl: null,
        }}
      />
    );

    expect(supabaseMocks.channel).toHaveBeenCalledWith(WORKSPACE_ONLINE_CHANNEL, {
      config: {
        presence: {
          key: "11111111-1111-4111-8111-111111111111",
        },
      },
    });

    await waitFor(() => {
      expect(channelMocks.track).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "11111111-1111-4111-8111-111111111111",
          name: "Online User",
          email: "online@example.com",
          avatarUrl: null,
          activeAt: expect.any(String),
        })
      );
    });
  });

  it("cleans up channel subscriptions on unmount", () => {
    const { unmount } = render(
      <OnlinePresenceTracker
        user={{
          id: "22222222-2222-4222-8222-222222222222",
          name: null,
          email: "member@example.com",
          avatarUrl: "https://example.com/avatar.png",
        }}
      />
    );

    unmount();

    expect(channelMocks.untrack).toHaveBeenCalled();
    expect(supabaseMocks.removeChannel).toHaveBeenCalledWith(channelMocks);
  });

  it("does not track presence when subscription status is not subscribed", async () => {
    channelMocks.subscribe.mockImplementationOnce((callback?: (status: string) => void) => {
      callback?.("CHANNEL_ERROR");
      return channelMocks;
    });

    render(
      <OnlinePresenceTracker
        user={{
          id: "33333333-3333-4333-8333-333333333333",
          name: "Fallback User",
          email: "fallback@example.com",
          avatarUrl: null,
        }}
      />
    );

    await waitFor(() => {
      expect(channelMocks.track).not.toHaveBeenCalled();
    });
  });
});
