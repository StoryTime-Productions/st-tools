import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BoardView } from "@/app/boards/[boardId]/_components/board-view";
import type { BoardDetailsData } from "@/app/boards/types";

const actionMocks = vi.hoisted(() => ({
  addBoardMemberAction: vi.fn(),
  addCardCommentAction: vi.fn(),
  createCardAction: vi.fn(),
  createColumnAction: vi.fn(),
  deleteBoardAction: vi.fn(),
  deleteCardAction: vi.fn(),
  deleteColumnAction: vi.fn(),
  moveCardsAction: vi.fn(),
  removeBoardMemberAction: vi.fn(),
  renameColumnAction: vi.fn(),
  reorderColumnsAction: vi.fn(),
  updateCardAction: vi.fn(),
  setCardGithubIssueAction: vi.fn(),
}));

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => {
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };

  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);

  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => {}),
  };

  return {
    channel,
    client,
    createClient: vi.fn(() => client),
  };
});

vi.mock("@/app/actions/boards", () => actionMocks);

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

vi.mock("sonner", () => ({
  toast: toastMocks,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: supabaseMocks.createClient,
}));

const IDS = {
  owner: "11111111-1111-4111-8111-111111111111",
  member: "22222222-2222-4222-8222-222222222222",
  invitee: "33333333-3333-4333-8333-333333333333",
  board: "44444444-4444-4444-8444-444444444444",
  column: "55555555-5555-4555-8555-555555555555",
  card: "66666666-6666-4666-8666-666666666666",
};

function makeBoard(): BoardDetailsData {
  const owner = {
    id: IDS.owner,
    name: "Owner",
    email: "owner@example.com",
    avatarUrl: null,
    role: "MEMBER" as const,
    isOwner: true,
  };

  const member = {
    id: IDS.member,
    name: "Teammate",
    email: "member@example.com",
    avatarUrl: null,
    role: "MEMBER" as const,
    isOwner: false,
  };

  const invitee = {
    id: IDS.invitee,
    name: "Invitee",
    email: "invitee@example.com",
    avatarUrl: null,
    role: "MEMBER" as const,
    isOwner: false,
  };

  return {
    id: IDS.board,
    title: "Roadmap",
    ownerId: IDS.owner,
    canManage: true,
    activeMembers: [owner, member],
    allMembers: [owner, member, invitee],
    tagOptions: ["feature"],
    canCreateTags: false,
    columns: [
      {
        id: IDS.column,
        title: "To do",
        position: 0,
        cards: [
          {
            id: IDS.card,
            title: "Seed card",
            description: "Initial description",
            position: 0,
            dueDate: "2026-03-20",
            labels: ["design"],
            githubIssue: {
              url: "https://github.com/org/repo/issues/7",
              label: "repo#7",
              state: "open",
            },
            assigneeId: IDS.member,
            assignee: member,
            checklistItems: [
              {
                id: "77777777-7777-4777-8777-777777777777",
                content: "First task",
                completed: false,
                position: 0,
              },
            ],
            activities: [
              {
                id: "88888888-8888-4888-8888-888888888888",
                eventType: "CREATED",
                createdAt: "2026-03-18T12:00:00.000Z",
                actor: owner,
                details: null,
              },
              {
                id: "99999999-9999-4999-8999-999999999999",
                eventType: "COMMENTED",
                createdAt: "2026-03-18T12:05:00.000Z",
                actor: member,
                details: { comment: "Looks good" },
              },
            ],
          },
        ],
      },
    ],
  };
}

function renderBoard(board = makeBoard(), initialCardId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BoardView board={board} initialCardId={initialCardId} />
    </QueryClientProvider>
  );
}

