import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OnlineUsersCard } from "@/app/dashboard/_components/online-users-card";
import {
  WORKSPACE_ONLINE_CHANNEL,
  WORKSPACE_POKE_EVENT,
  type WorkspacePresencePayload,
  type WorkspacePokeBroadcastPayload,
} from "@/lib/online-presence";

const actionMocks = vi.hoisted(() => ({
  sendPokeAction: vi.fn(),
}));

const toastMocks = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  });

  return { toast };
});

const supabaseMocks = vi.hoisted(() => {
  const state = {
    presence: {} as Record<string, Array<Record<string, unknown>>>,
  };

  const handlers: {
    presenceSync: (() => void) | null;
    broadcast: ((payload: { payload: unknown }) => void) | null;
  } = {
    presenceSync: null,
    broadcast: null,
  };

  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
    track: vi.fn(async () => "ok"),
    untrack: vi.fn(async () => "ok"),
    send: vi.fn(async () => "ok"),
    presenceState: vi.fn(() => state.presence),
  };

  channel.on.mockImplementation((type, filter, callback) => {
    if (type === "presence" && filter?.event === "sync") {
      handlers.presenceSync = callback;
    }

    if (type === "broadcast" && filter?.event === WORKSPACE_POKE_EVENT) {
      handlers.broadcast = callback;
    }

    return channel;
  });

  channel.subscribe.mockImplementation((callback?: (status: string) => void) => {
    callback?.("SUBSCRIBED");
    return channel;
  });

  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => "ok"),
  };

  return {
    state,
    handlers,
    channel,
    client,
    createClient: vi.fn(() => client),
  };
});

vi.mock("@/app/actions/pokes", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks.toast }));
vi.mock("@/lib/supabase/client", () => ({ createClient: supabaseMocks.createClient }));

function makeCurrentUser(
  overrides: Partial<WorkspacePresencePayload> = {}
): WorkspacePresencePayload {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Current User",
    email: "current@example.com",
    avatarUrl: null,
    ...overrides,
  };
}

