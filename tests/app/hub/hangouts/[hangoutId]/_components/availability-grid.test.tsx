import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AvailabilityGrid } from "@/app/hub/hangouts/[hangoutId]/_components/availability-grid";

const actionMocks = vi.hoisted(() => ({ saveAvailabilityAction: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@/app/actions/hangouts", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));

const setup = { dates: ["2026-10-03", "2026-10-04"], startHour: 10, endHour: 11 };
const responses = [
  { userId: "me", name: "Me", slots: ["2026-10-03T10:00"] },
  { userId: "u2", name: "Bo", slots: ["2026-10-03T10:00", "2026-10-04T10:15"] },
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
    const from = mine("Sat, Oct 3, 10:15 AM");
    const to = mine("Sun, Oct 4, 10:30 AM");
    document.elementFromPoint = vi.fn(() => to);

    fireEvent.pointerDown(from, { pointerId: 1 });
    fireEvent.pointerMove(from.parentElement!, { clientX: 1, clientY: 1 });
    expect(mine("Sun, Oct 4, 10:15 AM")).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerUp(window);

    await waitFor(() =>
      expect(actionMocks.saveAvailabilityAction).toHaveBeenCalledWith({
        hangoutId: "h1",
        slots: [
          "2026-10-03T10:00",
          "2026-10-03T10:15",
          "2026-10-03T10:30",
          "2026-10-04T10:15",
          "2026-10-04T10:30",
        ],
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
    expect(screen.getByText("Availability is closed.")).toBeInTheDocument();
    expect(mine("Sat, Oct 3, 10:00 AM")).toBeDisabled();
    expect(screen.getByText("Hover or tap a group slot to see who is free.")).toBeInTheDocument();

    fireEvent.pointerEnter(
      screen.getByRole("button", { name: "Sat, Oct 3, 10:00 AM: 2 of 2 free" })
    );
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("Bo, Me")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sun, Oct 4, 10:15 AM: 1 of 2 free" }));
    expect(within(panel).getByText("1 of 2 free")).toBeInTheDocument();
    expect(within(panel).getByText("Bo")).toBeInTheDocument();
    expect(within(panel).getByText("Me")).toBeInTheDocument();

    fireEvent.focus(screen.getByRole("button", { name: "Sat, Oct 3, 10:45 AM: 0 of 2 free" }));
    expect(within(panel).getByText("No one")).toBeInTheDocument();
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
    expect(screen.getByText("No one has filled this in yet.")).toBeInTheDocument();
  });
});
