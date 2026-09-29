import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AvailabilitySetup } from "@/app/hub/hangouts/[hangoutId]/_components/availability-setup";

const actionMocks = vi.hoisted(() => ({ setAvailabilitySetupAction: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions/hangouts", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("@/components/ui/select", async () => import("../../../../../helpers/native-select"));

function renderSetup(
  initial = { dates: [] as string[], startHour: 9, endHour: 17, deadline: null as string | null }
) {
  render(<AvailabilitySetup hangoutId="h1" today="2026-09-28" initial={initial} />);
}

describe("AvailabilitySetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("picks dates, hours and a deadline and saves them", async () => {
    actionMocks.setAvailabilitySetupAction
      .mockResolvedValueOnce({ error: "End time must be after the start time" })
      .mockResolvedValueOnce({ success: true });
    renderSetup();

    const save = screen.getByRole("button", { name: "Save availability setup" });
    expect(save).toBeDisabled();
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sunday, September 27" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Saturday, October 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Friday, October 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Sunday, October 4" }));
    fireEvent.click(screen.getByRole("button", { name: "Sunday, October 4" }));
    expect(screen.getByRole("button", { name: "Friday, October 2" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("(2 picked)")).toBeInTheDocument();

    const [start, end] = screen.getAllByRole("combobox");
    fireEvent.change(start, { target: { value: "18" } });
    fireEvent.change(end, { target: { value: "22" } });
    fireEvent.change(screen.getByLabelText("Deadline (optional, EST)"), {
      target: { value: "2026-10-01T18:00" },
    });

    fireEvent.click(save);
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("End time must be after the start time")
    );
    expect(actionMocks.setAvailabilitySetupAction).toHaveBeenCalledWith({
      hangoutId: "h1",
      dates: ["2026-10-02", "2026-10-03"],
      startHour: 18,
      endHour: 22,
      deadline: "2026-10-01T18:00",
    });

    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith("Availability setup saved")
    );
    expect(routerMocks.refresh).toHaveBeenCalled();
  });

  it("starts on the first saved date and clears an empty deadline", async () => {
    actionMocks.setAvailabilitySetupAction.mockResolvedValue({ success: true });
    renderSetup({
      dates: ["2026-08-30"],
      startHour: 10,
      endHour: 16,
      deadline: "2026-08-29T12:00",
    });

    expect(screen.getByText("August 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sunday, August 30" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("July 2026")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Deadline (optional, EST)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save availability setup" }));
    await waitFor(() =>
      expect(actionMocks.setAvailabilitySetupAction).toHaveBeenCalledWith(
        expect.objectContaining({
          dates: ["2026-08-30"],
          startHour: 10,
          endHour: 16,
          deadline: null,
        })
      )
    );
  });
});
