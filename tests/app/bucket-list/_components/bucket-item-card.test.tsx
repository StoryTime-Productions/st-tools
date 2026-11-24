import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BucketItemCard } from "@/app/bucket-list/_components/bucket-item-card";
import type { BucketItemView } from "@/lib/bucket-list-core";

const actionMocks = vi.hoisted(() => ({
  deleteBucketItemAction: vi.fn(),
  setBucketItemDoneAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/app/actions/bucket-list", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("@/app/bucket-list/_components/bucket-item-dialog", () => ({
  BucketItemDialog: ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => (
    <div role="dialog" aria-label="Edit item">
      <button type="button" onClick={() => onOpenChange(false)}>
        Close edit
      </button>
    </div>
  ),
}));

const item = (over: Partial<BucketItemView> = {}): BucketItemView => ({
  id: "b1",
  title: "Camping",
  notes: "Bring snacks",
  status: "TODO",
  season: null,
  seasonYear: null,
  suggestedById: "u1",
  suggestedByName: "Alice Smith",
  hangoutId: null,
  hangoutTitle: null,
  driveFolderId: null,
  doneAt: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  tags: [],
  ...over,
});

const owner = { id: "u1", role: "MEMBER" as const };

describe("BucketItemCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the title, notes and who suggested it", () => {
    render(<BucketItemCard item={item()} viewer={owner} />);

    expect(screen.getByRole("heading", { name: "Camping" })).toBeVisible();
    expect(screen.getByText("Bring snacks")).toBeVisible();
    expect(screen.getByText("Alice Smith")).toBeVisible();
  });

  it("falls back when the suggester is gone, and leaves out empty parts", () => {
    render(
      <BucketItemCard
        item={item({ notes: null, suggestedByName: null, suggestedById: null })}
        viewer={owner}
      />
    );

    expect(screen.getByText("Someone")).toBeVisible();
    expect(screen.queryByText("Bring snacks")).not.toBeInTheDocument();
    expect(screen.queryByText(/Season/)).not.toBeInTheDocument();
  });

  it("shows the season, tags and a link to the hangout", () => {
    render(
      <BucketItemCard
        item={item({
          status: "IN_PLAN",
          season: "SUMMER",
          seasonYear: 2027,
          tags: ["outdoors", "trip"],
          hangoutId: "h1",
          hangoutTitle: "Lake day",
        })}
        viewer={owner}
      />
    );

    expect(screen.getByText("Summer 2027")).toBeVisible();
    expect(screen.getByText("outdoors")).toBeVisible();
    expect(screen.getByText("trip")).toBeVisible();
    expect(screen.getByRole("link", { name: /Lake day/ })).toHaveAttribute(
      "href",
      "/hub/hangouts/h1"
    );
  });

  it("names a linked hangout generically when its title is missing", () => {
    render(<BucketItemCard item={item({ hangoutId: "h1" })} viewer={owner} />);

    expect(screen.getByRole("link", { name: /Hangout/ })).toBeVisible();
  });

  it("marks a done item with when it was done", () => {
    render(
      <BucketItemCard
        item={item({ status: "DONE", doneAt: new Date("2026-11-09T20:00:00Z") })}
        viewer={owner}
      />
    );

    expect(screen.getByText(/done Nov 9/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Done: Camping" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("ticks an item done and says so", async () => {
    actionMocks.setBucketItemDoneAction.mockResolvedValue({ success: true });
    render(<BucketItemCard item={item()} viewer={owner} />);

    fireEvent.click(screen.getByRole("button", { name: "Done: Camping" }));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Marked as done"));
    expect(actionMocks.setBucketItemDoneAction).toHaveBeenCalledWith("b1", true);
  });

  it("unticks a done item", async () => {
    actionMocks.setBucketItemDoneAction.mockResolvedValue({ success: true });
    render(<BucketItemCard item={item({ status: "DONE" })} viewer={owner} />);

    fireEvent.click(screen.getByRole("button", { name: "Done: Camping" }));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Moved back to the list"));
    expect(actionMocks.setBucketItemDoneAction).toHaveBeenCalledWith("b1", false);
  });

  it("reports a failed tick", async () => {
    actionMocks.setBucketItemDoneAction.mockResolvedValue({ error: "That item no longer exists." });
    render(<BucketItemCard item={item()} viewer={owner} />);

    fireEvent.click(screen.getByRole("button", { name: "Done: Camping" }));

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("That item no longer exists.")
    );
    expect(toastMocks.success).not.toHaveBeenCalled();
  });

  it("hides the menu from members who did not suggest it, shows it to the suggester and admins", () => {
    const { rerender } = render(
      <BucketItemCard item={item()} viewer={{ id: "u2", role: "MEMBER" }} />
    );
    expect(screen.queryByRole("button", { name: "Actions for Camping" })).not.toBeInTheDocument();

    rerender(<BucketItemCard item={item()} viewer={owner} />);
    expect(screen.getByRole("button", { name: "Actions for Camping" })).toBeVisible();

    rerender(<BucketItemCard item={item()} viewer={{ id: "u9", role: "ADMIN" }} />);
    expect(screen.getByRole("button", { name: "Actions for Camping" })).toBeVisible();
  });

  it("opens the edit dialog from the menu and returns focus to the menu when it closes", async () => {
    render(<BucketItemCard item={item()} viewer={owner} />);

    await userEvent.click(screen.getByRole("button", { name: "Actions for Camping" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    expect(await screen.findByRole("dialog", { name: "Edit item" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Close edit" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for Camping" })).toHaveFocus()
    );
  });

  it("asks before deleting and does nothing on cancel", async () => {
    render(<BucketItemCard item={item()} viewer={owner} />);

    await userEvent.click(screen.getByRole("button", { name: "Actions for Camping" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByText("Delete this item?")).toBeVisible();
    expect(screen.getByText(/"Camping" will be deleted/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Delete this item?")).not.toBeInTheDocument());
    expect(actionMocks.deleteBucketItemAction).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for Camping" })).toHaveFocus()
    );
  });

  it("deletes once confirmed, reporting a failure first", async () => {
    actionMocks.deleteBucketItemAction
      .mockResolvedValueOnce({ error: "You can only change items you suggested." })
      .mockResolvedValueOnce({ success: true });
    render(<BucketItemCard item={item()} viewer={owner} />);

    await userEvent.click(screen.getByRole("button", { name: "Actions for Camping" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("You can only change items you suggested.")
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for Camping" })).toBeEnabled()
    );
    await userEvent.click(screen.getByRole("button", { name: "Actions for Camping" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Item deleted"));
    expect(actionMocks.deleteBucketItemAction).toHaveBeenCalledWith("b1");
  });
});
