import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Carpools } from "@/app/hub/hangouts/[hangoutId]/_components/carpools";
import type { HangoutCarItem } from "@/lib/hangouts";

const actionMocks = vi.hoisted(() => ({
  offerCarAction: vi.fn(),
  recomputeRoutesAction: vi.fn(),
  updateCarAction: vi.fn(),
  removeCarAction: vi.fn(),
  joinCarAction: vi.fn(),
  leaveCarAction: vi.fn(),
  removeRiderAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions/carpools", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));

const alice = { userId: "a", name: "Alice", homeAddress: "1 Main St" };
const CAR: HangoutCarItem = {
  id: "car1",
  seats: 2,
  startAddress: null,
  commonPoint: "Union Station",
  schedule: null,
  driver: alice,
  riders: [{ userId: "b", name: "Bob", homeAddress: "9 Elm St", atCommonPoint: false }],
};
const viewer = (id: string, overrides = {}) => ({ id, isAdmin: false, going: true, ...overrides });

function renderCarpools(cars: HangoutCarItem[], who = viewer("c")) {
  return render(<Carpools hangoutId="h1" cars={cars} viewer={who} />);
}

describe("Carpools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    for (const action of Object.values(actionMocks)) action.mockResolvedValue({ success: true });
  });

  it("shows cars, start points and pick-ups, and lets a Going member join", async () => {
    renderCarpools([CAR]);

    const car = screen.getByRole("listitem", { name: "Alice's car" });
    expect(car).toHaveTextContent("Alice's car · 1/2 seats");
    expect(car).toHaveTextContent("Starts from: 1 Main St (home)");
    expect(car).toHaveTextContent("Common point: Union Station");
    expect(within(car).getByRole("list", { name: "Riders" })).toHaveTextContent("Bob · 9 Elm St");
    expect(within(car).queryByRole("button", { name: "Edit Alice's car" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Offer my car" })).toBeInTheDocument();

    fireEvent.click(within(car).getByRole("button", { name: "Join at common point" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Joined"));
    expect(actionMocks.joinCarAction).toHaveBeenCalledWith("car1", true);
    expect(routerMocks.refresh).toHaveBeenCalled();
  });

  it("lets a rider switch pick-up or leave, and nudges riders without an address", async () => {
    renderCarpools(
      [
        {
          ...CAR,
          startAddress: "5 Start Rd",
          riders: [{ userId: "c", name: "Cara", homeAddress: null, atCommonPoint: false }],
        },
      ],
      viewer("c")
    );

    expect(screen.getByText(/Starts from:/).parentElement).toHaveTextContent(
      "Starts from: 5 Start Rd"
    );
    expect(screen.getByRole("link", { name: "add one in your profile" })).toHaveAttribute(
      "href",
      "/settings/profile"
    );
    expect(screen.getByRole("button", { name: "Pick me up at home" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByRole("button", { name: "Offer my car" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pick me up at the common point" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Pick-up updated"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Leave car" })).toBeEnabled());

    actionMocks.leaveCarAction.mockResolvedValueOnce({ error: "Hangout not found" });
    fireEvent.click(screen.getByRole("button", { name: "Leave car" }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Hangout not found"));
    expect(actionMocks.leaveCarAction).toHaveBeenCalledWith("h1");
  });

  it("marks full cars, hides joining from drivers and people not going", () => {
    const full = { ...CAR, seats: 1 };
    const { rerender } = renderCarpools([full]);
    expect(screen.getByText("Full")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();

    rerender(
      <Carpools
        hangoutId="h1"
        cars={[{ ...CAR, driver: { ...alice, homeAddress: null }, commonPoint: null }]}
        viewer={viewer("c", { going: false })}
      />
    );
    expect(screen.getByText(/Starts from:/).parentElement).toHaveTextContent(
      "Starts from: no address yet"
    );
    expect(screen.getByText("Mark yourself Going to drive or ride.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();

    rerender(<Carpools hangoutId="h1" cars={[]} viewer={viewer("c")} />);
    expect(screen.getByText("No cars yet.")).toBeInTheDocument();
  });

  it("offers a car with a seat count", async () => {
    renderCarpools([]);

    fireEvent.change(screen.getByLabelText("Seats for riders"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Offer my car" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Car added"));
    expect(actionMocks.offerCarAction).toHaveBeenCalledWith("h1", 3);
  });

  it("lets the driver edit the car, remove riders and remove the car", async () => {
    renderCarpools([CAR], viewer("a"));

    expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Offer my car" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Alice's car" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Common point (optional)")).toHaveValue("Union Station");
    fireEvent.change(within(dialog).getByLabelText("Seats for riders"), { target: { value: "3" } });
    fireEvent.change(within(dialog).getByLabelText("Start address (optional)"), {
      target: { value: "5 Start Rd" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save car" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Car updated"));
    expect(actionMocks.updateCarAction).toHaveBeenCalledWith("car1", {
      seats: 3,
      startAddress: "5 Start Rd",
      commonPoint: "Union Station",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Remove Bob" }));
    await waitFor(() => expect(actionMocks.removeRiderAction).toHaveBeenCalledWith("car1", "b"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove Alice's car" })).toBeEnabled()
    );

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Remove Alice's car" }));
    expect(actionMocks.removeCarAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove Alice's car" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Car removed"));
    expect(actionMocks.removeCarAction).toHaveBeenCalledWith("car1");
  });

  it("gives admins the driver controls", () => {
    renderCarpools([CAR], viewer("z", { isAdmin: true }));
    expect(screen.getByRole("button", { name: "Edit Alice's car" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Bob" })).toBeInTheDocument();
  });

  it("shows routed times on the car and each rider, or why there are none", () => {
    const routed = {
      ...CAR,
      schedule: {
        there: {
          start: "2026-10-03T22:44:00Z",
          end: "2026-10-03T23:31:00Z",
          stops: { b: "2026-10-03T23:01:00Z" },
        },
        back: {
          start: "2026-10-04T02:30:00Z",
          end: "2026-10-04T03:07:00Z",
          stops: { b: "2026-10-04T02:42:00Z" },
        },
      },
    };
    const { rerender } = renderCarpools([routed]);
    expect(screen.getByText(/Drive:/).parentElement).toHaveTextContent(
      "Drive: leaves 6:44 PM, arrives 7:31 PM · back 10:30 PM – 11:07 PM"
    );
    expect(screen.getByRole("list", { name: "Riders" })).toHaveTextContent(
      "Bob · 9 Elm St · pick-up 7:01 PM · drop-off 10:42 PM"
    );

    rerender(
      <Carpools
        hangoutId="h1"
        cars={[{ ...CAR, schedule: { error: "Routing failed (429)" } }]}
        viewer={viewer("c")}
      />
    );
    expect(screen.getByText("No drive times: Routing failed (429)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recompute routes" })).not.toBeInTheDocument();
  });

  it("lets admins recompute routes", async () => {
    renderCarpools([CAR], viewer("z", { isAdmin: true }));

    fireEvent.click(screen.getByRole("button", { name: "Recompute routes" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Routes recomputed"));
    expect(actionMocks.recomputeRoutesAction).toHaveBeenCalledWith("h1");
  });
});
