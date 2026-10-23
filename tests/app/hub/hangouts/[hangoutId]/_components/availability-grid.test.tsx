import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AvailabilityGrid } from "@/app/hub/hangouts/[hangoutId]/_components/availability-grid";

const actionMocks = vi.hoisted(() => ({ saveAvailabilityAction: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@/app/actions/hangouts", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));

const setup = { dates: ["2026-10-03", "2026-10-04"], startHour: 10, endHour: 11 };
const responses = [
  { userId: "me", name: "Me", slots: ["2026-10-03T10:00"] },
  { userId: "u2", name: "Bo", slots: ["2026-10-03T10:00", "2026-10-04T10:30"] },
];

function renderGrid(editable = true) {
  render(
    <AvailabilityGrid
      hangoutId="h1"
      setup={setup}
      user={{ id: "me", name: "Me" }}
      responses={responses}
      editable={editable}
    />
  );
}

const mine = (label: string) => screen.getByRole("button", { name: label });

describe("AvailabilityGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.saveAvailabilityAction.mockResolvedValue({ success: true });
  });

  it("paints a rectangle of slots by dragging and autosaves on release", async () => {
    renderGrid();
    const from = mine("Sat, Oct 3, 10:30 AM");
    const to = mine("Sun, Oct 4, 10:30 AM");
    document.elementFromPoint = vi.fn(() => to);

    fireEvent.pointerDown(from, { pointerId: 1 });
    fireEvent.pointerMove(from.parentElement!, { clientX: 1, clientY: 1 });
    expect(mine("Sun, Oct 4, 10:30 AM")).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerUp(window);

    await waitFor(() =>
      expect(actionMocks.saveAvailabilityAction).toHaveBeenCalledWith({
        hangoutId: "h1",
        slots: ["2026-10-03T10:00", "2026-10-03T10:30", "2026-10-04T10:30"],
      })
    );

    fireEvent.pointerDown(mine("Sat, Oct 3, 10:00 AM"), { pointerId: 1 });
    fireEvent.pointerCancel(window);
    expect(mine("Sat, Oct 3, 10:00 AM")).toHaveAttribute("aria-pressed", "true");
    expect(actionMocks.saveAvailabilityAction).toHaveBeenCalledTimes(1);
  });

  it("toggles a slot from the keyboard and reverts when saving fails", async () => {
    actionMocks.saveAvailabilityAction.mockResolvedValueOnce({ error: "Hangout closed" });
    renderGrid();

    fireEvent.click(mine("Sat, Oct 3, 10:00 AM"));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Hangout closed"));
    expect(actionMocks.saveAvailabilityAction).toHaveBeenCalledWith({ hangoutId: "h1", slots: [] });
    expect(mine("Sat, Oct 3, 10:00 AM")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(mine("Sat, Oct 3, 10:00 AM"), { detail: 1 });
    expect(actionMocks.saveAvailabilityAction).toHaveBeenCalledTimes(1);
  });

  it("shows who is free for a hovered or tapped group slot", () => {
    renderGrid(false);
    expect(screen.getByRole("button", { name: "Group" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Mine" }));
    expect(screen.getByText("Availability is closed.")).toBeInTheDocument();
    expect(mine("Sat, Oct 3, 10:00 AM")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Group" }));
    expect(
      screen.getByText(
        "Hover or tap a slot, or drag across slots (press and hold first on touch), to see who is free."
      )
    ).toBeInTheDocument();

    fireEvent.pointerEnter(
      screen.getByRole("button", { name: "Sat, Oct 3, 10:00 AM: 2 of 2 free" })
    );
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("Bo, Me")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sun, Oct 4, 10:30 AM: 1 of 2 free" }));
    expect(within(panel).getByText("1 of 2 free")).toBeInTheDocument();
    expect(within(panel).getByText("Bo")).toBeInTheDocument();
    expect(within(panel).getByText("Me")).toBeInTheDocument();

    fireEvent.focus(screen.getByRole("button", { name: "Sat, Oct 3, 10:30 AM: 0 of 2 free" }));
    expect(within(panel).getByText("Nobody")).toBeInTheDocument();
  });

  it("pages one calendar week at a time when more than five days are set", () => {
    const dates = [5, 6, 7, 8, 9, 10, 11, 12].map(
      (day) => `2026-10-${String(day).padStart(2, "0")}`
    );
    render(
      <AvailabilityGrid
        hangoutId="h1"
        setup={{ dates, startHour: 10, endHour: 11 }}
        user={{ id: "me", name: "Me" }}
        responses={[]}
        editable
      />
    );
    expect(screen.getByText("Oct 5 – Oct 11")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Mon, Oct 5, 10:00 AM/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Oct 12/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Previous week" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByText("Oct 12", { selector: "p" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Mon, Oct 12, 10:00 AM/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Oct 5/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
  });

  it("shows no week controls with five or fewer days", () => {
    renderGrid();
    expect(screen.queryByRole("button", { name: "Next week" })).toBeNull();
  });

  it("explains an empty group", () => {
    render(
      <AvailabilityGrid
        hangoutId="h1"
        setup={setup}
        user={{ id: "me", name: "Me" }}
        responses={[]}
        editable
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Group" }));
    expect(screen.getByText("No one has filled this in yet.")).toBeInTheDocument();
  });

  it("starts in Mine while editable and in Group when closed, and the toggle swaps the grid", () => {
    renderGrid();
    expect(screen.getByRole("button", { name: "Mine" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Your availability")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Group" }));
    expect(screen.getByRole("button", { name: "Group" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Group availability")).toBeInTheDocument();
    expect(screen.queryByText("Your availability")).toBeNull();
    expect(screen.getByRole("complementary")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mine" }));
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("adds the year to day headers only when the dates cross a year boundary", () => {
    const view = (dates: string[]) =>
      render(
        <AvailabilityGrid
          hangoutId="h1"
          setup={{ dates, startHour: 10, endHour: 11 }}
          user={{ id: "me", name: "Me" }}
          responses={[]}
          editable
        />
      );
    const same = view(["2026-10-03", "2026-10-04"]);
    expect(screen.getByText("Oct 3")).toBeInTheDocument();
    expect(screen.queryByText(/2026/)).toBeNull();
    same.unmount();

    view(["2026-12-31", "2027-01-01"]);
    expect(screen.getByText("Dec 31, 2026")).toBeInTheDocument();
    expect(screen.getByText("Jan 1, 2027")).toBeInTheDocument();
  });

  it("points Mine viewers to the Group view and legends their own grid", () => {
    renderGrid();
    expect(screen.getByText("Switch to Group to see who else is free.")).toBeInTheDocument();
    expect(screen.getByText(/Not frees*Free/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Group" }));
    expect(screen.queryByText("Switch to Group to see who else is free.")).toBeNull();
  });

  it("tracks the pinned panel height so the page leaves room for it", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe;
        disconnect = disconnect;
      }
    );
    try {
      renderGrid();
      fireEvent.click(screen.getByRole("button", { name: "Group" }));
      expect(observe).toHaveBeenCalledWith(screen.getByRole("complementary"));
      fireEvent.click(screen.getByRole("button", { name: "Mine" }));
      expect(disconnect).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe("group range", () => {
    const rangeResponses = [
      { userId: "me", name: "Me", slots: ["2026-10-03T10:00", "2026-10-03T10:30"] },
      {
        userId: "u2",
        name: "Bo",
        slots: ["2026-10-03T10:00", "2026-10-03T10:30", "2026-10-04T10:30"],
      },
    ];

    function renderGroup() {
      render(
        <AvailabilityGrid
          hangoutId="h1"
          setup={setup}
          user={{ id: "me", name: "Me" }}
          responses={rangeResponses}
          editable
        />
      );
      fireEvent.click(screen.getByRole("button", { name: "Group" }));
    }

    const group = (label: string) => screen.getByRole("button", { name: label });

    it("shows who is free for the whole range after a drag and keeps it on hover", () => {
      renderGroup();
      const from = group("Sat, Oct 3, 10:00 AM: 2 of 2 free");
      const to = group("Sat, Oct 3, 10:30 AM: 2 of 2 free");
      document.elementFromPoint = vi.fn(() => to);

      fireEvent.pointerDown(from, { pointerId: 1 });
      fireEvent.pointerMove(from.parentElement!, { clientX: 1, clientY: 1 });
      fireEvent.pointerUp(window);

      const panel = screen.getByRole("complementary");
      expect(
        within(panel).getByText("Sat, Oct 3, 10:00 AM–11:00 AM (2 slots)", { exact: false })
      ).toBeInTheDocument();
      expect(within(panel).getByText("2 of 2 free for the whole range")).toBeInTheDocument();
      expect(within(panel).getByText("Bo, Me")).toBeInTheDocument();
      expect(
        screen.getByText("Sat, Oct 3, 10:00 AM–11:00 AM (2 slots): 2 of 2 free for the whole range")
      ).toBeInTheDocument();

      fireEvent.pointerEnter(group("Sun, Oct 4, 10:00 AM: 0 of 2 free"));
      expect(within(panel).getByText("2 of 2 free for the whole range")).toBeInTheDocument();
    });

    it("lists nobody when someone misses a slot in a multi-day range", () => {
      renderGroup();
      const from = group("Sat, Oct 3, 10:00 AM: 2 of 2 free");
      const to = group("Sun, Oct 4, 10:30 AM: 1 of 2 free");
      document.elementFromPoint = vi.fn(() => to);

      fireEvent.pointerDown(from, { pointerId: 1 });
      fireEvent.pointerMove(from.parentElement!, { clientX: 1, clientY: 1 });
      fireEvent.pointerUp(window);

      const panel = screen.getByRole("complementary");
      expect(
        within(panel).getByText("Sat, Oct 3 – Sun, Oct 4, 10:00 AM–11:00 AM (4 slots)", {
          exact: false,
        })
      ).toBeInTheDocument();
      expect(within(panel).getByText("0 of 2 free for the whole range")).toBeInTheDocument();
      expect(within(panel).getByText("Nobody")).toBeInTheDocument();
      expect(within(panel).getByText("Bo, Me")).toBeInTheDocument();
    });

    it("needs a short hold before a touch starts a range, so swipes can scroll", () => {
      vi.useFakeTimers();
      try {
        renderGroup();
        const from = group("Sat, Oct 3, 10:00 AM: 2 of 2 free");

        fireEvent.pointerDown(from, { pointerId: 1, pointerType: "touch" });
        fireEvent.pointerCancel(window);
        act(() => {
          vi.advanceTimersByTime(300);
        });
        expect(
          screen.getByText(
            "Hover or tap a slot, or drag across slots (press and hold first on touch), to see who is free."
          )
        ).toBeInTheDocument();

        fireEvent.pointerDown(from, { pointerId: 1, pointerType: "touch" });
        act(() => {
          vi.advanceTimersByTime(300);
        });
        expect(
          within(screen.getByRole("complementary")).getByText("Sat, Oct 3, 10:00 AM")
        ).toBeInTheDocument();
        fireEvent.pointerUp(window);
      } finally {
        vi.useRealTimers();
      }
    });

    it("selects one slot on tap and announces it", () => {
      renderGroup();
      fireEvent.click(group("Sun, Oct 4, 10:30 AM: 1 of 2 free"));
      expect(screen.getByText("Sun, Oct 4, 10:30 AM")).toBeInTheDocument();
      fireEvent.focus(group("Sat, Oct 3, 10:00 AM: 2 of 2 free"));
      expect(
        screen.getByText("Sat, Oct 3, 10:00 AM: 2 of 2 free", { selector: "p" })
      ).toBeInTheDocument();
    });
  });
});
