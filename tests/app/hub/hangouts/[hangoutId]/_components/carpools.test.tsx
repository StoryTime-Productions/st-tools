import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Carpools, RecomputeRoutes } from "@/app/hub/hangouts/[hangoutId]/_components/carpools";
import type { CarPassenger, HangoutAttendeeItem, HangoutCarItem } from "@/lib/hangouts";

const actionMocks = vi.hoisted(() => ({
  offerCarAction: vi.fn(),
  recomputeRoutesAction: vi.fn(),
  updateCarAction: vi.fn(),
  removeCarAction: vi.fn(),
  unassignPassengerAction: vi.fn(),
  assignPassengerAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions/carpools", () => actionMocks);
vi.mock("@/app/actions/hangout-transit", () => ({
  setTransitAction: vi.fn(),
  clearTransitAction: vi.fn(),
}));
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
    expect(car).toHaveTextContent("Alice's car");
    expect(car).toHaveTextContent("1/2 seats");
    expect(car).toHaveTextContent("Start: 1 Main St (home)");
    expect(car).toHaveTextContent("Hangout");
    expect(within(car).getByRole("list", { name: "Pick up" })).toHaveTextContent(/Bob.*9 Elm St/);
    expect(within(car).getByRole("list", { name: "Drop off" })).toHaveTextContent(/Bob.*9 Elm St/);
    expect(within(car).queryByRole("button", { name: /^Add / })).not.toBeInTheDocument();
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
    expect(within(pickups).getByText("Dan").closest("li")).toHaveTextContent(/Dan.*Union Station/);
    expect(pickups).toHaveTextContent(/Eve.*common point/);
    expect(pickups).toHaveTextContent(/Finn.*another rider's home/);
    expect(pickups).toHaveTextContent(/Gus.*no home address/);
    expect(screen.queryByRole("list", { name: "Drop off" })).not.toBeInTheDocument();
    expect(screen.getByText("No one assigned")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Alice's car" })).toHaveTextContent("4/4 seats");
  });

  it("hides the offer from people not going and shows an empty state", () => {
    const { rerender } = renderCarpools([
      { ...CAR, driver: { ...alice, homeAddress: null }, pickups: [], dropoffs: [] },
    ]);
    expect(screen.getByText(/Start:/).parentElement).toHaveTextContent("Start: no address yet");

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

  it("steps the seat count within 1 to 12", () => {
    renderCarpools([]);
    const seats = screen.getByLabelText("Seats for riders");
    expect(seats).toHaveValue(4);

    fireEvent.click(screen.getByRole("button", { name: "More seats" }));
    expect(seats).toHaveValue(5);
    fireEvent.click(screen.getByRole("button", { name: "Fewer seats" }));
    fireEvent.click(screen.getByRole("button", { name: "Fewer seats" }));
    expect(seats).toHaveValue(3);

    fireEvent.change(seats, { target: { value: "1" } });
    expect(screen.getByRole("button", { name: "Fewer seats" })).toBeDisabled();
    fireEvent.change(seats, { target: { value: "12" } });
    expect(screen.getByRole("button", { name: "More seats" })).toBeDisabled();
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
    const car = screen.getByRole("listitem", { name: "Alice's car" });
    expect(car).toHaveTextContent("Leaves 6:44 PM");
    expect(car).toHaveTextContent("Arrives 7:31 PM");
    expect(car).toHaveTextContent("Back 10:30 PM – 11:07 PM");
    expect(car).toHaveTextContent("Hangout · arrive 7:31 PM");
    expect(screen.getByRole("list", { name: "Pick up" })).toHaveTextContent(
      /Bob.*9 Elm St · 7:01 PM/
    );
    expect(screen.getByRole("list", { name: "Drop off" })).toHaveTextContent(
      /Bob.*9 Elm St · 10:42 PM/
    );

    rerender(
      <Carpools
        hangoutId="h1"
        cars={[{ ...CAR, schedule: { error: "Routing failed (429)" } }]}
        viewer={viewer("c")}
      />
    );
    expect(
      screen.getByText("Route not computed: Routing failed (429). Ask an admin to recompute.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Leaves/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recompute routes" })).not.toBeInTheDocument();
  });

  it("shows no route note for a car with nobody to route, and an empty timeline in full", () => {
    renderCarpools([{ ...CAR, pickups: [], dropoffs: [], schedule: {} }]);
    expect(screen.queryByText(/^Leaves/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Route not computed/)).not.toBeInTheDocument();
    expect(screen.getAllByText("No one assigned")).toHaveLength(2);
    expect(screen.getByText("Hangout")).toBeInTheDocument();
  });

  it("puts stops in route order and gives riders met at the same place one stop", () => {
    const at = (userId: string, name: string): CarPassenger => ({
      ...BOB,
      userId,
      name,
      pointKind: "COMMON",
      commonLabel: "Union Station",
    });
    const late: CarPassenger = { ...BOB, userId: "l", name: "Late" };
    const early: CarPassenger = { ...BOB, userId: "y", name: "Early" };
    renderCarpools([
      {
        ...CAR,
        seats: 4,
        pickups: [late, at("d", "Dan"), at("e", "Eve"), early],
        dropoffs: [],
        schedule: {
          there: {
            start: "2026-10-03T22:00:00Z",
            end: "2026-10-03T23:31:00Z",
            stops: {
              y: "2026-10-03T22:10:00Z",
              d: "2026-10-03T22:30:00Z",
              e: "2026-10-03T22:30:00Z",
              l: "2026-10-03T23:00:00Z",
            },
          },
        },
      },
    ]);

    const stops = within(screen.getByRole("list", { name: "Pick up" })).getAllByRole("listitem");
    expect(stops).toHaveLength(3);
    expect(stops[0]).toHaveTextContent("Early");
    expect(stops[1]).toHaveTextContent("Dan");
    expect(stops[1]).toHaveTextContent("Eve");
    expect(stops[1]).toHaveTextContent("Union Station · 6:30 PM");
    expect(stops[2]).toHaveTextContent("Late");
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
      "Route not computed. Try Recompute routes."
    );
    expect(screen.queryByText(/^Leaves/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/drive times/i)).not.toBeInTheDocument();
  });

  it("lets admins recompute routes", async () => {
    render(<RecomputeRoutes hangoutId="h1" />);

    fireEvent.click(screen.getByRole("button", { name: "Recompute routes" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Routes recomputed"));
    expect(actionMocks.recomputeRoutesAction).toHaveBeenCalledWith("h1");
  });
  describe("assigning (R1-R3, AC1, AC7)", () => {
    const attendee = (
      userId: string,
      name: string,
      needs: { pickup: boolean; dropoff: boolean }
    ): HangoutAttendeeItem => ({ userId, name, status: "GOING", needsRide: needs });
    const both = { pickup: true, dropoff: true };
    const attendees = [
      attendee("a", "Alice", { pickup: false, dropoff: false }),
      attendee("e", "Eve", both),
      attendee("f", "Finn", { pickup: false, dropoff: true }),
    ];
    const empty = { ...CAR, seats: 3, pickups: [], dropoffs: [] };
    const render_ = (cars: HangoutCarItem[], who = viewer("a"), people = attendees) =>
      render(<Carpools hangoutId="h1" cars={cars} attendees={people} viewer={who} />);
    const openForm = (noun: "pick-up" | "drop-off") =>
      fireEvent.click(screen.getByRole("button", { name: `Add ${noun}` }));

    it("offers only people still needing a ride in that direction", () => {
      render_([empty]);
      openForm("pick-up");
      openForm("drop-off");

      const there = screen.getByRole("form", { name: "Add to pick up" });
      expect(
        within(there)
          .getAllByRole("option")
          .map((o) => o.textContent)
      ).toEqual(["Eve", "Their home", "A common point"]);
      const home = screen.getByRole("form", { name: "Add to drop off" });
      expect(within(home).getByLabelText("Drop off")).toHaveDisplayValue("Eve");
      expect(
        within(home)
          .getAllByRole("option")
          .slice(0, 2)
          .map((o) => o.textContent)
      ).toEqual(["Eve", "Finn"]);
    });

    it("adds someone at their home, then clears the choice", async () => {
      render_([empty]);
      openForm("pick-up");

      const form = screen.getByRole("form", { name: "Add to pick up" });
      fireEvent.click(within(form).getByRole("button", { name: "Add" }));

      await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Added to pick up"));
      await waitFor(() =>
        expect(screen.queryByRole("form", { name: "Add to pick up" })).not.toBeInTheDocument()
      );
      expect(actionMocks.assignPassengerAction).toHaveBeenCalledWith("car1", "e", "PICKUP", {
        kind: "HOME",
      });
      expect(routerMocks.refresh).toHaveBeenCalled();
    });

    it("adds a typed common point, needing an address first", async () => {
      render_([empty]);
      openForm("drop-off");

      const form = screen.getByRole("form", { name: "Add to drop off" });
      fireEvent.change(within(form).getByLabelText("Drop off"), { target: { value: "f" } });
      fireEvent.change(within(form).getByLabelText("Meet at"), { target: { value: "COMMON" } });
      const add = within(form).getByRole("button", { name: "Add" });
      expect(add).toBeDisabled();

      fireEvent.change(within(form).getByLabelText("Meeting address"), {
        target: { value: "Union Station" },
      });
      fireEvent.click(add);

      await waitFor(() =>
        expect(actionMocks.assignPassengerAction).toHaveBeenCalledWith("car1", "f", "DROPOFF", {
          kind: "COMMON",
          address: "Union Station",
        })
      );
    });

    it("offers another rider's home only when someone with a home is on the list", () => {
      const noHome: CarPassenger = { ...BOB, userId: "n", name: "Nia", homeLat: null };
      render_([{ ...empty, pickups: [noHome] }]);
      openForm("pick-up");

      expect(
        screen.queryByRole("option", { name: "Another rider's home" })
      ).not.toBeInTheDocument();
    });

    it("lets the driver pick a listed rider's home", async () => {
      const carol: CarPassenger = { ...BOB, userId: "c", name: "Cara", homeLat: 4, homeLon: 4 };
      render_([{ ...empty, pickups: [carol] }]);
      openForm("pick-up");

      const form = screen.getByRole("form", { name: "Add to pick up" });
      fireEvent.change(within(form).getByLabelText("Meet at"), {
        target: { value: "RIDER_HOME" },
      });
      expect(within(form).getByLabelText("Whose home")).toHaveDisplayValue("Cara");
      fireEvent.change(within(form).getByLabelText("Whose home"), { target: { value: "c" } });
      fireEvent.click(within(form).getByRole("button", { name: "Add" }));

      await waitFor(() =>
        expect(actionMocks.assignPassengerAction).toHaveBeenCalledWith("car1", "e", "PICKUP", {
          kind: "RIDER_HOME",
          viaUserId: "c",
        })
      );
    });

    it("shows a server refusal and keeps the form", async () => {
      actionMocks.assignPassengerAction.mockResolvedValueOnce({ error: "That car is full" });
      render_([empty]);
      openForm("pick-up");

      fireEvent.click(
        within(screen.getByRole("form", { name: "Add to pick up" })).getByRole("button", {
          name: "Add",
        })
      );

      await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("That car is full"));
      expect(screen.getByRole("form", { name: "Add to pick up" })).toBeInTheDocument();
    });

    it("says a full list is full instead of offering to add", () => {
      const full = {
        ...CAR,
        seats: 1,
        pickups: [BOB],
        dropoffs: [],
      };
      render_([full]);

      expect(screen.getByText("Full: no seat left to add to pick up.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add pick-up" })).toBeDisabled();
      expect(screen.queryByRole("form", { name: "Add to pick up" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add drop-off" })).toBeEnabled();
      expect(screen.queryByRole("form", { name: "Add to drop off" })).not.toBeInTheDocument();
      openForm("drop-off");
      expect(screen.getByRole("form", { name: "Add to drop off" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("form", { name: "Add to drop off" })).not.toBeInTheDocument();
    });

    it("shows no add form when nobody needs a ride or you can't manage the car", () => {
      const { unmount } = render_([empty], viewer("a"), [attendees[0]]);
      expect(screen.queryByRole("button", { name: /^Add / })).not.toBeInTheDocument();
      unmount();

      render_([empty], viewer("c"));
      expect(screen.queryByRole("button", { name: /^Add / })).not.toBeInTheDocument();
    });

    it("tells drivers and admins who needs a ride, and nobody else", () => {
      const { unmount } = render_([empty], viewer("a"));
      const card = screen.getByText("Needs a ride").parentElement;
      expect(card).toHaveTextContent("Getting thereEve");
      expect(card).toHaveTextContent("Getting homeEveFinn");
      unmount();

      const admin = render_([empty], viewer("z", { isAdmin: true }));
      expect(screen.getByText("Needs a ride")).toBeInTheDocument();
      admin.unmount();

      render_([empty], viewer("c"));
      expect(screen.queryByText(/Needs a ride/)).not.toBeInTheDocument();
    });

    it("hides the chips when nobody needs a ride in a direction", () => {
      render_([empty], viewer("a"), [attendees[0]]);
      expect(screen.queryByText(/Needs a ride/)).not.toBeInTheDocument();
    });
  });

  describe("public transit (R4, R5)", () => {
    const eve = {
      userId: "e",
      name: "Eve",
      direction: "DROPOFF" as const,
      startAddress: "Bar",
      startLat: 1,
      startLon: 2,
      destAddress: "7 Home Rd",
      destLat: 3,
      destLon: 4,
    };
    const rideWith = { ...CAR, pickups: [{ ...BOB, userId: "c", name: "Cara" }], dropoffs: [] };

    it("lists everyone's transit choices on the card", () => {
      render(<Carpools hangoutId="h1" cars={[CAR]} transit={[eve]} viewer={viewer("z")} />);
      const list = screen.getByRole("list", { name: "Taking public transit, getting home" });
      expect(list).toHaveTextContent("Eve");
      expect(list).toHaveTextContent("From Bar");
      expect(list).toHaveTextContent("To 7 Home Rd");
    });

    it("warns a rider that transit takes them off the car for that trip only", () => {
      render(<Carpools hangoutId="h1" cars={[rideWith]} viewer={viewer("c")} />);
      expect(
        screen.getByText("This takes you off Alice's car for getting there.")
      ).toBeInTheDocument();
      expect(screen.queryByText(/for getting home/)).not.toBeInTheDocument();
    });

    it("warns for a drop-off car and leaves drivers without the transit forms", () => {
      const dropWith = { ...CAR, pickups: [], dropoffs: [{ ...BOB, userId: "c", name: "Cara" }] };
      const { unmount } = render(
        <Carpools hangoutId="h1" cars={[dropWith]} viewer={viewer("c")} />
      );
      expect(
        screen.getByText("This takes you off Alice's car for getting home.")
      ).toBeInTheDocument();
      unmount();

      render(<Carpools hangoutId="h1" cars={[CAR]} viewer={viewer("a")} />);
      expect(screen.queryByRole("form", { name: /public transit/ })).not.toBeInTheDocument();
    });
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
      expect(listing()).toHaveTextContent("Leaves 6:55 PM (+6 min for snow)");
      expect(listing()).toHaveTextContent("Arrives 7:31 PM");
      expect(listing()).toHaveTextContent("Back 10:30 PM – 11:10 PM (+12 min for snow)");
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
