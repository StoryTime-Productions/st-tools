import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BucketItemDialog } from "@/app/bucket-list/_components/bucket-item-dialog";
import type { BucketItemView } from "@/lib/bucket-list-core";

const actionMocks = vi.hoisted(() => ({ saveBucketItemAction: vi.fn() }));
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
    <select aria-label="Season" value={value} onChange={(e) => onValueChange(e.target.value)}>
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

const existing = (over: Partial<BucketItemView> = {}): BucketItemView => ({
  id: "b1",
  title: "Camping",
  notes: "Bring snacks",
  status: "TODO",
  season: "SUMMER",
  seasonYear: 2027,
  suggestedById: "u1",
  suggestedByName: "Alice",
  hangoutId: null,
  hangoutTitle: null,
  driveFolderId: null,
  doneAt: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  tags: ["outdoors"],
  ...over,
});

async function openAdd(props: { tagNames?: string[]; isAdmin?: boolean } = {}) {
  render(<BucketItemDialog tagNames={props.tagNames ?? []} isAdmin={props.isAdmin ?? false} />);
  await userEvent.click(screen.getByRole("button", { name: "Add an item" }));
  return screen.findByRole("dialog");
}

describe("BucketItemDialog (add)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.saveBucketItemAction.mockResolvedValue({ success: true });
  });

  it("keeps the submit disabled until there is a title", async () => {
    await openAdd();

    expect(screen.getByRole("button", { name: "Add item" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Title"), "Escape room");
    expect(screen.getByRole("button", { name: "Add item" })).toBeEnabled();
  });

  it("saves a title with notes and closes", async () => {
    await openAdd();

    await userEvent.type(screen.getByLabelText("Title"), "Escape room");
    await userEvent.type(screen.getByLabelText("Notes (optional)"), "the hard one");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Item added"));
    expect(actionMocks.saveBucketItemAction).toHaveBeenCalledWith({
      id: undefined,
      title: "Escape room",
      notes: "the hard one",
      season: null,
      seasonYear: null,
      tags: [],
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows a server refusal as an alert and stays open", async () => {
    actionMocks.saveBucketItemAction.mockResolvedValue({ error: "Pick a valid year." });
    await openAdd();

    await userEvent.type(screen.getByLabelText("Title"), "Beach");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Pick a valid year.");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(toastMocks.success).not.toHaveBeenCalled();
  });

  it("sends a season and year once a season is picked", async () => {
    await openAdd();
    const year = screen.getByLabelText("Year (optional)");
    expect(year).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Title"), "Beach");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "SPRING" } });
    expect(year).toBeEnabled();
    await userEvent.type(year, "2027");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() =>
      expect(actionMocks.saveBucketItemAction).toHaveBeenCalledWith(
        expect.objectContaining({ season: "SPRING", seasonYear: 2027 })
      )
    );
  });

  it("clears and disables the year when the season is removed", async () => {
    await openAdd();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "SPRING" } });
    await userEvent.type(screen.getByLabelText("Year (optional)"), "2027");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "none" } });

    expect(screen.getByLabelText("Year (optional)")).toHaveValue(null);
    expect(screen.getByLabelText("Year (optional)")).toBeDisabled();
  });

  it("sends a season without a year when the year is left empty", async () => {
    await openAdd();

    await userEvent.type(screen.getByLabelText("Title"), "Beach");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "FALL" } });
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() =>
      expect(actionMocks.saveBucketItemAction).toHaveBeenCalledWith(
        expect.objectContaining({ season: "FALL", seasonYear: null })
      )
    );
  });

  it("lets a member pick from the shared tags but not create one", async () => {
    await openAdd({ tagNames: ["food", "trip"] });

    expect(screen.queryByLabelText("New tag")).not.toBeInTheDocument();
    const food = screen.getByRole("button", { name: "food" });
    expect(food).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(food);
    expect(food).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "trip" }));
    await userEvent.click(food);
    expect(food).toHaveAttribute("aria-pressed", "false");

    await userEvent.type(screen.getByLabelText("Title"), "Crawl");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));
    await waitFor(() =>
      expect(actionMocks.saveBucketItemAction).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ["trip"] })
      )
    );
  });

  it("says when there are no shared tags yet", async () => {
    await openAdd({ tagNames: [] });
    expect(screen.getByText("No shared tags exist yet.")).toBeVisible();
  });

  it("lets an admin create tags with the button or Enter, ignoring blanks and repeats", async () => {
    await openAdd({ tagNames: [], isAdmin: true });
    expect(screen.getByText("No tags yet. Add one below.")).toBeVisible();

    const field = screen.getByLabelText("New tag");
    // a blank tag is ignored
    await userEvent.click(screen.getByRole("button", { name: "Add tag" }));
    expect(screen.getByText("No tags yet. Add one below.")).toBeVisible();

    await userEvent.type(field, "games");
    await userEvent.click(screen.getByRole("button", { name: "Add tag" }));
    expect(screen.getByRole("button", { name: "games" })).toHaveAttribute("aria-pressed", "true");
    expect(field).toHaveValue("");

    await userEvent.type(field, "music{Enter}");
    expect(screen.getByRole("button", { name: "music" })).toHaveAttribute("aria-pressed", "true");
    // Enter in the tag field adds the tag, it does not submit the form
    expect(actionMocks.saveBucketItemAction).not.toHaveBeenCalled();

    await userEvent.type(field, "games{Enter}");
    expect(screen.getAllByRole("button", { name: "games" })).toHaveLength(1);

    await userEvent.type(field, "x");
    fireEvent.keyDown(field, { key: "a" });
    expect(field).toHaveValue("x");
  });
});

