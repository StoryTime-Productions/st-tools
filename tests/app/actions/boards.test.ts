import { beforeEach, describe, expect, it, vi } from "vitest";

const IDS = {
  actor: "11111111-1111-4111-8111-111111111111",
  board: "22222222-2222-4222-8222-222222222222",
  column: "33333333-3333-4333-8333-333333333333",
  columnTwo: "44444444-4444-4444-8444-444444444444",
  card: "55555555-5555-4555-8555-555555555555",
  cardTwo: "66666666-6666-4666-8666-666666666666",
  member: "77777777-7777-4777-8777-777777777777",
};

type MockBoardAccess = {
  id: string;
  ownerId: string;
  isPersonal: boolean;
  isOpenToWorkspace: boolean;
  members: Array<{ userId: string }>;
};

function makeCurrentUser(role: "ADMIN" | "MEMBER" = "MEMBER") {
  return {
    id: IDS.actor,
    email: "owner@example.com",
    name: "Owner",
    avatarUrl: null,
    role,
    createdAt: new Date("2026-03-18T00:00:00.000Z"),
    updatedAt: new Date("2026-03-18T00:00:00.000Z"),
  };
}

function makeBoardAccess(overrides: Partial<MockBoardAccess> = {}): MockBoardAccess {
  return {
    id: IDS.board,
    ownerId: IDS.actor,
    isPersonal: false,
    isOpenToWorkspace: false,
    members: [{ userId: IDS.member }],
    ...overrides,
  };
}

function makeCardRecord(cardId = IDS.card) {
  return {
    id: cardId,
    title: "Card title",
    description: "Card description",
    position: 0,
    dueDate: new Date("2026-03-19T00:00:00.000Z"),
    labels: ["feature"],
    assigneeId: IDS.member,
    assignee: {
      id: IDS.member,
      name: "Teammate",
      email: "member@example.com",
      avatarUrl: null,
      role: "MEMBER",
    },
    checklistItems: [
      {
        id: "88888888-8888-4888-8888-888888888888",
        content: "Item one",
        completed: false,
        position: 0,
      },
    ],
    activities: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        eventType: "UPDATED",
        createdAt: new Date("2026-03-18T12:00:00.000Z"),
        details: { changedFields: ["title"] },
        actorUser: {
          id: IDS.actor,
          name: "Owner",
          email: "owner@example.com",
          avatarUrl: null,
          role: "MEMBER",
        },
      },
    ],
  };
}

