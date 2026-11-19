import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { COUNTDOWNS_CHANGED } from "@/lib/countdown-sync";

const refresh = vi.hoisted(() => vi.fn());
const deleteCountdownAction = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/app/actions/countdowns", () => ({
  deleteCountdownAction,
  saveCountdownAction: vi.fn(),
}));

import { CountdownsCard } from "@/app/dashboard/_components/countdowns-card";
import type { CountdownItem } from "@/app/dashboard/_components/countdown-dialog";

const NOW = new Date("2026-11-13T12:00:00Z");

const item = (over: Partial<CountdownItem>): CountdownItem => ({
  id: "c1",
  title: "Road trip",
  targetAt: "2026-11-16T20:00:00.000Z",
  scope: "PERSONAL",
  ownerId: "me",
  audienceCount: null,
  audienceUserIds: [],
  dismissed: false,
  ...over,
});

function setup(countdowns: CountdownItem[], isAdmin = false) {
  return render(
    <CountdownsCard
      countdowns={countdowns}
      userId="me"
      isAdmin={isAdmin}
      members={[{ id: "u1", name: "Alice" }]}
    />
  );
}

describe("CountdownsCard", () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    deleteCountdownAction.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows an empty state with the personal count", () => {
    setup([]);
    expect(screen.getByRole("heading", { name: "Countdowns" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing to count down to yet/)).toBeInTheDocument();
    expect(screen.getByText("0/10 personal")).toBeInTheDocument();
  });

  it("lists each countdown with its date, audience and time left as text", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    setup([
      item({ id: "g", title: "Hangout", scope: "GLOBAL", audienceCount: 3 }),
      item({ id: "p", title: "Trip", targetAt: "2026-11-13T14:05:00.000Z" }),
    ]);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("Hangout")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/Mon, Nov 16, 3:00 PM/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/3 people/)).toBeInTheDocument();
    expect(within(rows[0]).getByText("in 3 days")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/Only you/)).toBeInTheDocument();
    expect(within(rows[1]).getByText("in 2 h 05 m")).toBeInTheDocument();
    expect(screen.getByText("1/10 personal")).toBeInTheDocument();
  });

  it("marks a reached countdown with an icon as well as the word", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    setup([item({ targetAt: "2026-11-13T11:50:00.000Z" })]);
    const label = screen.getByText("Reached");
    expect(label.querySelector("svg")).not.toBeNull();
  });

  it("moves the time left forward every minute", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    setup([item({ targetAt: "2026-11-13T12:30:30.000Z" })]);
    expect(screen.getByText("in 30 min")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(60_100);
    });
    expect(screen.getByText("in 29 min")).toBeInTheDocument();
  });

  it("flips to Reached at the target itself, not at the next minute", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    setup([item({ targetAt: "2026-11-13T12:00:45.000Z" })]);
    expect(screen.getByText("in under a minute")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(45_100);
    });
    expect(screen.getByText("Reached")).toBeInTheDocument();
  });

  it("gives actions only on what the viewer may change", () => {
    setup([
      item({ id: "a", title: "Mine" }),
      item({ id: "b", title: "Theirs", ownerId: "other" }),
      item({ id: "c", title: "Shared", scope: "GLOBAL", ownerId: "other" }),
    ]);
    expect(screen.getByRole("button", { name: "Actions for Mine" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions for Theirs" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Actions for Shared" })).toBeNull();
  });

  it("lets an admin change a global countdown", () => {
    setup([item({ id: "c", title: "Shared", scope: "GLOBAL", ownerId: "other" })], true);
    expect(screen.getByRole("button", { name: "Actions for Shared" })).toBeInTheDocument();
  });

  it("opens the new-countdown dialog and refreshes when it closes", async () => {
    setup([]);
    await userEvent.click(screen.getByRole("button", { name: "New countdown" }));
    expect(screen.getByRole("heading", { name: "New countdown" })).toBeInTheDocument();
    const changed = vi.fn();
    window.addEventListener(COUNTDOWNS_CHANGED, changed);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    window.removeEventListener(COUNTDOWNS_CHANGED, changed);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "New countdown" })).toBeNull();
  });

  it("returns focus to the row's actions button after editing", async () => {
    setup([item({})]);
    const trigger = screen.getByRole("button", { name: "Actions for Road trip" });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("returns focus to New countdown after creating", async () => {
    setup([]);
    const button = screen.getByRole("button", { name: "New countdown" });
    await userEvent.click(button);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("opens an existing countdown to edit", async () => {
    setup([item({})]);
    await userEvent.click(screen.getByRole("button", { name: "Actions for Road trip" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit countdown" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Road trip");
  });

  async function openDelete() {
    await userEvent.click(screen.getByRole("button", { name: "Actions for Road trip" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
  }

  it("deletes after the viewer confirms", async () => {
    setup([item({})]);
    await openDelete();
    expect(screen.getByText(/Delete "Road trip"\?/)).toBeInTheDocument();
    const changed = vi.fn();
    window.addEventListener(COUNTDOWNS_CHANGED, changed);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteCountdownAction).toHaveBeenCalledWith("c1"));
    window.removeEventListener(COUNTDOWNS_CHANGED, changed);
    expect(toast.success).toHaveBeenCalledWith("Countdown deleted");
    expect(refresh).toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("keeps the countdown when the viewer cancels", async () => {
    setup([item({})]);
    await openDelete();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deleteCountdownAction).not.toHaveBeenCalled();
  });

  it("says so when the delete fails", async () => {
    deleteCountdownAction.mockResolvedValue({ error: "You can't change that countdown." });
    setup([item({})]);
    await openDelete();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("You can't change that countdown.")
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("arms and mutes the alarm sound from the header button", async () => {
    window.localStorage.clear();
    setup([]);
    const button = screen.getByRole("button", { name: "Alarm sound" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveAttribute("title", "Alarm sound is off");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("title", "Alarm sound is on");
    expect(window.localStorage.getItem("st-countdown-sound")).toBe("on");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem("st-countdown-sound")).toBe("off");
  });
});
