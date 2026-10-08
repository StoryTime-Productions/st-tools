import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TransitChoice } from "@/app/hub/hangouts/[hangoutId]/_components/transit-choice";
import type { HangoutTransitItem } from "@/lib/hangouts";

const actionMocks = vi.hoisted(() => ({
  setTransitAction: vi.fn(),
  clearTransitAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions/hangout-transit", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));

const row = (overrides: Partial<HangoutTransitItem> = {}): HangoutTransitItem => ({
  userId: "e",
  name: "Eve",
  direction: "PICKUP",
  startAddress: "5 Rue Start",
  startLat: 1,
  startLon: 2,
  destAddress: null,
  destLat: null,
  destLon: null,
  ...overrides,
});

const noCars = { PICKUP: null, DROPOFF: null };
type Viewer = { id: string; going: boolean; driving: boolean; homeAddress?: string | null };
const me: Viewer = { id: "m", going: true, driving: false, homeAddress: "1 Main St" };

function renderChoice(
  transit: HangoutTransitItem[],
  viewer: Viewer = me,
  carsFor: Record<"PICKUP" | "DROPOFF", string | null> = noCars
) {
  return render(
    <TransitChoice hangoutId="h1" transit={transit} viewer={viewer} carsFor={carsFor} />
  );
}

describe("TransitChoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const action of Object.values(actionMocks)) action.mockResolvedValue({ success: true });
  });

  it("shows everyone's choices with where they start and end (R5)", () => {
    renderChoice(
      [row(), row({ userId: "f", name: "Finn", direction: "DROPOFF", destAddress: "7 Home Rd" })],
      { ...me, going: false }
    );

    const list = screen.getByRole("list", { name: "Taking public transit" });
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent(
      "Eve · getting there · 5 Rue Start"
    );
    expect(within(list).getAllByRole("listitem")[1]).toHaveTextContent(
      "Finn · getting home · 5 Rue Start → 7 Home Rd"
    );
    // Not going: look, don't touch.
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("renders nothing for someone who can't choose when nobody takes transit", () => {
    const { container } = renderChoice([], { ...me, going: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("says nobody is taking transit but still offers the forms to a Going attendee", () => {
    renderChoice([]);
    expect(screen.getByText("Nobody is taking public transit.")).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: "Getting there by public transit" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: "Getting home by public transit" })
    ).toBeInTheDocument();
  });

  it("hides the forms from drivers", () => {
    renderChoice([], { ...me, driving: true });
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("prefills start from the profile home, and destination too for getting home (R4)", async () => {
    renderChoice([]);

    const there = screen.getByRole("form", { name: "Getting there by public transit" });
    expect(within(there).getByLabelText("Starting from")).toHaveValue("1 Main St");
    expect(within(there).queryByLabelText("Going to")).not.toBeInTheDocument();
    fireEvent.change(within(there).getByLabelText("Starting from"), {
      target: { value: "5 Rue Start" },
    });
    fireEvent.click(within(there).getByRole("button", { name: "Take public transit" }));
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith("Marked as public transit")
    );
    expect(actionMocks.setTransitAction).toHaveBeenCalledWith("h1", "PICKUP", {
      start: "5 Rue Start",
      destination: "1 Main St",
    });
    expect(routerMocks.refresh).toHaveBeenCalled();

    const home = screen.getByRole("form", { name: "Getting home by public transit" });
    expect(within(home).getByLabelText("Starting from")).toHaveValue("1 Main St");
    expect(within(home).getByLabelText("Going to")).toHaveValue("1 Main St");
    fireEvent.change(within(home).getByLabelText("Going to"), { target: { value: "9 Elm St" } });
    fireEvent.click(within(home).getByRole("button", { name: "Take public transit" }));
    await waitFor(() =>
      expect(actionMocks.setTransitAction).toHaveBeenCalledWith("h1", "DROPOFF", {
        start: "1 Main St",
        destination: "9 Elm St",
      })
    );
  });

  it("needs an address before it can be saved", () => {
    renderChoice([], { ...me, homeAddress: null });

    const home = screen.getByRole("form", { name: "Getting home by public transit" });
    const save = within(home).getByRole("button", { name: "Take public transit" });
    expect(save).toBeDisabled();
    fireEvent.change(within(home).getByLabelText("Starting from"), { target: { value: "Bar" } });
    expect(save).toBeDisabled();
    fireEvent.change(within(home).getByLabelText("Going to"), { target: { value: "Home" } });
    expect(save).toBeEnabled();
  });

  it("shows the server's refusal", async () => {
    actionMocks.setTransitAction.mockResolvedValueOnce({ error: "Couldn't find that address" });
    renderChoice([]);

    fireEvent.click(
      within(screen.getByRole("form", { name: "Getting there by public transit" })).getByRole(
        "button",
        { name: "Take public transit" }
      )
    );

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("Couldn't find that address")
    );
  });

  it("warns that choosing transit leaves the car, only for a trip on one", () => {
    renderChoice([], me, { PICKUP: "Alice", DROPOFF: null });

    expect(
      screen.getByText("This takes you off Alice's car for getting there.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/for getting home/)).not.toBeInTheDocument();
  });

  it("edits or clears an existing choice", async () => {
    renderChoice([row({ userId: "m", name: "Me", startAddress: "5 Rue Start" })], me, {
      PICKUP: "Alice",
      DROPOFF: null,
    });

    const there = screen.getByRole("form", { name: "Getting there by public transit" });
    expect(there).toHaveTextContent("you're taking public transit");
    expect(within(there).getByLabelText("Starting from")).toHaveValue("5 Rue Start");
    // Already on transit, so no warning about leaving the car again.
    expect(screen.queryByText(/takes you off/)).not.toBeInTheDocument();

    fireEvent.click(within(there).getByRole("button", { name: "Update" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Transit updated"));

    fireEvent.click(within(there).getByRole("button", { name: "Not taking transit" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Transit choice removed"));
    expect(actionMocks.clearTransitAction).toHaveBeenCalledWith("h1", "PICKUP");
    expect(
      within(screen.getByRole("form", { name: "Getting home by public transit" })).queryByRole(
        "button",
        { name: "Not taking transit" }
      )
    ).not.toBeInTheDocument();
  });
});
