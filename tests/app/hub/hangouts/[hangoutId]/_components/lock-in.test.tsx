import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LockedIn, RankedSlots } from "@/app/hub/hangouts/[hangoutId]/_components/lock-in";

const actionMocks = vi.hoisted(() => ({
  lockInHangoutAction: vi.fn(),
  reopenAvailabilityAction: vi.fn(),
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

  it("shows the locked time and attendees, and reopens for admins", async () => {
    actionMocks.reopenAvailabilityAction.mockResolvedValue({ success: true });
    render(
      <LockedIn
        hangoutId="h1"
        startSlot="2026-10-03T14:00"
        attendees={[
          { userId: "a", name: "Alice", status: "GOING" },
          { userId: "b", name: "Bob", status: "GOING" },
        ]}
        canReopen
      />
    );

    expect(screen.getByText("Sat, Oct 3, 2:00 PM EST")).toBeInTheDocument();
    expect(screen.getByText("Alice, Bob")).toBeInTheDocument();
    expect(screen.getByText("Nobody yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reopen availability" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Availability reopened"));
    expect(actionMocks.reopenAvailabilityAction).toHaveBeenCalledWith("h1");
  });

  it("does not reopen when cancelled or for members", () => {
    const { rerender } = render(
      <LockedIn hangoutId="h1" startSlot="2026-10-03T14:00" attendees={[]} canReopen />
    );
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Reopen availability" }));
    expect(actionMocks.reopenAvailabilityAction).not.toHaveBeenCalled();

    rerender(
      <LockedIn hangoutId="h1" startSlot="2026-10-03T14:00" attendees={[]} canReopen={false} />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
