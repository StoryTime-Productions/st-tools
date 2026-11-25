import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BucketItemCard } from "@/app/bucket-list/_components/bucket-item-card";
import type { BucketItemView } from "@/lib/bucket-list-core";

const actionMocks = vi.hoisted(() => ({
  deleteBucketItemAction: vi.fn(),
  setBucketItemDoneAction: vi.fn(),
  setBucketItemPlannedAction: vi.fn(),
  linkBucketItemHangoutAction: vi.fn(),
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

vi.mock("@/app/bucket-list/_components/bucket-link-dialog", () => ({
  BucketLinkDialog: ({
    hangouts,
    onOpenChange,
  }: {
    hangouts: { title: string }[];
    onOpenChange: (open: boolean) => void;
  }) => (
    <div role="dialog" aria-label="Link a hangout">
      {hangouts.map((hangout) => hangout.title).join(", ")}
      <button type="button" onClick={() => onOpenChange(false)}>
        Close link
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
  hangoutEnded: false,
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
    render(<BucketItemCard item={item()} viewer={owner} hangouts={[]} />);

    expect(screen.getByRole("heading", { name: "Camping" })).toBeVisible();
    expect(screen.getByText("Bring snacks")).toBeVisible();
    expect(screen.getByText("Alice Smith")).toBeVisible();
  });

  it("falls back when the suggester is gone, and leaves out empty parts", () => {
    render(
      <BucketItemCard
        item={item({ notes: null, suggestedByName: null, suggestedById: null })}
        viewer={owner}
        hangouts={[]}
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
        hangouts={[]}
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
    render(<BucketItemCard item={item({ hangoutId: "h1" })} viewer={owner} hangouts={[]} />);

    expect(screen.getByRole("link", { name: /Hangout/ })).toBeVisible();
  });

  it("marks a done item with when it was done", () => {
    render(
      <BucketItemCard
        item={item({ status: "DONE", doneAt: new Date("2026-11-09T20:00:00Z") })}
        viewer={owner}
        hangouts={[]}
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
    render(<BucketItemCard item={item()} viewer={owner} hangouts={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Done: Camping" }));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Marked as done"));
    expect(actionMocks.setBucketItemDoneAction).toHaveBeenCalledWith("b1", true);
  });

  it("unticks a done item", async () => {
    actionMocks.setBucketItemDoneAction.mockResolvedValue({ success: true });
    render(<BucketItemCard item={item({ status: "DONE" })} viewer={owner} hangouts={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Done: Camping" }));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Moved back to the list"));
    expect(actionMocks.setBucketItemDoneAction).toHaveBeenCalledWith("b1", false);
  });

  it("reports a failed tick", async () => {
    actionMocks.setBucketItemDoneAction.mockResolvedValue({ error: "That item no longer exists." });
    render(<BucketItemCard item={item()} viewer={owner} hangouts={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Done: Camping" }));

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("That item no longer exists.")
    );
    expect(toastMocks.success).not.toHaveBeenCalled();
  });

  it("gives every member the planning actions but only the suggester and admins Edit and Delete", async () => {
    const { rerender } = render(
      <BucketItemCard item={item()} viewer={{ id: "u2", role: "MEMBER" }} hangouts={[]} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Actions for Camping" }));
    expect(await screen.findByRole("menuitem", { name: "Move to In plan" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Link a hangout" })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    rerender(<BucketItemCard item={item()} viewer={owner} hangouts={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Actions for Camping" }));
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    await userEvent.keyboard("{Escape}");

    rerender(<BucketItemCard item={item()} viewer={{ id: "u9", role: "ADMIN" }} hangouts={[]} />);
    expect(screen.getByRole("button", { name: "Actions for Camping" })).toBeVisible();
  });

  it("has no menu on a done item for a member who did not suggest it, and only Edit and Delete for one who did", async () => {
    const done = item({ status: "DONE" });
    const { rerender } = render(
      <BucketItemCard item={done} viewer={{ id: "u2", role: "MEMBER" }} hangouts={[]} />
    );
    expect(screen.queryByRole("button", { name: "Actions for Camping" })).not.toBeInTheDocument();

    rerender(<BucketItemCard item={done} viewer={owner} hangouts={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Actions for Camping" }));
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "Move to In plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Link a hangout" })).not.toBeInTheDocument();
  });

  it("moves an item to In plan and back, reporting a failure", async () => {
    actionMocks.setBucketItemPlannedAction
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ error: "Untick Done first." })
      .mockResolvedValueOnce({ success: true });
    const { rerender } = render(<BucketItemCard item={item()} viewer={owner} hangouts={[]} />);

    await userEvent.click(screen.getByRole("button", { name: "Actions for Camping" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Move to In plan" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Moved to In plan"));
    expect(actionMocks.setBucketItemPlannedAction).toHaveBeenCalledWith("b1", true);

    rerender(<BucketItemCard item={item({ status: "IN_PLAN" })} viewer={owner} hangouts={[]} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for Camping" })).toBeEnabled()
    );
    await userEvent.click(screen.getByRole("button", { name: "Actions for Camping" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Back to To do" }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Untick Done first."));
    expect(actionMocks.setBucketItemPlannedAction).toHaveBeenLastCalledWith("b1", false);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for Camping" })).toBeEnabled()
    );
    await userEvent.click(screen.getByRole("button", { name: "Actions for Camping" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Back to To do" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Moved back to To do"));
  });

  it("opens the link dialog with the open hangouts and returns focus to the menu when it closes", async () => {
    render(
      <BucketItemCard
        item={item()}
        viewer={{ id: "u2", role: "MEMBER" }}
        hangouts={[
          { id: "h1", title: "Lake day" },
          { id: "h2", title: "Bowling" },
        ]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Actions for Camping" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Link a hangout" }));
    expect(await screen.findByRole("dialog", { name: "Link a hangout" })).toHaveTextContent(
      "Lake day, Bowling"
    );

    await userEvent.click(screen.getByRole("button", { name: "Close link" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for Camping" })).toHaveFocus()
    );
  });

  it("unlinks a hangout, reporting a failure first", async () => {
    actionMocks.linkBucketItemHangoutAction
      .mockResolvedValueOnce({ error: "That item no longer exists." })
      .mockResolvedValueOnce({ success: true });
    render(
      <BucketItemCard
        item={item({ status: "IN_PLAN", hangoutId: "h1", hangoutTitle: "Lake day" })}
        viewer={owner}
        hangouts={[]}
      />
    );
    expect(screen.queryByRole("menuitem", { name: "Link a hangout" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Actions for Camping" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Unlink hangout" }));
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("That item no longer exists.")
    );
    expect(actionMocks.linkBucketItemHangoutAction).toHaveBeenCalledWith("b1", null);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for Camping" })).toBeEnabled()
    );
    await userEvent.click(screen.getByRole("button", { name: "Actions for Camping" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Unlink hangout" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Hangout unlinked"));
  });

  it("offers Mark as done once a linked hangout has ended, and only then", async () => {
    actionMocks.setBucketItemDoneAction.mockResolvedValue({ success: true });
    const linked = { status: "IN_PLAN" as const, hangoutId: "h1", hangoutTitle: "Lake day" };
    const { rerender } = render(
      <BucketItemCard item={item(linked)} viewer={owner} hangouts={[]} />
    );
    expect(screen.queryByText("That hangout has ended.")).not.toBeInTheDocument();

    rerender(
      <BucketItemCard item={item({ ...linked, hangoutEnded: true })} viewer={owner} hangouts={[]} />
    );
    expect(screen.getByText("That hangout has ended.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Mark as done" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Marked as done"));
    expect(actionMocks.setBucketItemDoneAction).toHaveBeenCalledWith("b1", true);

    rerender(
      <BucketItemCard
        item={item({ ...linked, status: "DONE", hangoutEnded: true })}
        viewer={owner}
        hangouts={[]}
      />
    );
    expect(screen.queryByText("That hangout has ended.")).not.toBeInTheDocument();
  });

  it("opens the edit dialog from the menu and returns focus to the menu when it closes", async () => {
    render(<BucketItemCard item={item()} viewer={owner} hangouts={[]} />);

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
    render(<BucketItemCard item={item()} viewer={owner} hangouts={[]} />);

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
    render(<BucketItemCard item={item()} viewer={owner} hangouts={[]} />);

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
