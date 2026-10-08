import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Costs, type CostViewer } from "@/app/hub/hangouts/[hangoutId]/_components/costs";
import type { HangoutCostItem } from "@/lib/hangouts";

const costMocks = vi.hoisted(() => ({
  addCostAction: vi.fn(),
  updateCostAction: vi.fn(),
  deleteCostAction: vi.fn(),
}));
const payMocks = vi.hoisted(() => ({
  markSentAction: vi.fn(),
  undoSentAction: vi.fn(),
  confirmPaymentAction: vi.fn(),
  revertConfirmationAction: vi.fn(),
  markRefundedAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions/costs", () => costMocks);
vi.mock("@/app/actions/payments", () => payMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("@/components/ui/select", async () => import("../../../../../helpers/native-select"));

const MEMBERS = [
  { id: "a", name: "Alice" },
  { id: "b", name: "Bob" },
];

function share(
  userId: string,
  name: string,
  overrides: Partial<HangoutCostItem["shares"][number]> = {}
): HangoutCostItem["shares"][number] {
  return {
    userId,
    name,
    amountCents: 2000,
    paidCents: 0,
    status: "UNPAID",
    method: null,
    ...overrides,
  };
}

function item(overrides: Partial<HangoutCostItem> = {}): HangoutCostItem {
  return {
    id: "c1",
    title: "Dinner",
    amountCents: 6000,
    notes: "Split three ways",
    collector: { userId: "a", name: "Alice" },
    participants: [
      { userId: "a", name: "Alice" },
      { userId: "b", name: "Bob" },
      { userId: "c", name: "Cy" },
    ],
    shares: [],
    ...overrides,
  };
}

const viewer = (id: string, status: CostViewer["status"] = "GOING", isAdmin = false) => ({
  id,
  isAdmin,
  status,
});

function renderCosts(
  items: HangoutCostItem[],
  options: { who?: CostViewer; scheduled?: boolean; goingIds?: string[]; canEdit?: boolean } = {}
) {
  return render(
    <Costs
      hangoutId="h1"
      items={items}
      viewer={options.who ?? viewer("c")}
      members={MEMBERS}
      scheduled={options.scheduled ?? true}
      goingIds={options.goingIds ?? ["a"]}
      canEdit={options.canEdit ?? false}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of [...Object.values(costMocks), ...Object.values(payMocks)])
    mock.mockResolvedValue({ success: true });
});

describe("Costs", () => {
  it("shows an empty state and estimates before scheduling", () => {
    const empty = renderCosts([], { scheduled: false });
    expect(screen.getByText("No costs yet.")).toBeInTheDocument();
    empty.unmount();

    const some = renderCosts([item()], { scheduled: false });
    expect(screen.getByText(/about \$20\.00 each/)).toBeInTheDocument();
    expect(screen.getByText(/Estimates split each item between its group/)).toBeInTheDocument();
    expect(screen.getByText("Split between: Alice, Bob, Cy")).toBeInTheDocument();
    some.unmount();

    const single = renderCosts([item({ participants: [{ userId: "c", name: "Cy" }] })], {
      scheduled: false,
    });
    expect(screen.getByText(/about \$60\.00 each/)).toBeInTheDocument();
    single.unmount();

    renderCosts([item({ participants: [] })], {
      scheduled: false,
      who: viewer("z", "GOING", true),
    });
    expect(screen.getByText("Split between: nobody yet")).toBeInTheDocument();
    expect(screen.queryByText(/about \$.* each/)).not.toBeInTheDocument();
  });

  it("shows an item only to its group, its collector and admins (AC6)", () => {
    const items = [item({ participants: [{ userId: "b", name: "Bob" }] })];

    const outsider = renderCosts(items, { who: viewer("c") });
    expect(screen.queryByText(/Dinner/)).not.toBeInTheDocument();
    expect(screen.getByText("No costs yet.")).toBeInTheDocument();
    outsider.unmount();

    const member = renderCosts(items, { who: viewer("b") });
    expect(screen.getByText(/Dinner/)).toBeInTheDocument();
    member.unmount();

    const collector = renderCosts(items, { who: viewer("a") });
    expect(screen.getByText(/Dinner/)).toBeInTheDocument();
    collector.unmount();

    renderCosts(items, { who: viewer("z", "GOING", true) });
    expect(screen.getByText(/Dinner/)).toBeInTheDocument();
  });

  it("only tells a Maybe member what they would owe when they are in the group", () => {
    renderCosts([item({ participants: [{ userId: "b", name: "Bob" }] })], {
      who: viewer("a", "MAYBE"),
    });
    expect(screen.queryByText(/Would owe/)).not.toBeInTheDocument();
  });

  it("tells a Maybe member what they would owe", () => {
    renderCosts([item()], { who: viewer("c", "MAYBE") });
    expect(screen.getByText("Would owe about $20.00 if Going.")).toBeInTheDocument();
  });

  it("lets a member mark their own share sent by either method and undo it", async () => {
    const view = renderCosts([item({ shares: [share("c", "Cy")] })]);
    expect(screen.getByText("Cy (you) · $20.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sent by e-Transfer" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Marked sent"));
    expect(payMocks.markSentAction).toHaveBeenCalledWith("c1", "E_TRANSFER");
    fireEvent.click(screen.getByRole("button", { name: "Sent by cash" }));
    await waitFor(() => expect(payMocks.markSentAction).toHaveBeenCalledWith("c1", "CASH"));
    expect(routerMocks.refresh).toHaveBeenCalled();
    view.unmount();

    renderCosts([item({ shares: [share("c", "Cy", { status: "SENT", method: "CASH" })] })]);
    expect(screen.getByText(/via cash/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo sent" }));
    await waitFor(() => expect(payMocks.undoSentAction).toHaveBeenCalledWith("c1"));
  });

  it("shows other members' shares without actions", () => {
    renderCosts([item({ shares: [share("b", "Bob", { status: "SENT", method: "E_TRANSFER" })] })]);
    expect(screen.getByText("Bob · $20.00")).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sent by|Undo|Confirm|Revert/ })).toBeNull();
  });

  it("hides sent actions for settled shares and for leavers", () => {
    const settled = renderCosts([
      item({ shares: [share("c", "Cy", { status: "CONFIRMED", paidCents: 2000 })] }),
    ]);
    expect(screen.queryByRole("button", { name: /Sent by/ })).not.toBeInTheDocument();
    settled.unmount();

    renderCosts([
      item({ shares: [share("c", "Cy", { status: "SENT", amountCents: 0, paidCents: 2000 })] }),
    ]);
    expect(screen.queryByRole("button", { name: "Undo sent" })).not.toBeInTheDocument();
  });

  it("lets the collector confirm, revert and refund", async () => {
    renderCosts(
      [
        item({
          shares: [
            share("a", "Alice", { status: "CONFIRMED", paidCents: 2000 }),
            share("b", "Bob", { status: "SENT", method: "CASH" }),
            share("d", "Di", { status: "CONFIRMED", paidCents: 2000 }),
            share("e", "Ed", { status: "CONFIRMED", amountCents: 0, paidCents: 2000 }),
          ],
        }),
      ],
      { who: viewer("a") }
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(payMocks.confirmPaymentAction).toHaveBeenCalledWith("c1", "b"), {
      timeout: 3000,
    });
    expect(screen.getAllByRole("button", { name: "Revert" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Revert" })[0]);
    await waitFor(() => expect(payMocks.revertConfirmationAction).toHaveBeenCalledWith("c1", "d"), {
      timeout: 3000,
    });
    expect(screen.getByText(/refund due \$20\.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark refunded" }));
    await waitFor(() => expect(payMocks.markRefundedAction).toHaveBeenCalledWith("c1", "e"), {
      timeout: 3000,
    });
  });

  it("shows how much more someone owes after a re-split", () => {
    renderCosts([
      item({
        shares: [share("b", "Bob", { status: "UNPAID", amountCents: 3000, paidCents: 2000 })],
      }),
    ]);
    expect(screen.getByText(/owes \$10\.00 more/)).toBeInTheDocument();
  });

  it("reports action errors without refreshing", async () => {
    payMocks.markSentAction.mockResolvedValueOnce({ error: "That share changed" });
    renderCosts([item({ shares: [share("c", "Cy")] })]);
    fireEvent.click(screen.getByRole("button", { name: "Sent by e-Transfer" }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("That share changed"));
    expect(routerMocks.refresh).not.toHaveBeenCalled();
  });

  it("gives members no edit controls", () => {
    renderCosts([item()]);
    expect(screen.queryByRole("button", { name: "Add cost" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Dinner" })).not.toBeInTheDocument();
  });

  it("lets admins add a cost with a collector", async () => {
    renderCosts([], { canEdit: true, who: viewer("z", "GOING", true) });
    fireEvent.click(screen.getByRole("button", { name: "Add cost" }));
    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Add cost" });
    expect(submit).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("Item"), { target: { value: "Pizza" } });
    fireEvent.change(within(dialog).getByLabelText("Total ($)"), { target: { value: "45.5" } });
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "b" } });
    fireEvent.change(within(dialog).getByLabelText("Notes (optional)"), {
      target: { value: "Cash only" },
    });
    // Nobody starts in the group (G2); "Select all Going" fills it, Clear empties it, ticks toggle.
    const alice = within(dialog).getByRole("checkbox", { name: "Alice" });
    expect(alice).not.toBeChecked();
    expect(within(dialog).getByText("not going")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Select all Going" }));
    expect(alice).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Bob/ })).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear" }));
    expect(alice).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Bob/ }));
    fireEvent.click(alice);
    fireEvent.click(alice);
    fireEvent.click(submit);

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Cost added"));
    expect(costMocks.addCostAction).toHaveBeenCalledWith("h1", {
      title: "Pizza",
      amountCents: 4550,
      collectorId: "b",
      participantIds: ["b"],
      notes: "Cash only",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("lets admins edit and delete an item", async () => {
    renderCosts([item()], { canEdit: true, who: viewer("z", "GOING", true) });
    fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Total ($)")).toHaveValue(60);
    fireEvent.change(within(dialog).getByLabelText("Total ($)"), { target: { value: "75" } });
    costMocks.updateCostAction.mockResolvedValueOnce({ error: "Collector not found" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save cost" }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Collector not found"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save cost" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Cost updated"));
    expect(costMocks.updateCostAction).toHaveBeenLastCalledWith("c1", {
      title: "Dinner",
      amountCents: 7500,
      collectorId: "a",
      participantIds: ["a", "b", "c"],
      notes: "Split three ways",
    });

    const confirm = vi.spyOn(window, "confirm");
    confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete Dinner" }));
    expect(costMocks.deleteCostAction).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete Dinner" }));
    await waitFor(() => expect(costMocks.deleteCostAction).toHaveBeenCalledWith("c1"));
    confirm.mockRestore();
  });
});
