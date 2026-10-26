import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  LockedIn,
  RankedSlots,
  ReopenAvailability,
} from "@/app/hub/hangouts/[hangoutId]/_components/lock-in";

const actionMocks = vi.hoisted(() => ({
  lockInHangoutAction: vi.fn(),
  reopenAvailabilityAction: vi.fn(),
  setAttendanceAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions/hangouts", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));

const RUNS = [
  { day: "2026-10-03", start: "14:00", end: "16:30", free: ["a", "b"] },
  { day: "2026-10-04", start: "10:00", end: "10:15", free: ["a"] },
];

describe("RankedSlots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("lists the best times and locks one in after confirming", async () => {
    actionMocks.lockInHangoutAction
      .mockResolvedValueOnce({ error: "That time is no longer a top option" })
      .mockResolvedValueOnce({ success: true });
    render(<RankedSlots hangoutId="h1" runs={RUNS} total={3} canLock />);

    expect(screen.getByText(/Sat, Oct 3, 2:00 PM – 4:30 PM/)).toHaveTextContent("2 of 3 free");
    const [first] = screen.getAllByRole("button", { name: "Lock in" });

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(first);
    expect(actionMocks.lockInHangoutAction).not.toHaveBeenCalled();

    fireEvent.click(first);
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("That time is no longer a top option")
    );
    expect(actionMocks.lockInHangoutAction).toHaveBeenCalledWith({
      hangoutId: "h1",
      slot: "2026-10-03T14:00",
    });

    fireEvent.click(first);
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Hangout scheduled"));
    expect(routerMocks.refresh).toHaveBeenCalled();
  });

  it("hides the lock button from members and renders nothing without runs", () => {
    const { container, rerender } = render(
      <RankedSlots hangoutId="h1" runs={RUNS} total={2} canLock={false} />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(<RankedSlots hangoutId="h1" runs={[]} total={0} canLock />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("LockedIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows the locked time hero and a roster with counts and chips", () => {
    render(
      <LockedIn
        hangoutId="h1"
        startSlot="2026-10-03T14:00"
        attendees={[
          { userId: "a", name: "Alice", status: "GOING" },
          { userId: "b", name: "Bob", status: "GOING" },
        ]}
        userId="a"
      />
    );

    expect(screen.getByText("Locked in")).toBeInTheDocument();
    expect(screen.getByText("Sat, Oct 3 · 2:00 PM EST")).toBeInTheDocument();
    expect(screen.getByText("Going (2)")).toBeInTheDocument();
    expect(screen.getByText("Maybe (0)")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getAllByText("Nobody yet")).toHaveLength(2);
  });

  it("sets the viewer's own attendance", async () => {
    actionMocks.setAttendanceAction
      .mockResolvedValueOnce({ error: "Hangout is not scheduled" })
      .mockResolvedValueOnce({ success: true });
    render(
      <LockedIn
        hangoutId="h1"
        startSlot="2026-10-03T14:00"
        attendees={[{ userId: "b", name: "Bob", status: "MAYBE" }]}
        userId="b"
      />
    );

    const group = screen.getByRole("group", { name: "Your attendance" });
    expect(within(group).getByRole("button", { name: "Maybe" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(group).getByRole("button", { name: "Going" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    fireEvent.click(within(group).getByRole("button", { name: "Not going" }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Hangout is not scheduled"));
    expect(actionMocks.setAttendanceAction).toHaveBeenCalledWith({
      hangoutId: "h1",
      status: "NOT_GOING",
    });

    fireEvent.click(within(group).getByRole("button", { name: "Going" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Attendance saved"));
    expect(routerMocks.refresh).toHaveBeenCalled();
  });
});

describe("ReopenAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("reopens after confirming and stays put when cancelled", async () => {
    actionMocks.reopenAvailabilityAction.mockResolvedValue({ success: true });
    render(<ReopenAvailability hangoutId="h1" />);
    const button = screen.getByRole("button", { name: "Reopen availability" });

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(button);
    expect(actionMocks.reopenAvailabilityAction).not.toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Availability reopened"));
    expect(actionMocks.reopenAvailabilityAction).toHaveBeenCalledWith("h1");
  });
});