function createPrismaMock() {
  const tx = {
    board: {
      update: vi.fn(),
    },
    column: {
      delete: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    card: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    cardChecklistItem: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    cardActivity: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  };

  const prisma = {
    board: {
      create: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    boardMember: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    column: {
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    card: {
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    cardChecklistItem: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    cardActivity: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (input: unknown) => {
      if (typeof input === "function") {
        return (input as (transactionClient: unknown) => Promise<unknown>)(tx);
      }

      if (Array.isArray(input)) {
        return Promise.all(input as Promise<unknown>[]);
      }

      return null;
    }),
  };

  return { prisma, tx };
}

async function loadBoardsModule() {
  const revalidatePath = vi.fn();
  const getCurrentUser = vi.fn();
  const getAccessibleBoardWhere = vi.fn(() => ({}));
  const getManageableBoardWhere = vi.fn(() => ({}));
  const { prisma, tx } = createPrismaMock();

  vi.doMock("next/cache", () => ({
    revalidatePath,
  }));

  vi.doMock("@/lib/get-current-user", () => ({
    getCurrentUser,
  }));

  vi.doMock("@/lib/boards", () => ({
    getAccessibleBoardWhere,
    getManageableBoardWhere,
  }));

  vi.doMock("@/lib/prisma", () => ({
    prisma,
  }));

  const actions = await import("@/app/actions/boards");

  return {
    ...actions,
    revalidatePath,
    getCurrentUser,
    getAccessibleBoardWhere,
    getManageableBoardWhere,
    prisma,
    tx,
  };
}

describe("boards actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns auth error for createBoardAction when user is missing", async () => {
    const { createBoardAction, getCurrentUser } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(null);

    const result = await createBoardAction({
      title: "Team board",
      collaborative: true,
      openToWorkspace: true,
    });

    expect(result).toEqual({ error: "Not authenticated" });
  });

  it("creates a collaborative board and revalidates views", async () => {
    const { createBoardAction, getCurrentUser, prisma, revalidatePath } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());
    prisma.board.create.mockResolvedValue({ id: IDS.board });

    const result = await createBoardAction({
      title: "Team board",
      collaborative: true,
      openToWorkspace: true,
    });

    expect(result).toEqual({ success: true, boardId: IDS.board });
    expect(prisma.board.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Team board",
          isPersonal: false,
          isOpenToWorkspace: true,
          ownerId: IDS.actor,
        }),
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/boards");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith(`/boards/${IDS.board}`);
  });

  it("renames board and handles not-found branch", async () => {
    const { renameBoardAction, getCurrentUser, prisma } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());

    prisma.board.updateMany.mockResolvedValue({ count: 0 });
    await expect(renameBoardAction(IDS.board, "Renamed")).resolves.toEqual({
      error: "Board not found",
    });

    prisma.board.updateMany.mockResolvedValue({ count: 1 });
    await expect(renameBoardAction(IDS.board, "Renamed")).resolves.toEqual({ success: true });
  });

  it("updates collaborative board access and rejects personal boards", async () => {
    const { updateBoardAccessAction, getCurrentUser, prisma } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());

    prisma.board.findFirst.mockResolvedValueOnce(makeBoardAccess({ isPersonal: true }));
    await expect(updateBoardAccessAction(IDS.board, true)).resolves.toEqual({
      error: "Collaborative board not found",
    });

    prisma.board.findFirst.mockResolvedValueOnce(makeBoardAccess({ isPersonal: false }));
    prisma.board.update.mockResolvedValue({ id: IDS.board });
    await expect(updateBoardAccessAction(IDS.board, true)).resolves.toEqual({ success: true });
  });

  it("adds members and validates collaborative constraints", async () => {
    const { addBoardMemberAction, getCurrentUser, prisma } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());

    prisma.board.findFirst.mockResolvedValueOnce(makeBoardAccess({ isOpenToWorkspace: true }));
    await expect(addBoardMemberAction(IDS.board, IDS.member)).resolves.toEqual({
      error: "This board is already open to the whole workspace",
    });

    prisma.board.findFirst.mockResolvedValueOnce(makeBoardAccess({ ownerId: IDS.member }));
    await expect(addBoardMemberAction(IDS.board, IDS.member)).resolves.toEqual({
      error: "The board owner already has access",
    });

    prisma.board.findFirst.mockResolvedValueOnce(makeBoardAccess());
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(addBoardMemberAction(IDS.board, IDS.member)).resolves.toEqual({
      error: "User not found",
    });

    prisma.board.findFirst.mockResolvedValueOnce(makeBoardAccess());
    prisma.user.findUnique.mockResolvedValueOnce({ id: IDS.member });
    await expect(addBoardMemberAction(IDS.board, IDS.member)).resolves.toEqual({ success: true });
    expect(prisma.boardMember.upsert).toHaveBeenCalled();
  });

  it("removes board members and rejects removing owner", async () => {
    const { removeBoardMemberAction, getCurrentUser, prisma } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());

    prisma.board.findFirst.mockResolvedValueOnce(makeBoardAccess({ ownerId: IDS.member }));
    await expect(removeBoardMemberAction(IDS.board, IDS.member)).resolves.toEqual({
      error: "The board owner cannot be removed",
    });

    prisma.board.findFirst.mockResolvedValueOnce(makeBoardAccess());
    await expect(removeBoardMemberAction(IDS.board, IDS.member)).resolves.toEqual({
      success: true,
    });
    expect(prisma.boardMember.deleteMany).toHaveBeenCalled();
  });

  it("creates, renames and deletes columns", async () => {
    const {
      createColumnAction,
      renameColumnAction,
      deleteColumnAction,
      getCurrentUser,
      prisma,
      tx,
    } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());

    prisma.board.findFirst.mockResolvedValue(makeBoardAccess());
    prisma.column.count.mockResolvedValue(1);
    prisma.column.create.mockResolvedValue({
      id: IDS.column,
      title: "New column",
      position: 1,
      cards: [],
    });

    await expect(createColumnAction(IDS.board)).resolves.toEqual({
      success: true,
      column: {
        id: IDS.column,
        title: "New column",
        position: 1,
        cards: [],
      },
    });

    prisma.column.findUnique.mockResolvedValueOnce(null);
    await expect(renameColumnAction(IDS.column, "Ready")).resolves.toEqual({
      error: "Column not found",
    });

    prisma.column.findUnique.mockResolvedValueOnce({
      id: IDS.column,
      boardId: IDS.board,
      _count: { cards: 0 },
    });
    await expect(renameColumnAction(IDS.column, "Ready")).resolves.toEqual({ success: true });

    prisma.column.findUnique.mockResolvedValueOnce({
      id: IDS.column,
      boardId: IDS.board,
      _count: { cards: 0 },
    });
    tx.column.findMany.mockResolvedValue([{ id: IDS.columnTwo }]);
    await expect(deleteColumnAction(IDS.column)).resolves.toEqual({ success: true });
    expect(tx.column.update).toHaveBeenCalledWith({
      where: { id: IDS.columnTwo },
      data: { position: 0 },
    });
  });

  it("reorders columns and validates stale order", async () => {
    const { reorderColumnsAction, getCurrentUser, prisma } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());

    prisma.board.findFirst.mockResolvedValueOnce({
      id: IDS.board,
      columns: [{ id: IDS.column }, { id: IDS.columnTwo }],
    });
    await expect(reorderColumnsAction(IDS.board, [IDS.column])).resolves.toEqual({
      error: "Column order is out of date. Refresh and try again.",
    });

    prisma.column.update.mockResolvedValue({ id: IDS.column });
    prisma.board.findFirst.mockResolvedValueOnce({
      id: IDS.board,
      columns: [{ id: IDS.column }, { id: IDS.columnTwo }],
    });

    await expect(reorderColumnsAction(IDS.board, [IDS.columnTwo, IDS.column])).resolves.toEqual({
      success: true,
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("creates and comments on cards", async () => {
    const { createCardAction, addCardCommentAction, getCurrentUser, prisma, tx } =
      await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());

    prisma.column.findUnique.mockResolvedValue({
      id: IDS.column,
      boardId: IDS.board,
      _count: { cards: 0 },
    });
    prisma.board.findFirst.mockResolvedValue(makeBoardAccess());
    prisma.card.count.mockResolvedValue(0);
    tx.card.create.mockResolvedValue({ id: IDS.card });
    prisma.card.findUnique.mockResolvedValue(makeCardRecord());

    const createResult = await createCardAction(IDS.column, "Write tests");
    expect(createResult).toMatchObject({ success: true });

    prisma.card.findUnique
      .mockResolvedValueOnce({
        id: IDS.card,
        title: "Card title",
        description: null,
        dueDate: null,
        labels: [],
        assigneeId: null,
        position: 0,
        columnId: IDS.column,
        checklistItems: [],
        column: { boardId: IDS.board },
      })
      .mockResolvedValueOnce(makeCardRecord());

    const commentResult = await addCardCommentAction(IDS.card, "Looks good");
    expect(commentResult).toMatchObject({ success: true });
    expect(tx.cardActivity.create).toHaveBeenCalled();
  });

  it("updates cards and validates due date and assignee", async () => {
    const { updateCardAction, getCurrentUser, prisma, tx } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());

    await expect(
      updateCardAction({
        cardId: IDS.card,
        title: "Task",
        description: null,
        labels: [],
        assigneeId: null,
        dueDate: "not-a-date",
        checklistItems: [],
      })
    ).resolves.toEqual({ error: "Invalid due date" });

    prisma.card.findUnique.mockResolvedValueOnce({
      id: IDS.card,
      title: "Task",
      description: null,
      dueDate: null,
      labels: [],
      assigneeId: null,
      position: 0,
      columnId: IDS.column,
      checklistItems: [],
      column: { boardId: IDS.board },
    });
    prisma.board.findFirst.mockResolvedValueOnce(makeBoardAccess({ members: [] }));

    await expect(
      updateCardAction({
        cardId: IDS.card,
        title: "Task",
        description: "Notes",
        labels: ["feature"],
        assigneeId: IDS.member,
        dueDate: "2026-03-20",
        checklistItems: [{ content: "One", completed: false }],
      })
    ).resolves.toEqual({ error: "Assignee must have access to this board" });

    prisma.card.findUnique
      .mockResolvedValueOnce({
        id: IDS.card,
        title: "Task",
        description: null,
        dueDate: null,
        labels: [],
        assigneeId: null,
        position: 0,
        columnId: IDS.column,
        checklistItems: [],
        column: { boardId: IDS.board },
      })
      .mockResolvedValueOnce(makeCardRecord());

    prisma.board.findFirst.mockResolvedValueOnce(
      makeBoardAccess({ members: [{ userId: IDS.member }] })
    );

    await expect(
      updateCardAction({
        cardId: IDS.card,
        title: "Task renamed",
        description: "Notes",
        labels: ["feature", "urgent"],
        assigneeId: IDS.member,
        dueDate: "2026-03-20",
        checklistItems: [{ content: "One", completed: true }],
      })
    ).resolves.toMatchObject({ success: true });

    expect(tx.card.update).toHaveBeenCalled();
    expect(tx.cardChecklistItem.deleteMany).toHaveBeenCalled();
  });

  it("deletes cards and reindexes remaining positions", async () => {
    const { deleteCardAction, getCurrentUser, prisma, tx } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());

    prisma.card.findUnique.mockResolvedValueOnce({
      id: IDS.card,
      title: "Task",
      description: null,
      dueDate: null,
      labels: [],
      assigneeId: null,
      position: 0,
      columnId: IDS.column,
      checklistItems: [],
      column: { boardId: IDS.board },
    });
    prisma.board.findFirst.mockResolvedValueOnce(makeBoardAccess());
    tx.card.findMany.mockResolvedValue([{ id: IDS.cardTwo }]);

    await expect(deleteCardAction(IDS.card)).resolves.toEqual({ success: true });
    expect(tx.card.update).toHaveBeenCalledWith({
      where: { id: IDS.cardTwo },
      data: { position: 0 },
    });
  });

  it("moves cards and rejects stale payloads", async () => {
    const { moveCardsAction, getCurrentUser, prisma, tx } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());

    prisma.board.findFirst.mockResolvedValueOnce({
      id: IDS.board,
      columns: [
        { id: IDS.column, cards: [{ id: IDS.card, position: 0 }] },
        { id: IDS.columnTwo, cards: [{ id: IDS.cardTwo, position: 0 }] },
      ],
    });

    await expect(
      moveCardsAction(IDS.board, [{ columnId: IDS.column, cardIds: [IDS.card] }])
    ).resolves.toEqual({ error: "Board columns are out of date. Refresh and try again." });

    prisma.board.findFirst.mockResolvedValueOnce({
      id: IDS.board,
      columns: [
        { id: IDS.column, cards: [{ id: IDS.card, position: 0 }] },
        { id: IDS.columnTwo, cards: [{ id: IDS.cardTwo, position: 0 }] },
      ],
    });

    await expect(
      moveCardsAction(IDS.board, [
        { columnId: IDS.column, cardIds: [IDS.cardTwo] },
        { columnId: IDS.columnTwo, cardIds: [IDS.card] },
      ])
    ).resolves.toMatchObject({ success: true });

    expect(tx.card.update).toHaveBeenCalled();
    expect(tx.cardActivity.createMany).toHaveBeenCalled();
  });

  it("deletes board when actor can manage it", async () => {
    const { deleteBoardAction, getCurrentUser, prisma } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());

    prisma.board.findFirst.mockResolvedValue(makeBoardAccess());

    await expect(deleteBoardAction(IDS.board)).resolves.toEqual({ success: true });
    expect(prisma.board.delete).toHaveBeenCalledWith({ where: { id: IDS.board } });
  });

  it("creates personal board via helper action", async () => {
    const { createPersonalBoardAction, getCurrentUser, prisma } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());
    prisma.board.create.mockResolvedValue({ id: IDS.board });

    await expect(createPersonalBoardAction({ title: "My board" })).resolves.toEqual({
      success: true,
      boardId: IDS.board,
    });

    expect(prisma.board.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "My board",
          isPersonal: true,
          isOpenToWorkspace: false,
        }),
      })
    );
  });

  it("returns not found when collaborative access update targets missing board", async () => {
    const { updateBoardAccessAction, getCurrentUser, prisma } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());
    prisma.board.findFirst.mockResolvedValueOnce(null);

    await expect(updateBoardAccessAction(IDS.board, true)).resolves.toEqual({
      error: "Collaborative board not found",
    });
  });

  it("returns board not found when creating column on inaccessible board", async () => {
    const { createColumnAction, getCurrentUser, prisma } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());
    prisma.board.findFirst.mockResolvedValueOnce(null);

    await expect(createColumnAction(IDS.board)).resolves.toEqual({ error: "Board not found" });
  });

  it("rejects card moves when card payload is stale", async () => {
    const { moveCardsAction, getCurrentUser, prisma } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());

    prisma.board.findFirst.mockResolvedValueOnce({
      id: IDS.board,
      columns: [
        { id: IDS.column, cards: [{ id: IDS.card, position: 0 }] },
        { id: IDS.columnTwo, cards: [{ id: IDS.cardTwo, position: 0 }] },
      ],
    });

    await expect(
      moveCardsAction(IDS.board, [
        { columnId: IDS.column, cardIds: [IDS.card] },
        { columnId: IDS.columnTwo, cardIds: [IDS.cardTwo, IDS.card] },
      ])
    ).resolves.toEqual({ error: "Card positions are out of date. Refresh and try again." });
  });

  it("moves cards without activity writes when positions are unchanged", async () => {
    const { moveCardsAction, getCurrentUser, prisma, tx } = await loadBoardsModule();
    getCurrentUser.mockResolvedValue(makeCurrentUser());

    prisma.board.findFirst.mockResolvedValueOnce({
      id: IDS.board,
      columns: [
        { id: IDS.column, cards: [{ id: IDS.card, position: 0 }] },
        { id: IDS.columnTwo, cards: [{ id: IDS.cardTwo, position: 0 }] },
      ],
    });

    await expect(
      moveCardsAction(IDS.board, [
        { columnId: IDS.column, cardIds: [IDS.card] },
        { columnId: IDS.columnTwo, cardIds: [IDS.cardTwo] },
      ])
    ).resolves.toEqual({ success: true });

    expect(tx.cardActivity.createMany).not.toHaveBeenCalled();
  });
});