describe("BucketItemDialog (edit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.saveBucketItemAction.mockResolvedValue({ success: true });
  });

  it("starts from the saved item and saves it by id", async () => {
    const onOpenChange = vi.fn();
    render(
      <BucketItemDialog
        item={existing()}
        tagNames={["food"]}
        isAdmin={false}
        open
        onOpenChange={onOpenChange}
      />
    );

    expect(screen.getByRole("heading", { name: "Edit item" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add an item" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Camping");
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("Bring snacks");
    expect(screen.getByRole("combobox")).toHaveValue("SUMMER");
    expect(screen.getByLabelText("Year (optional)")).toHaveValue(2027);
    // a tag already on the item stays selectable even if it left the shared list
    expect(screen.getByRole("button", { name: "outdoors" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "food" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.clear(screen.getByLabelText("Title"));
    await userEvent.type(screen.getByLabelText("Title"), "Camping trip");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Item updated"));
    expect(actionMocks.saveBucketItemAction).toHaveBeenCalledWith({
      id: "b1",
      title: "Camping trip",
      notes: "Bring snacks",
      season: "SUMMER",
      seasonYear: 2027,
      tags: ["outdoors"],
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("starts empty for an item with no notes, season or year", () => {
    render(
      <BucketItemDialog
        item={existing({ notes: null, season: null, seasonYear: null, tags: [] })}
        tagNames={[]}
        isAdmin={false}
        open
      />
    );

    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("");
    expect(screen.getByRole("combobox")).toHaveValue("none");
    expect(screen.getByLabelText("Year (optional)")).toHaveValue(null);
  });

  it("tells the parent when it is dismissed", async () => {
    const onOpenChange = vi.fn();
    render(
      <BucketItemDialog
        item={existing()}
        tagNames={[]}
        isAdmin={false}
        open
        onOpenChange={onOpenChange}
      />
    );

    await userEvent.type(screen.getByLabelText("Title"), " DISCARDED");
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not close while a save is in flight", async () => {
    let finish: (value: { success: true }) => void = () => {};
    actionMocks.saveBucketItemAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const onOpenChange = vi.fn();
    render(
      <BucketItemDialog
        item={existing()}
        tagNames={[]}
        isAdmin={false}
        open
        onOpenChange={onOpenChange}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();

    finish({ success: true });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

describe("BucketItemDialog (reopening an add dialog)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts blank again after being dismissed with text typed", async () => {
    await openAdd();
    await userEvent.type(screen.getByLabelText("Title"), "Half typed");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Add an item" }));
    expect(await screen.findByLabelText("Title")).toHaveValue("");
  });
});
