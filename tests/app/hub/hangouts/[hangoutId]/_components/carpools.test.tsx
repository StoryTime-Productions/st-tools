import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Carpools } from "@/app/hub/hangouts/[hangoutId]/_components/carpools";
import type { CarPassenger, HangoutCarItem } from "@/lib/hangouts";

const actionMocks = vi.hoisted(() => ({
  offerCarAction: vi.fn(),
  recomputeRoutesAction: vi.fn(),
  updateCarAction: vi.fn(),
  removeCarAction: vi.fn(),
  unassignPassengerAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions/carpools", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));

const alice = {
  userId: "a",
  name: "Alice",
  homeAddress: "1 Main St",
  homeLat: null,
  homeLon: null,
};
const BOB: CarPassenger = {
  userId: "b",
  name: "Bob",
  homeAddress: "9 Elm St",
  homeLat: null,
  homeLon: null,
  pointKind: "HOME",
  viaUserId: null,
  commonLabel: null,
  commonLat: null,
  commonLon: null,
};
const CAR: HangoutCarItem = {
  id: "car1",
  seats: 2,
  startAddress: null,
  startLat: null,
  startLon: null,
  commonPoint: "Union Station",
  commonLat: null,
  commonLon: null,
  schedule: null,
  driver: alice,
  riders: [],
  pickups: [BOB],
  dropoffs: [BOB],
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

  it("shows cars, start points and both lists, with no way to join (R1, AC4)", () => {
    renderCarpools([CAR]);

    const car = screen.getByRole("listitem", { name: "Alice's car" });
    expect(car).toHaveTextContent("Alice's car · 1/2 seats");
    expect(car).toHaveTextContent("Starts from: 1 Main St (home)");
    expect(within(car).getByRole("list", { name: "Pick up" })).toHaveTextContent(
      "Pick up: Bob · 9 Elm St"
    );
    expect(within(car).getByRole("list", { name: "Drop off" })).toHaveTextContent(
      "Drop off: Bob · 9 Elm St"
    );
    expect(within(car).queryByRole("button", { name: /join|leave/i })).not.toBeInTheDocument();
    expect(within(car).queryByRole("button", { name: /^Remove Bob/ })).not.toBeInTheDocument();
    expect(within(car).queryByRole("button", { name: "Edit Alice's car" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Offer my car" })).toBeInTheDocument();
  });

  it("names each point: a typed common point, another rider's home, or no address", () => {
    const common: CarPassenger = {
      ...BOB,
      userId: "d",
      name: "Dan",
      pointKind: "COMMON",
      commonLabel: "Union Station",
    };
    const unlabeled: CarPassenger = { ...common, userId: "e", name: "Eve", commonLabel: null };
    const via: CarPassenger = { ...BOB, userId: "f", name: "Finn", pointKind: "RIDER_HOME" };
    const noHome: CarPassenger = { ...BOB, userId: "g", name: "Gus", homeAddress: null };
    renderCarpools([{ ...CAR, seats: 4, pickups: [common, unlabeled, via, noHome], dropoffs: [] }]);

    const pickups = screen.getByRole("list", { name: "Pick up" });
    expect(within(pickups).getByText(/Dan/).parentElement).toHaveTextContent("Dan · Union Station");
    expect(pickups).toHaveTextContent("Eve · common point");
    expect(pickups).toHaveTextContent("Finn · another rider's home");
    expect(pickups).toHaveTextContent("Gus · no home address");
    expect(screen.queryByRole("list", { name: "Drop off" })).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Alice's car" })).toHaveTextContent("4/4 seats");
  });

  it("hides the offer from people not going and shows an empty state", () => {
    const { rerender } = renderCarpools([
      { ...CAR, driver: { ...alice, homeAddress: null }, pickups: [], dropoffs: [] },
    ]);
    expect(screen.getByText(/Starts from:/).parentElement).toHaveTextContent(
      "Starts from: no address yet"
    );

    rerender(<Carpools hangoutId="h1" cars={[CAR]} viewer={viewer("c", { going: false })} />);
    expect(screen.getByText("Mark yourself Going to drive or ride.")).toBeInTheDocument();

    rerender(<Carpools hangoutId="h1" cars={[]} viewer={viewer("c")} />);
    expect(screen.getByText("No cars yet.")).toBeInTheDocument();
  });

  it("offers a car with a seat count", async () => {
    renderCarpools([]);

    fireEvent.change(screen.getByLabelText("Seats for riders"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Offer my car" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Car added"));
    expect(actionMocks.offerCarAction).toHaveBeenCalledWith("h1", 3, undefined);
    // Without a home address on file nothing asks for one unless the page says so.
    expect(screen.queryByLabelText("Your start address")).not.toBeInTheDocument();
  });

  it("asks for a start address next to the seats only when the viewer has no home address (AC1, AC2)", async () => {
    const { unmount } = renderCarpools([], viewer("c", { homeAddress: "1 Main St" }));
    expect(screen.queryByLabelText("Your start address")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Offer my car" })).toBeEnabled();
    unmount();

    renderCarpools([], viewer("c", { homeAddress: null }));
    const offer = screen.getByRole("button", { name: "Offer my car" });
    expect(offer).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Your start address"), {
      target: { value: "39 Rue Fountain" },
    });
    expect(offer).toBeEnabled();
    fireEvent.click(offer);
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Car added"));
    expect(actionMocks.offerCarAction).toHaveBeenCalledWith("h1", 4, "39 Rue Fountain");

    // The same error the profile card shows is surfaced and nothing is added (AC3).
    actionMocks.offerCarAction.mockResolvedValueOnce({
      error: "Couldn't find that address. Check it and try again.",
    });
    fireEvent.click(offer);
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        "Couldn't find that address. Check it and try again."
      )
    );
  });

  it("lets the driver edit the car, take riders off each list and remove the car", async () => {
    renderCarpools([CAR], viewer("a"));

    expect(screen.queryByRole("button", { name: "Offer my car" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Alice's car" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText(/common point/i)).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Seats for riders"), { target: { value: "3" } });
    fireEvent.change(within(dialog).getByLabelText("Start address (optional)"), {
      target: { value: "5 Start Rd" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save car" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Car updated"));
    expect(actionMocks.updateCarAction).toHaveBeenCalledWith("car1", {
      seats: 3,
      startAddress: "5 Start Rd",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Remove Bob from pick up" }));
    await waitFor(() =>
      expect(actionMocks.unassignPassengerAction).toHaveBeenCalledWith("car1", "b", "PICKUP")
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove Bob from drop off" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Bob from drop off" }));
    await waitFor(() =>
      expect(actionMocks.unassignPassengerAction).toHaveBeenCalledWith("car1", "b", "DROPOFF")
    );
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
    expect(screen.getByRole("button", { name: "Remove Bob from pick up" })).toBeInTheDocument();
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
    expect(screen.getByRole("list", { name: "Pick up" })).toHaveTextContent(
      "Pick up: Bob · 9 Elm St · 7:01 PM"
    );
    expect(screen.getByRole("list", { name: "Drop off" })).toHaveTextContent(
      "Drop off: Bob · 9 Elm St · 10:42 PM"
    );

    rerender(
      <Carpools
        hangoutId="h1"
        cars={[{ ...CAR, schedule: { error: "Routing failed (429)" } }]}
        viewer={viewer("c")}
      />
    );
    expect(
      screen.getByText(
        "Routes could not be computed: Routing failed (429). Ask an admin to recompute."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recompute routes" })).not.toBeInTheDocument();
  });

  it("treats schedules typed in before times were computed as uncomputed", () => {
    const trip = { start: "2026-10-03T23:01:00.000Z", end: "2026-10-03T23:31:00.000Z", stops: {} };
    render(
      <Carpools
        hangoutId="h1"
        cars={[{ ...CAR, schedule: { there: trip, back: trip, manual: true } }]}
        viewer={viewer("z", { isAdmin: true })}
      />
    );
    expect(screen.getByRole("listitem", { name: "Alice's car" })).toHaveTextContent(
      "Routes could not be computed: these times were typed in before they were computed. Try Recompute routes."
    );
    expect(screen.queryByText(/Drive:/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/drive times/i)).not.toBeInTheDocument();
  });

  it("lets admins recompute routes", async () => {
    renderCarpools([CAR], viewer("z", { isAdmin: true }));

    fireEvent.click(screen.getByRole("button", { name: "Recompute routes" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Routes recomputed"));
    expect(actionMocks.recomputeRoutesAction).toHaveBeenCalledWith("h1");
  });
  describe("weather", () => {
    const delayed = (reason: string, there: number, back: number): HangoutCarItem => ({
      ...CAR,
      schedule: {
        there: {
          start: "2026-10-03T22:55:00.000Z",
          end: "2026-10-03T23:31:00.000Z",
          stops: { b: "2026-10-03T23:10:00.000Z" },
          delayMinutes: there,
          reason,
        },
        back: {
          start: "2026-10-04T02:30:00.000Z",
          end: "2026-10-04T03:10:00.000Z",
          stops: { b: "2026-10-04T02:50:00.000Z" },
          delayMinutes: back,
          reason,
        },
      },
    });
    const listing = () => screen.getByRole("listitem", { name: "Alice's car" });

    it("says how many minutes the forecast added and why, for both trips", () => {
      render(
        <Carpools
          hangoutId="h1"
          cars={[delayed("snow", 6, 12)]}
          viewer={viewer("c")}
          weather={{ warnings: ["Snow"], checked: true }}
        />
      );

      expect(screen.getByRole("status")).toHaveTextContent(
        "Weather warning: Snow. Drive times include extra time for the conditions."
      );
      expect(listing()).toHaveTextContent(
        "leaves 6:55 PM (+6 min for snow), arrives 7:31 PM · back 10:30 PM – 11:10 PM (+12 min for snow)"
      );
    });

    it("shows no note or banner when the weather costs nothing, but still credits Open-Meteo", () => {
      render(
        <Carpools
          hangoutId="h1"
          cars={[delayed("rain", 0, 0)]}
          viewer={viewer("c")}
          weather={{ warnings: [], checked: true }}
        />
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(listing()).not.toHaveTextContent("min for");
      expect(screen.queryByLabelText("Weather buffer (minutes)")).not.toBeInTheDocument();
      expect(screen.getByText(/Open-Meteo\.com/)).toBeInTheDocument();
    });
  });
});