describe("OnlineUsersCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.state.presence = {};
    supabaseMocks.handlers.presenceSync = null;
    supabaseMocks.handlers.broadcast = null;
    actionMocks.sendPokeAction.mockResolvedValue({
      success: true,
      payload: {
        pokeId: "poke-1",
        fromUserId: "11111111-1111-4111-8111-111111111111",
        fromName: "Current User",
        fromAvatarUrl: null,
        toUserId: "22222222-2222-4222-8222-222222222222",
        createdAt: "2026-03-18T12:00:00.000Z",
      },
    });
  });

  it("renders fallback current user and subscribes to workspace channel", async () => {
    render(<OnlineUsersCard currentUser={makeCurrentUser()} />);

    expect(screen.getByText("Online now")).toBeInTheDocument();
    expect(screen.getByText("Current User (You)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Poke" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(supabaseMocks.createClient).toHaveBeenCalledTimes(1);
      expect(supabaseMocks.client.channel).toHaveBeenCalledWith(WORKSPACE_ONLINE_CHANNEL, {
        config: {
          presence: { key: "11111111-1111-4111-8111-111111111111" },
        },
      });
      expect(supabaseMocks.channel.track).toHaveBeenCalled();
    });
  });

  it("syncs presence users, sorts names, and deduplicates multi-tab users", async () => {
    supabaseMocks.state.presence = {
      sessionA: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Beta User",
          email: "beta@example.com",
          avatarUrl: null,
        },
      ],
      sessionB: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          email: "beta@example.com",
        },
      ],
      sessionC: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Alpha User",
          email: "alpha@example.com",
          avatarUrl: null,
        },
      ],
    };

    render(<OnlineUsersCard currentUser={makeCurrentUser()} />);

    expect(await screen.findByText("Alpha User")).toBeInTheDocument();
    expect(screen.getByText("Beta User")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Poke" })).toHaveLength(2);
    expect(screen.queryByText(/clients/)).not.toBeInTheDocument();

    const memberNames = screen
      .getAllByText(/Alpha User|Beta User/)
      .map((node) => node.textContent ?? "");

    expect(memberNames[0]).toContain("Alpha User");
    expect(memberNames[1]).toContain("Beta User");
  });

  it("ignores malformed presence entries and enriches existing user data", async () => {
    supabaseMocks.state.presence = {
      sessionA: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          email: "beta@example.com",
        },
        {
          email: "missing-id@example.com",
        },
      ],
      sessionB: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          email: "beta@example.com",
          name: "Beta User",
          avatarUrl: "https://example.com/avatar.png",
        },
      ],
      sessionC: [
        {
          id: "33333333-3333-4333-8333-333333333333",
        },
      ],
    };

    render(<OnlineUsersCard currentUser={makeCurrentUser()} />);

    expect(await screen.findByText("Beta User")).toBeInTheDocument();
    expect(screen.queryByText("missing-id@example.com")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Poke" })).toHaveLength(1);
    expect(screen.queryByText(/clients/)).not.toBeInTheDocument();
  });

  it("sends poke broadcasts and surfaces success", async () => {
    supabaseMocks.state.presence = {
      sessionA: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Teammate",
          email: "teammate@example.com",
          avatarUrl: null,
        },
      ],
    };

    render(<OnlineUsersCard currentUser={makeCurrentUser()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Poke" }));

    await waitFor(() => {
      expect(actionMocks.sendPokeAction).toHaveBeenCalledWith({
        targetUserId: "22222222-2222-4222-8222-222222222222",
      });
      expect(supabaseMocks.channel.send).toHaveBeenCalledWith({
        type: "broadcast",
        event: WORKSPACE_POKE_EVENT,
        payload: expect.objectContaining({
          toUserId: "22222222-2222-4222-8222-222222222222",
        }),
      });
      expect(toastMocks.toast.success).toHaveBeenCalledWith("Poked Teammate.");
    });
  });

  it("shows action errors and realtime incoming poke notifications", async () => {
    supabaseMocks.state.presence = {
      sessionA: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Teammate",
          email: "teammate@example.com",
          avatarUrl: null,
        },
      ],
    };

    actionMocks.sendPokeAction.mockResolvedValueOnce({ error: "Too many pokes" });

    const { unmount } = render(<OnlineUsersCard currentUser={makeCurrentUser()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Poke" }));

    await waitFor(() => {
      expect(toastMocks.toast.error).toHaveBeenCalledWith("Too many pokes");
    });

    const payload: WorkspacePokeBroadcastPayload = {
      pokeId: "poke-2",
      fromUserId: "22222222-2222-4222-8222-222222222222",
      fromName: "Teammate",
      fromAvatarUrl: null,
      toUserId: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-03-18T12:02:00.000Z",
    };

    supabaseMocks.handlers.broadcast?.({ payload });
    expect(toastMocks.toast).toHaveBeenCalledWith("Teammate poked you.");

    supabaseMocks.handlers.broadcast?.({ payload: { invalid: true } });

    unmount();

    await waitFor(() => {
      expect(supabaseMocks.channel.untrack).toHaveBeenCalledTimes(1);
      expect(supabaseMocks.client.removeChannel).toHaveBeenCalledTimes(1);
    });
  });

  it("shows realtime delivery error when broadcast send is not acknowledged", async () => {
    supabaseMocks.state.presence = {
      sessionA: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Teammate",
          email: "teammate@example.com",
          avatarUrl: null,
        },
      ],
    };
    supabaseMocks.channel.send.mockResolvedValueOnce("timed_out");

    render(<OnlineUsersCard currentUser={makeCurrentUser()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Poke" }));

    await waitFor(() => {
      expect(toastMocks.toast.error).toHaveBeenCalledWith(
        "Poke was saved, but realtime delivery failed."
      );
      expect(toastMocks.toast.success).toHaveBeenCalledWith("Poked Teammate.");
    });
  });

  it("shows generic error when poke action throws and ignores pokes for other users", async () => {
    supabaseMocks.state.presence = {
      sessionA: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Teammate",
          email: "teammate@example.com",
          avatarUrl: null,
        },
      ],
    };
    actionMocks.sendPokeAction.mockRejectedValueOnce(new Error("boom"));

    render(<OnlineUsersCard currentUser={makeCurrentUser()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Poke" }));

    await waitFor(() => {
      expect(toastMocks.toast.error).toHaveBeenCalledWith("Failed to send poke. Please try again.");
    });

    const toastCallCount = toastMocks.toast.mock.calls.length;

    supabaseMocks.handlers.broadcast?.({
      payload: {
        pokeId: "poke-other",
        fromUserId: "22222222-2222-4222-8222-222222222222",
        fromName: "Teammate",
        fromAvatarUrl: null,
        toUserId: "99999999-9999-4999-8999-999999999999",
        createdAt: "2026-03-18T12:00:00.000Z",
      },
    });

    expect(toastMocks.toast.mock.calls.length).toBe(toastCallCount);
  });
});
