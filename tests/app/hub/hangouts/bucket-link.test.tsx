import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BucketLink } from "@/app/hub/hangouts/[hangoutId]/_components/bucket-link";

const actionMocks = vi.hoisted(() => ({
  linkBucketItemHangoutAction: vi.fn(),
  setBucketItemDoneAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/app/actions/bucket-list", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
// Radix Select needs pointer APIs jsdom lacks; a native select exercises the same handlers
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (next: string) => void;
    children: ReactNode;
  }) => (
    <select aria-label="Pick" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">-</option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const options = [
  { id: "b1", title: "Camping", detail: "Summer 2027 · by Alice" },
  { id: "b2", title: "Skydiving", detail: "by Bob" },
];
const linked = { id: "b1", title: "Camping", status: "IN_PLAN" as const };

describe("BucketLink", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when there is no item and nothing to pick", () => {
    const { container } = render(
      <BucketLink hangoutId="h1" item={null} ended={false} options={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("links the picked item to this hangout", async () => {
    actionMocks.linkBucketItemHangoutAction
      .mockResolvedValueOnce({ error: "That item no longer exists." })
      .mockResolvedValueOnce({ success: true });
    render(<BucketLink hangoutId="h1" item={null} ended={false} options={options} />);

    expect(screen.getByRole("button", { name: "Link item" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b2" } });
    await userEvent.click(screen.getByRole("button", { name: "Link item" }));
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("That item no longer exists.")
    );
    expect(actionMocks.linkBucketItemHangoutAction).toHaveBeenCalledWith("b2", "h1");

    await waitFor(() => expect(screen.getByRole("button", { name: "Link item" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Link item" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Linked to the item"));
  });

  it("shows the linked item with its status and a link to the list, and can unlink it", async () => {
    actionMocks.linkBucketItemHangoutAction.mockResolvedValue({ success: true });
    render(<BucketLink hangoutId="h1" item={linked} ended={false} options={[]} />);

    expect(screen.getByRole("link", { name: "Camping" })).toHaveAttribute("href", "/bucket-list");
    expect(screen.getByText("In plan")).toBeVisible();
    expect(screen.queryByText("This hangout has ended.")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Unlink this item" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Item unlinked"));
    expect(actionMocks.linkBucketItemHangoutAction).toHaveBeenCalledWith("b1", null);
  });

  it("asks Mark as done? once the hangout has ended", async () => {
    actionMocks.setBucketItemDoneAction.mockResolvedValue({ success: true });
    render(<BucketLink hangoutId="h1" item={linked} ended options={[]} />);

    expect(screen.getByText("This hangout has ended.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Mark as done" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Marked as done"));
    expect(actionMocks.setBucketItemDoneAction).toHaveBeenCalledWith("b1", true);
  });

  it("leaves a done item alone: no prompt and no unlink", () => {
    render(<BucketLink hangoutId="h1" item={{ ...linked, status: "DONE" }} ended options={[]} />);

    expect(screen.getByText("Done")).toBeVisible();
    expect(screen.queryByText("This hangout has ended.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unlink this item" })).not.toBeInTheDocument();
  });
});
