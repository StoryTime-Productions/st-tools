import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CardDetailSheet } from "@/app/boards/[boardId]/_components/card-detail-sheet";
import type { BoardCardData, BoardMemberSummary } from "@/app/boards/types";

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

const MEMBERS: BoardMemberSummary[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Owner",
    email: "owner@example.com",
    avatarUrl: null,
    role: "ADMIN",
    isOwner: true,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Teammate",
    email: "teammate@example.com",
    avatarUrl: null,
    role: "MEMBER",
    isOwner: false,
  },
];

const COLUMN_LOOKUP = {
  "col-todo": "To do",
  "col-done": "Done",
};

function makeCard(overrides: Partial<BoardCardData> = {}): BoardCardData {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Build release plan",
    description: "Initial description",
    position: 0,
    dueDate: "2026-03-20",
    labels: ["design", "qa"],
    assigneeId: MEMBERS[1].id,
    assignee: MEMBERS[1],
    checklistItems: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        content: "Existing checklist",
        completed: false,
        position: 0,
      },
    ],
    activities: [
      {
        id: "a1",
        eventType: "CREATED",
        createdAt: "2026-03-18T09:00:00.000Z",
        actor: MEMBERS[0],
        details: null,
      },
      {
        id: "a2",
        eventType: "COMMENTED",
        createdAt: "2026-03-18T10:00:00.000Z",
        actor: MEMBERS[1],
        details: { comment: "Looks good" },
      },
      {
        id: "a3",
        eventType: "MOVED",
        createdAt: "2026-03-18T11:00:00.000Z",
        actor: MEMBERS[1],
        details: {
          fromColumnId: "col-todo",
          toColumnId: "col-done",
          fromPosition: 0,
          toPosition: 1,
        },
      },
      {
        id: "a4",
        eventType: "MOVED",
        createdAt: "2026-03-18T11:30:00.000Z",
        actor: MEMBERS[1],
        details: {
          fromColumnId: "col-todo",
          toColumnId: "col-todo",
          fromPosition: 0,
          toPosition: 2,
        },
      },
      {
        id: "a5",
        eventType: "UPDATED",
        createdAt: "2026-03-18T12:00:00.000Z",
        actor: MEMBERS[0],
        details: { changedFields: ["title", "labels"] },
      },
      {
        id: "a6",
        eventType: "UPDATED",
        createdAt: "not-a-date",
        actor: null,
        details: null,
      },
    ],
    ...overrides,
  };
}

function renderSheet({
  card = makeCard(),
  isPending = false,
  onOpenChange = vi.fn(),
  onSave = vi.fn(),
  onAddComment = vi.fn(async () => true),
  onDelete = vi.fn(),
}: {
  card?: BoardCardData | null;
  isPending?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSave?: (values: {
    cardId: string;
    title: string;
    description: string | null;
    labels: string[];
    assigneeId: string | null;
    dueDate: string | null;
    checklistItems: Array<{ content: string; completed: boolean }>;
  }) => void;
  onAddComment?: (values: { cardId: string; content: string }) => Promise<boolean>;
  onDelete?: (cardId: string) => void;
}) {
  render(
    <CardDetailSheet
      open
      onOpenChange={onOpenChange}
      card={card}
      columnLookup={COLUMN_LOOKUP}
      members={MEMBERS}
      isPending={isPending}
      onSave={onSave}
      onAddComment={onAddComment}
      onDelete={onDelete}
    />
  );

  return { onOpenChange, onSave, onAddComment, onDelete };
}

