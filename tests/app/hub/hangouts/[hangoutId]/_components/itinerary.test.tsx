import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Itinerary } from "@/app/hub/hangouts/[hangoutId]/_components/itinerary";
import type { HangoutStopItem } from "@/lib/hangouts";

const actionMocks = vi.hoisted(() => ({
  addStopAction: vi.fn(),
  updateStopAction: vi.fn(),
  deleteStopAction: vi.fn(),
  moveStopAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions/hangouts", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("@/components/ui/select", async () => import("../../../../../helpers/native-select"));

function stop(overrides: Partial<HangoutStopItem>): HangoutStopItem {
  return {
    id: "s1",
    type: "COMMUTE",
    title: "Drive downtown",
    address: null,
    lat: null,
    lon: null,
    durationMinutes: 30,
    arriveBy: null,
    notes: null,
    bring: null,
    cashCents: null,
    ...overrides,
  };
}

const STOPS = [
  stop({}),
  stop({
    id: "s2",
    type: "RESTAURANT",
    title: "Dinner",
    address: "290 Bremner Blvd",
    lat: 43.6,
    lon: -79.4,
    durationMinutes: 90,
    bring: "ID",
    cashCents: 2500,
    notes: "Booked under Nirav",
  }),
  stop({
    id: "s3",
    type: "LOCATION",
    title: "Board game cafe",
    address: "12 Elm St",
    durationMinutes: 180,
    arriveBy: "1T20:30",
  }),
];

describe("Itinerary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    for (const action of Object.values(actionMocks)) action.mockResolvedValue({ success: true });
  });

  it("chains times from the locked start, flags lateness and shows stop details", () => {
    render(<Itinerary hangoutId="h1" startSlot="2026-10-03T19:30" stops={STOPS} canEdit={false} />);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("7:30 PM Drive downtown");
    expect(items[0]).toHaveTextContent("Commute30 min");
    expect(items[1]).toHaveTextContent("8:00 PM Dinner");
    expect(items[1]).toHaveTextContent("Bring: ID · $25.00 cash each");
    expect(items[1]).toHaveTextContent("Booked under Nirav");
    expect(items[1]).not.toHaveTextContent("not located");
    expect(items[2]).toHaveTextContent("8:30 PM Board game cafe");
    expect(items[2]).toHaveTextContent("3 h · arrive-by");
    expect(items[2]).toHaveTextContent("Running 1 h late");
    expect(items[2]).toHaveTextContent("12 Elm St · not located on the map");
    expect(screen.getByText("Ends 11:30 PM")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows offsets and day numbers before lock-in, weekdays for later days after", () => {
    const { rerender } = render(
      <Itinerary
        hangoutId="h1"
        startSlot={null}
        stops={[stop({}), stop({ id: "s2", durationMinutes: 75, arriveBy: "2T01:00" })]}
        canEdit={false}
      />
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("+0:00 Drive downtown");
    expect(screen.getAllByRole("listitem")[1]).toHaveTextContent("Day 2, 1:00 AM");
    expect(screen.getByText("Ends Day 2, 2:15 AM")).toBeInTheDocument();

    rerender(
      <Itinerary
        hangoutId="h1"
        startSlot="2026-10-03T19:30"
        stops={[stop({ id: "s2", durationMinutes: 75, arriveBy: "2T01:00" })]}
        canEdit={false}
      />
    );
    expect(screen.getByText("Ends Sun 2:15 AM")).toBeInTheDocument();

    rerender(<Itinerary hangoutId="h1" startSlot={null} stops={[]} canEdit={false} />);
    expect(screen.getByText("No stops yet.")).toBeInTheDocument();
  });

  it("reorders and deletes stops for admins", async () => {
    render(<Itinerary hangoutId="h1" startSlot={null} stops={STOPS} canEdit />);

    expect(screen.getByRole("button", { name: "Move Drive downtown up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Board game cafe down" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Move Dinner up" }));
    await waitFor(() => expect(actionMocks.moveStopAction).toHaveBeenCalledWith("s2", -1));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move Dinner down" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "Move Dinner down" }));
    await waitFor(() => expect(actionMocks.moveStopAction).toHaveBeenCalledWith("s2", 1));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete Dinner" })).toBeEnabled()
    );

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete Dinner" }));
    expect(actionMocks.deleteStopAction).not.toHaveBeenCalled();

    actionMocks.deleteStopAction.mockResolvedValueOnce({ error: "Stop not found" });
    fireEvent.click(screen.getByRole("button", { name: "Delete Dinner" }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Stop not found"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete Dinner" })).toBeEnabled()
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Dinner" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Stop deleted"));
    expect(routerMocks.refresh).toHaveBeenCalled();
  });

  it("adds a stop with an arrive-by, cash and notes", async () => {
    render(<Itinerary hangoutId="h1" startSlot={null} stops={[]} canEdit />);

    fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Add stop" });
    expect(submit).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Dinner" } });
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "RESTAURANT" } });
    fireEvent.change(within(dialog).getByLabelText("Address (optional)"), {
      target: { value: "290 bremner" },
    });
    fireEvent.change(within(dialog).getByLabelText("Duration (min)"), { target: { value: "90" } });
    fireEvent.change(within(dialog).getByLabelText("Arrive-by day"), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText("Arrive-by time (EST)"), {
      target: { value: "01:30" },
    });
    fireEvent.change(within(dialog).getByLabelText("Bring (optional)"), {
      target: { value: "ID" },
    });
    fireEvent.change(within(dialog).getByLabelText("Cash each ($)"), {
      target: { value: "12.5" },
    });
    fireEvent.change(within(dialog).getByLabelText("Notes (optional)"), {
      target: { value: "Booked" },
    });
    fireEvent.click(submit);

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Stop added"));
    expect(actionMocks.addStopAction).toHaveBeenCalledWith("h1", {
      type: "RESTAURANT",
      title: "Dinner",
      address: "290 bremner",
      durationMinutes: 90,
      arriveBy: "2T01:30",
      notes: "Booked",
      bring: "ID",
      cashCents: 1250,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("edits a stop, keeping its values and clearing the arrive-by when the time is empty", async () => {
    render(<Itinerary hangoutId="h1" startSlot={null} stops={[STOPS[2]]} canEdit />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Board game cafe" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Arrive-by day")).toHaveValue(1);
    expect(within(dialog).getByLabelText("Arrive-by time (EST)")).toHaveValue("20:30");

    fireEvent.change(within(dialog).getByLabelText("Arrive-by time (EST)"), {
      target: { value: "" },
    });
    actionMocks.updateStopAction.mockResolvedValueOnce({ error: "Couldn't find that address." });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save stop" }));
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("Couldn't find that address.")
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save stop" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Stop updated"));
    expect(actionMocks.updateStopAction).toHaveBeenLastCalledWith("s3", {
      type: "LOCATION",
      title: "Board game cafe",
      address: "12 Elm St",
      durationMinutes: 180,
      arriveBy: null,
      notes: "",
      bring: "",
      cashCents: null,
    });
  });
  it("shows a forecast chip per stop with warnings and the Open-Meteo credit", () => {
    render(
      <Itinerary
        hangoutId="h1"
        startSlot="2026-10-03T19:30"
        stops={STOPS}
        canEdit={false}
        weather={[
          {
            status: "ok",
            temperature: -2,
            chance: 80,
            code: 73,
            warnings: ["Snow", "80% precipitation"],
          },
          { status: "ok", temperature: 11, chance: 5, code: 1, warnings: [] },
          { status: "none" },
        ]}
      />
    );

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Snow, -2°C · 80% precipitationSnow, 80% precipitation");
    expect(items[1]).toHaveTextContent("Partly cloudy, 11°C · 5% precipitation");
    expect(items[1]).not.toHaveTextContent("precipitationSnow");
    expect(items[2]).toHaveTextContent("No forecast (stop not on the map)");
    expect(screen.getByRole("link", { name: "Open-Meteo.com" })).toHaveAttribute(
      "href",
      "https://open-meteo.com/"
    );
  });

  it("explains forecasts that are too far out or unavailable", () => {
    render(
      <Itinerary
        hangoutId="h1"
        startSlot="2026-10-03T19:30"
        stops={STOPS.slice(0, 2)}
        canEdit={false}
        weather={[{ status: "far" }, { status: "unavailable" }]}
      />
    );

    expect(screen.getByText("Forecast not available yet")).toBeInTheDocument();
    expect(screen.getByText("Forecast unavailable")).toBeInTheDocument();
  });
});
