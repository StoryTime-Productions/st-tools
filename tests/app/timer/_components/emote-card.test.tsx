import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EmoteCard } from "@/app/timer/_components/emote-card";

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMocks }));

describe("EmoteCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all four emote buttons", () => {
    render(<EmoteCard onEmote={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Locked In/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Burnt out/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crashing out/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Doom scrolling/ })).toBeInTheDocument();
  });

  it("calls onEmote with the correct emote id when a button is clicked", async () => {
    const onEmote = vi.fn().mockResolvedValue(undefined);
    render(<EmoteCard onEmote={onEmote} />);

    fireEvent.click(screen.getByRole("button", { name: /Locked In/ }));

    await waitFor(() => {
      expect(onEmote).toHaveBeenCalledWith("locked-in");
    });
  });

  it("disables all buttons while the emote is in flight", async () => {
    let resolveEmote!: () => void;
    const onEmote = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveEmote = resolve;
        })
    );

    render(<EmoteCard onEmote={onEmote} />);

    fireEvent.click(screen.getByRole("button", { name: /Burnt out/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Locked In/ })).toBeDisabled();
    });

    act(() => {
      resolveEmote();
    });
  });

  it("disables buttons during cooldown after a successful emote", async () => {
    const onEmote = vi.fn().mockResolvedValue(undefined);
    render(<EmoteCard onEmote={onEmote} />);

    fireEvent.click(screen.getByRole("button", { name: /Crashing out/ }));

    await waitFor(() => {
      expect(onEmote).toHaveBeenCalled();
    });

    expect(screen.getByRole("button", { name: /Locked In/ })).toBeDisabled();
  });

  it("shows error toast when server returns retryAfterSeconds", async () => {
    const onEmote = vi.fn().mockResolvedValue({ retryAfterSeconds: 3 });
    render(<EmoteCard onEmote={onEmote} />);

    fireEvent.click(screen.getByRole("button", { name: /Doom scrolling/ }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Wait 3s before emoting again.");
    });
  });

  it("re-enables buttons after cooldown timer fires", async () => {
    vi.useFakeTimers();
    const onEmote = vi.fn().mockResolvedValue(undefined);
    render(<EmoteCard onEmote={onEmote} />);

    fireEvent.click(screen.getByRole("button", { name: /Locked In/ }));

    await act(async () => {
      await onEmote.mock.results[0]?.value;
    });

    expect(screen.getByRole("button", { name: /Locked In/ })).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(5001);
    });

    expect(screen.getByRole("button", { name: /Locked In/ })).not.toBeDisabled();
    vi.useRealTimers();
  });
});