describe("CardDetailSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renders header fallback when card is null", () => {
    renderSheet({ card: null });

    expect(screen.getByText("Card details")).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("saves edited fields and applies timeline filters", async () => {
    const onSave = vi.fn();
    renderSheet({ onSave });

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "  Updated release plan  " },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "  Updated description  " },
    });
    fireEvent.change(screen.getByLabelText("Labels"), {
      target: { value: "design, backend, design,   " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Teammate" }));
    fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));

    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    const checklistInputs = screen.getAllByPlaceholderText("Checklist item");
    fireEvent.change(checklistInputs[0], { target: { value: "  Keep this item  " } });
    fireEvent.change(checklistInputs[1], { target: { value: "   " } });

    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        cardId: "33333333-3333-4333-8333-333333333333",
        title: "Updated release plan",
        description: "Updated description",
        labels: ["design", "backend"],
        assigneeId: null,
        dueDate: null,
        checklistItems: [{ content: "Keep this item", completed: true }],
      });
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "Column transitions" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Field updates" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Comments" }));

    expect(screen.getByText("No timeline entries match the selected filters.")).toBeInTheDocument();
    expect(screen.getByText("Showing 0 of 6 timeline entries")).toBeInTheDocument();
  }, 15000);

  it("adds comments and closes the sheet", async () => {
    const onAddComment = vi
      .fn<(_values: { cardId: string; content: string }) => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const onOpenChange = vi.fn();

    renderSheet({ onAddComment, onOpenChange });

    const commentInput = screen.getByLabelText("Add comment");

    fireEvent.change(commentInput, {
      target: { value: "  First comment  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));

    await waitFor(() => {
      expect(onAddComment).toHaveBeenCalledWith({
        cardId: "33333333-3333-4333-8333-333333333333",
        content: "First comment",
      });
    });

    expect(screen.getByLabelText("Add comment")).toHaveValue("");

    fireEvent.change(commentInput, {
      target: { value: "Second comment" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));

    await waitFor(() => {
      expect(onAddComment).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByLabelText("Add comment")).toHaveValue("Second comment");

    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows timeline summaries and handles delete confirmation", async () => {
    const onDelete = vi.fn();
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(true);

    renderSheet({ onDelete });

    expect(screen.getByText("Card created")).toBeInTheDocument();
    expect(screen.getByText("Commented")).toBeInTheDocument();
    expect(screen.getByText("Moved from To do to Done")).toBeInTheDocument();
    expect(screen.getByText("Reordered in column (1 -> 3)")).toBeInTheDocument();
    expect(screen.getByText("Updated title, labels")).toBeInTheDocument();
    expect(screen.getByText("Card updated")).toBeInTheDocument();
    expect(screen.getByText("Looks good")).toBeInTheDocument();
    expect(screen.getByText(/System \u00b7 Unknown time/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete card" }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete card" }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333");
    });
  });

  it("uses fallback summaries and assignee email labels for sparse activity data", async () => {
    const onSave = vi.fn();
    const fallbackMembers: BoardMemberSummary[] = [
      MEMBERS[0],
      {
        ...MEMBERS[1],
        name: null,
      },
    ];

    const fallbackCard = makeCard({
      labels: [],
      assignee: fallbackMembers[1],
      activities: [
        {
          id: "fallback-moved",
          eventType: "MOVED",
          createdAt: "2026-03-18T13:00:00.000Z",
          actor: {
            ...fallbackMembers[1],
          },
          details: {},
        },
      ],
    });

    const originalCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", undefined as unknown as Crypto);

    render(
      <CardDetailSheet
        open
        onOpenChange={vi.fn()}
        card={fallbackCard}
        columnLookup={COLUMN_LOOKUP}
        members={fallbackMembers}
        isPending={false}
        onSave={onSave}
        onAddComment={vi.fn(async () => true)}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "teammate@example.com" })).toBeInTheDocument();
    expect(screen.getByText("Card moved")).toBeInTheDocument();
    expect(screen.getAllByText(/teammate@example.com/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          description: null,
          labels: [],
        })
      );
    });

    vi.stubGlobal("crypto", originalCrypto);
  });

  it("renders empty checklist and timeline placeholders", () => {
    renderSheet({
      card: makeCard({
        checklistItems: [],
        activities: [],
      }),
    });

    expect(screen.getByText("No checklist items yet.")).toBeInTheDocument();
    expect(screen.getByText("No timeline entries match the selected filters.")).toBeInTheDocument();
    expect(screen.getByText("Showing 0 of 0 timeline entries")).toBeInTheDocument();
  });
});
