import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BucketLinkDialog } from "@/app/bucket-list/_components/bucket-link-dialog";

const actionMocks = vi.hoisted(() => ({ linkBucketItemHangoutAction: vi.fn() }));
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

const hangouts = [
  { id: "h1", title: "Lake day", detail: "Sun, Dec 6" },
  { id: "h2", title: "Bowling", detail: "No date yet" },
];

describe("BucketLinkDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps Link disabled until a hangout is picked, then links it and closes", async () => {
    actionMocks.linkBucketItemHangoutAction.mockResolvedValue({ success: true });
    const onOpenChange = vi.fn();
    render(
      <BucketLinkDialog
        itemId="b1"
        itemTitle="Camping"
        hangouts={hangouts}
        onOpenChange={onOpenChange}
      />
    );

    expect(screen.getByText(/Camping/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Link hangout" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Bowling · No date yet" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "h2" } });
    await userEvent.click(screen.getByRole("button", { name: "Link hangout" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(actionMocks.linkBucketItemHangoutAction).toHaveBeenCalledWith("b1", "h2");
    expect(toastMocks.success).toHaveBeenCalledWith("Linked to the hangout");
  });

  it("shows a refusal and stays open", async () => {
    actionMocks.linkBucketItemHangoutAction.mockResolvedValue({
      error: "That hangout already has a bucket-list item.",
    });
    const onOpenChange = vi.fn();
    render(
      <BucketLinkDialog
        itemId="b1"
        itemTitle="Camping"
        hangouts={hangouts}
        onOpenChange={onOpenChange}
      />
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "h1" } });
    await userEvent.click(screen.getByRole("button", { name: "Link hangout" }));

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("That hangout already has a bucket-list item.")
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("explains when every open hangout already has an item, and closes from the footer", async () => {
    const onOpenChange = vi.fn();
    render(
      <BucketLinkDialog itemId="b1" itemTitle="Camping" hangouts={[]} onOpenChange={onOpenChange} />
    );

    expect(screen.getByText(/Every open hangout already has an item/)).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link hangout" })).not.toBeInTheDocument();

    // the dialog's own X is also named Close; the footer button comes last
    await userEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