describe("BoardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    actionMocks.addBoardMemberAction.mockResolvedValue({ success: true });
    actionMocks.addCardCommentAction.mockResolvedValue({
      success: true,
      card: makeBoard().columns[0].cards[0],
    });
    actionMocks.createCardAction.mockResolvedValue({
      success: true,
      card: makeBoard().columns[0].cards[0],
    });
    actionMocks.createColumnAction.mockResolvedValue({
      success: true,
      column: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: "New column",
        position: 1,
        cards: [],
      },
    });
    actionMocks.deleteBoardAction.mockResolvedValue({ success: true });
    actionMocks.deleteCardAction.mockResolvedValue({ success: true });
    actionMocks.deleteColumnAction.mockResolvedValue({ success: true });
    actionMocks.moveCardsAction.mockResolvedValue({ success: true });
    actionMocks.removeBoardMemberAction.mockResolvedValue({ success: true });
    actionMocks.renameColumnAction.mockResolvedValue({ success: true });
    actionMocks.reorderColumnsAction.mockResolvedValue({ success: true });
    actionMocks.updateCardAction.mockResolvedValue({
      success: true,
      card: makeBoard().columns[0].cards[0],
    });

    supabaseMocks.channel.subscribe.mockImplementation((callback?: (status: string) => void) => {
      callback?.("SUBSCRIBED");
      return supabaseMocks.channel;
    });

    vi.spyOn(window, "confirm").mockReturnValue(true);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => makeBoard(),
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders board and executes primary interactions", async () => {
    renderBoard();

    expect(screen.getByText("Roadmap")).toBeInTheDocument();
    expect(screen.getByText("Board canvas")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /add column/i })[0]);
    await waitFor(() => {
      expect(actionMocks.createColumnAction).toHaveBeenCalledWith(IDS.board);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /add card/i })[0]);
    const cardTitleInput = await screen.findByPlaceholderText("Card title");
    fireEvent.change(cardTitleInput, { target: { value: "New task" } });
    fireEvent.keyDown(cardTitleInput, { key: "Enter" });

    await waitFor(() => {
      expect(actionMocks.createCardAction).toHaveBeenCalledWith(IDS.column, "New task");
    });

    fireEvent.click(screen.getByRole("button", { name: /seed card/i }));
    expect(await screen.findByRole("button", { name: /save changes/i })).toBeInTheDocument();

    const titleField = await screen.findByLabelText("Title");
    fireEvent.change(titleField, { target: { value: "Seed card updated" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(actionMocks.updateCardAction).toHaveBeenCalled();
    });

    const commentField = await screen.findByLabelText("Add comment");
    fireEvent.change(commentField, { target: { value: "Comment from test" } });
    fireEvent.click(screen.getByRole("button", { name: /^add comment$/i }));

    await waitFor(() => {
      expect(actionMocks.addCardCommentAction).toHaveBeenCalledWith(IDS.card, "Comment from test");
    });
  });

  it("opens the card from a deep link", () => {
    renderBoard(makeBoard(), IDS.card);

    expect(screen.getByRole("dialog")).toHaveTextContent("Seed card");
  });

  it("removes a board member", async () => {
    renderBoard();

    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => {
      expect(actionMocks.removeBoardMemberAction).toHaveBeenCalledWith(IDS.board, IDS.member);
    });
  });

  it("deletes a board and redirects", async () => {
    renderBoard();

    fireEvent.click(screen.getByRole("button", { name: /delete board/i }));

    await waitFor(() => {
      expect(actionMocks.deleteBoardAction).toHaveBeenCalledWith(IDS.board);
      expect(routerMocks.push).toHaveBeenCalledWith("/boards");
      expect(routerMocks.refresh).toHaveBeenCalled();
    });
  });

  it("surfaces action errors", async () => {
    actionMocks.createColumnAction.mockResolvedValueOnce({ error: "Unable to create column" });
    renderBoard();

    fireEvent.click(screen.getAllByRole("button", { name: /add column/i })[0]);

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Unable to create column");
    });
  });

  it("does not delete board when confirmation is cancelled", async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    renderBoard();

    fireEvent.click(screen.getByRole("button", { name: /delete board/i }));

    await waitFor(() => {
      expect(actionMocks.deleteBoardAction).not.toHaveBeenCalled();
    });
  });

  it("hides invite and remove controls when the viewer cannot manage the board", async () => {
    renderBoard({
      ...makeBoard(),
      canManage: false,
    });

    expect(screen.queryByText("Invite teammate")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^remove$/i })).not.toBeInTheDocument();
    expect(supabaseMocks.createClient).toHaveBeenCalled();
  });

  it("keeps add card form closed when title is blank", async () => {
    renderBoard();

    fireEvent.click(screen.getAllByRole("button", { name: /add card/i })[0]);
    const cardTitleInput = await screen.findByPlaceholderText("Card title");
    fireEvent.change(cardTitleInput, { target: { value: "   " } });
    fireEvent.keyDown(cardTitleInput, { key: "Enter" });

    await waitFor(() => {
      expect(actionMocks.createCardAction).not.toHaveBeenCalled();
    });
  });

  it("cancels add-card flow without creating a card", async () => {
    renderBoard();

    fireEvent.click(screen.getAllByRole("button", { name: /add card/i })[0]);
    expect(await screen.findByRole("button", { name: /cancel/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(actionMocks.createCardAction).not.toHaveBeenCalled();
    });
  });

  it("shows the linked issue on the card and unlinks it from the sheet", async () => {
    actionMocks.setCardGithubIssueAction
      .mockResolvedValueOnce({ error: "Paste a GitHub issue link" })
      .mockResolvedValueOnce({
        success: true,
        card: { ...makeBoard().columns[0].cards[0], githubIssue: null },
      });
    renderBoard(makeBoard(), IDS.card);

    expect(screen.getAllByText(/repo#7/)[0]).toHaveTextContent("repo#7 · open");

    const dialog = screen.getByRole("dialog");
    const unlink = within(dialog).getByRole("button", { name: "Unlink GitHub issue" });
    fireEvent.click(unlink);
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Paste a GitHub issue link"));

    await waitFor(() => expect(unlink).toBeEnabled());
    fireEvent.click(unlink);
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("GitHub issue unlinked"));
    expect(actionMocks.setCardGithubIssueAction).toHaveBeenCalledWith(IDS.card, null);
  });
});
