"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type {
  Board as PrismaBoard,
  Card as PrismaCard,
  CardChecklistItem as PrismaChecklistItem,
  Column as PrismaColumn,
  User as PrismaUser,
} from "@prisma/client";
import { getCurrentUser } from "@/lib/get-current-user";
import { getAccessibleBoardWhere, getManageableBoardWhere } from "@/lib/boards";
import { prisma } from "@/lib/prisma";
import type { BoardCardData, BoardChecklistItemData, BoardColumnData } from "@/app/boards/types";

export type BoardActionResult = { error: string } | { success: true; boardId?: string };
export type ColumnActionResult = { error: string } | { success: true; column?: BoardColumnData };
export type CardActionResult = { error: string } | { success: true; card?: BoardCardData };
export type GenericActionResult = { error: string } | { success: true };

const boardTitleSchema = z
  .string()
  .trim()
  .min(1, "Board name is required")
  .max(120, "Board name must be 120 characters or fewer");

const columnTitleSchema = z
  .string()
  .trim()
  .min(1, "Column title is required")
  .max(80, "Column title must be 80 characters or fewer");

const cardTitleSchema = z
  .string()
  .trim()
  .min(1, "Card title is required")
  .max(160, "Card title must be 160 characters or fewer");

const labelSchema = z
  .string()
  .trim()
  .min(1, "Label cannot be empty")
  .max(32, "Labels must be 32 characters or fewer");

const checklistItemSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Checklist item cannot be empty")
    .max(240, "Checklist items must be 240 characters or fewer"),
  completed: z.boolean(),
});

const createBoardSchema = z.object({
  title: boardTitleSchema,
  collaborative: z.boolean().default(false),
  openToWorkspace: z.boolean().default(false),
});

const updateBoardSchema = z.object({
  boardId: z.string().uuid(),
  title: boardTitleSchema,
});

const deleteBoardSchema = z.object({
  boardId: z.string().uuid(),
});

const updateBoardAccessSchema = z.object({
  boardId: z.string().uuid(),
  isOpenToWorkspace: z.boolean(),
});

const updateBoardMemberSchema = z.object({
  boardId: z.string().uuid(),
  userId: z.string().uuid(),
});

const createColumnSchema = z.object({
  boardId: z.string().uuid(),
});

const renameColumnSchema = z.object({
  columnId: z.string().uuid(),
  title: columnTitleSchema,
});

const deleteColumnSchema = z.object({
  columnId: z.string().uuid(),
});

const reorderColumnsSchema = z.object({
  boardId: z.string().uuid(),
  columnIds: z.array(z.string().uuid()),
});

const createCardSchema = z.object({
  columnId: z.string().uuid(),
  title: cardTitleSchema,
});

const updateCardSchema = z.object({
  cardId: z.string().uuid(),
  title: cardTitleSchema,
  description: z.string().trim().max(5000, "Description is too long").nullable(),
  labels: z.array(labelSchema).max(12, "Use 12 labels or fewer"),
  assigneeId: z.string().uuid().nullable(),
  dueDate: z.string().nullable(),
  checklistItems: z.array(checklistItemSchema).max(50, "Use 50 checklist items or fewer"),
});

const deleteCardSchema = z.object({
  cardId: z.string().uuid(),
});

const moveCardsSchema = z.object({
  boardId: z.string().uuid(),
  columns: z.array(
    z.object({
      columnId: z.string().uuid(),
      cardIds: z.array(z.string().uuid()),
    })
  ),
});

const defaultColumns = ["To do", "In progress", "Done"];

type ChecklistItemRecord = PrismaChecklistItem;
type UserSummaryRecord = Pick<PrismaUser, "id" | "name" | "email" | "avatarUrl" | "role">;
type CardRecord = PrismaCard & {
  assignee: UserSummaryRecord | null;
  checklistItems: ChecklistItemRecord[];
};
type ColumnRecord = PrismaColumn & { cards: CardRecord[] };

type BoardAccessRecord = Pick<
  PrismaBoard,
  "id" | "ownerId" | "isPersonal" | "isOpenToWorkspace"
> & {
  members?: Array<{ userId: string }>;
};

function mapChecklistItem(item: ChecklistItemRecord): BoardChecklistItemData {
  return {
    id: item.id,
    content: item.content,
    completed: item.completed,
    position: item.position,
  };
}

function mapCard(card: CardRecord): BoardCardData {
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    position: card.position,
    dueDate: card.dueDate ? card.dueDate.toISOString().slice(0, 10) : null,
    labels: card.labels,
    assigneeId: card.assigneeId,
    assignee: card.assignee,
    checklistItems: card.checklistItems
      .sort((left, right) => left.position - right.position)
      .map(mapChecklistItem),
  };
}

function mapColumn(column: ColumnRecord): BoardColumnData {
  return {
    id: column.id,
    title: column.title,
    position: column.position,
    cards: column.cards.sort((left, right) => left.position - right.position).map(mapCard),
  };
}

function revalidateBoardViews(boardId?: string) {
  revalidatePath("/boards");
  revalidatePath("/dashboard");

  if (boardId) {
    revalidatePath(`/boards/${boardId}`);
  }
}

function normaliseDescription(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function parseDueDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid due date");
  }

  return parsed;
}

async function getAccessibleBoard(
  actor: { id: string; role: PrismaUser["role"] },
  boardId: string
) {
  return prisma.board.findFirst({
    where: {
      id: boardId,
      ...getAccessibleBoardWhere(actor),
    },
    select: {
      id: true,
      ownerId: true,
      isPersonal: true,
      isOpenToWorkspace: true,
      members: {
        select: {
          userId: true,
        },
      },
    },
  });
}

async function getManageableBoard(
  actor: { id: string; role: PrismaUser["role"] },
  boardId: string
) {
  return prisma.board.findFirst({
    where: {
      id: boardId,
      ...getManageableBoardWhere(actor),
    },
    select: {
      id: true,
      ownerId: true,
      isPersonal: true,
      isOpenToWorkspace: true,
      members: {
        select: {
          userId: true,
        },
      },
    },
  });
}

async function getColumnWithBoard(columnId: string) {
  return prisma.column.findUnique({
    where: { id: columnId },
    select: {
      id: true,
      boardId: true,
      _count: {
        select: {
          cards: true,
        },
      },
    },
  });
}

async function getCardWithBoard(cardId: string) {
  return prisma.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      columnId: true,
      column: {
        select: {
          boardId: true,
        },
      },
    },
  });
}

async function getCardRecord(cardId: string) {
  return prisma.card.findUnique({
    where: { id: cardId },
    include: {
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          role: true,
        },
      },
      checklistItems: {
        orderBy: {
          position: "asc",
        },
      },
    },
  });
}

async function isValidAssignee(board: BoardAccessRecord, assigneeId: string): Promise<boolean> {
  if (board.isPersonal) {
    return board.ownerId === assigneeId;
  }

  if (board.isOpenToWorkspace) {
    const user = await prisma.user.findUnique({
      where: { id: assigneeId },
      select: { id: true },
    });
    return Boolean(user);
  }

  return (
    board.ownerId === assigneeId ||
    board.members?.some((member) => member.userId === assigneeId) === true
  );
}

export async function createBoardAction(
  values: z.infer<typeof createBoardSchema>
): Promise<BoardActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  const parsed = createBoardSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const collaborative = parsed.data.collaborative;

  const board = await prisma.board.create({
    data: {
      title: parsed.data.title,
      isPersonal: !collaborative,
      isOpenToWorkspace: collaborative ? parsed.data.openToWorkspace : false,
      ownerId: currentUser.id,
      columns: {
        create: defaultColumns.map((title, index) => ({
          title,
          position: index,
        })),
      },
    },
    select: { id: true },
  });

  revalidateBoardViews(board.id);
  return { success: true, boardId: board.id };
}

export async function createPersonalBoardAction(
  values: Pick<z.infer<typeof createBoardSchema>, "title">
): Promise<BoardActionResult> {
  return createBoardAction({
    title: values.title,
    collaborative: false,
    openToWorkspace: false,
  });
}

export async function renameBoardAction(
  boardId: string,
  title: string
): Promise<BoardActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  const parsed = updateBoardSchema.safeParse({ boardId, title });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await prisma.board.updateMany({
    where: {
      id: parsed.data.boardId,
      ...getManageableBoardWhere({ id: currentUser.id, role: currentUser.role }),
    },
    data: {
      title: parsed.data.title,
    },
  });

  if (result.count === 0) {
    return { error: "Board not found" };
  }

  revalidateBoardViews(parsed.data.boardId);
  return { success: true };
}

export async function deleteBoardAction(boardId: string): Promise<BoardActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  const parsed = deleteBoardSchema.safeParse({ boardId });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const board = await getManageableBoard(
    { id: currentUser.id, role: currentUser.role },
    parsed.data.boardId
  );
  if (!board) {
    return { error: "Board not found" };
  }

  await prisma.board.delete({
    where: {
      id: board.id,
    },
  });

  revalidateBoardViews(board.id);
  return { success: true };
}

export async function updateBoardAccessAction(
  boardId: string,
  isOpenToWorkspace: boolean
): Promise<GenericActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  const parsed = updateBoardAccessSchema.safeParse({ boardId, isOpenToWorkspace });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const board = await getManageableBoard(
    { id: currentUser.id, role: currentUser.role },
    parsed.data.boardId
  );
  if (!board || board.isPersonal) {
    return { error: "Collaborative board not found" };
  }

  await prisma.board.update({
    where: { id: board.id },
    data: {
      isOpenToWorkspace: parsed.data.isOpenToWorkspace,
    },
  });

  revalidateBoardViews(board.id);
  return { success: true };
}

export async function addBoardMemberAction(
  boardId: string,
  userId: string
): Promise<GenericActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  const parsed = updateBoardMemberSchema.safeParse({ boardId, userId });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const board = await getManageableBoard(
    { id: currentUser.id, role: currentUser.role },
    parsed.data.boardId
  );
  if (!board || board.isPersonal) {
    return { error: "Collaborative board not found" };
  }

  if (board.isOpenToWorkspace) {
    return { error: "This board is already open to the whole workspace" };
  }

  if (board.ownerId === parsed.data.userId) {
    return { error: "The board owner already has access" };
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true },
  });
  if (!user) {
    return { error: "User not found" };
  }

  await prisma.boardMember.upsert({
    where: {
      boardId_userId: {
        boardId: board.id,
        userId: parsed.data.userId,
      },
    },
    create: {
      boardId: board.id,
      userId: parsed.data.userId,
    },
    update: {},
  });

  revalidateBoardViews(board.id);
  return { success: true };
}

export async function removeBoardMemberAction(
  boardId: string,
  userId: string
): Promise<GenericActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  const parsed = updateBoardMemberSchema.safeParse({ boardId, userId });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const board = await getManageableBoard(
    { id: currentUser.id, role: currentUser.role },
    parsed.data.boardId
  );
  if (!board || board.isPersonal) {
    return { error: "Collaborative board not found" };
  }

  if (board.ownerId === parsed.data.userId) {
    return { error: "The board owner cannot be removed" };
  }

  await prisma.boardMember.deleteMany({
    where: {
      boardId: board.id,
      userId: parsed.data.userId,
    },
  });

  revalidateBoardViews(board.id);
  return { success: true };
}

export async function createColumnAction(boardId: string): Promise<ColumnActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  const parsed = createColumnSchema.safeParse({ boardId });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const board = await getAccessibleBoard(
    { id: currentUser.id, role: currentUser.role },
    parsed.data.boardId
  );
  if (!board) {
    return { error: "Board not found" };
  }

  const position = await prisma.column.count({
    where: {
      boardId: board.id,
    },
  });

  const column = await prisma.column.create({
    data: {
      boardId: board.id,
      title: "New column",
      position,
    },
    include: {
      cards: {
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              role: true,
            },
          },
          checklistItems: {
            orderBy: {
              position: "asc",
            },
          },
        },
      },
    },
  });

  revalidateBoardViews(board.id);
  return { success: true, column: mapColumn(column) };
}

export async function renameColumnAction(
  columnId: string,
  title: string
): Promise<GenericActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  const parsed = renameColumnSchema.safeParse({ columnId, title });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const column = await getColumnWithBoard(parsed.data.columnId);
  if (!column) {
    return { error: "Column not found" };
  }

  const board = await getAccessibleBoard(
    { id: currentUser.id, role: currentUser.role },
    column.boardId
  );
  if (!board) {
    return { error: "Board not found" };
  }

  await prisma.column.update({
    where: { id: column.id },
    data: {
      title: parsed.data.title,
    },
  });

  revalidateBoardViews(board.id);
  return { success: true };
}

export async function deleteColumnAction(columnId: string): Promise<GenericActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  const parsed = deleteColumnSchema.safeParse({ columnId });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const column = await getColumnWithBoard(parsed.data.columnId);
  if (!column) {
    return { error: "Column not found" };
  }

  const board = await getAccessibleBoard(
    { id: currentUser.id, role: currentUser.role },
    column.boardId
  );
  if (!board) {
    return { error: "Board not found" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.column.delete({
      where: { id: column.id },
    });

    const remaining = await tx.column.findMany({
      where: { boardId: board.id },
      orderBy: { position: "asc" },
      select: { id: true },
    });

    await Promise.all(
      remaining.map((item, index) =>
        tx.column.update({
          where: { id: item.id },
          data: { position: index },
        })
      )
    );
  });

  revalidateBoardViews(board.id);
  return { success: true };
}

export async function reorderColumnsAction(
  boardId: string,
  columnIds: string[]
): Promise<GenericActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  const parsed = reorderColumnsSchema.safeParse({ boardId, columnIds });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const board = await prisma.board.findFirst({
    where: {
      id: parsed.data.boardId,
      ...getAccessibleBoardWhere({ id: currentUser.id, role: currentUser.role }),
    },
    select: {
      id: true,
      columns: {
        select: { id: true },
      },
    },
  });
  if (!board) {
    return { error: "Board not found" };
  }

  const existingIds = board.columns.map((column) => column.id).sort();
  const nextIds = [...parsed.data.columnIds].sort();

  if (
    existingIds.length !== nextIds.length ||
    existingIds.some((value, index) => value !== nextIds[index])
  ) {
    return { error: "Column order is out of date. Refresh and try again." };
  }

  await prisma.$transaction(
    parsed.data.columnIds.map((columnId, index) =>
      prisma.column.update({
        where: { id: columnId },
        data: { position: index },
      })
    )
  );

  revalidateBoardViews(board.id);
  return { success: true };
}

export async function createCardAction(columnId: string, title: string): Promise<CardActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  const parsed = createCardSchema.safeParse({ columnId, title });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const column = await getColumnWithBoard(parsed.data.columnId);
  if (!column) {
    return { error: "Column not found" };
  }

  const board = await getAccessibleBoard(
    { id: currentUser.id, role: currentUser.role },
    column.boardId
  );
  if (!board) {
    return { error: "Board not found" };
  }

  const position = await prisma.card.count({
    where: {
      columnId: column.id,
    },
  });

  const card = await prisma.card.create({
    data: {
      columnId: column.id,
      title: parsed.data.title,
      position,
      labels: [],
    },
    include: {
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          role: true,
        },
      },
      checklistItems: {
        orderBy: {
          position: "asc",
        },
      },
    },
  });

  revalidateBoardViews(board.id);
  return { success: true, card: mapCard(card) };
}

export async function updateCardAction(
  values: z.infer<typeof updateCardSchema>
): Promise<CardActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  const parsed = updateCardSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let dueDate: Date | null;
  try {
    dueDate = parseDueDate(parsed.data.dueDate);
  } catch {
    return { error: "Invalid due date" };
  }

  const card = await getCardWithBoard(parsed.data.cardId);
  if (!card) {
    return { error: "Card not found" };
  }

  const board = await getAccessibleBoard(
    { id: currentUser.id, role: currentUser.role },
    card.column.boardId
  );
  if (!board) {
    return { error: "Board not found" };
  }

  if (parsed.data.assigneeId) {
    const validAssignee = await isValidAssignee(board, parsed.data.assigneeId);
    if (!validAssignee) {
      return { error: "Assignee must have access to this board" };
    }
  }

  const labels = parsed.data.labels.map((label) => label.trim()).filter(Boolean);
  const checklistItems = parsed.data.checklistItems.map((item) => ({
    content: item.content.trim(),
    completed: item.completed,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.card.update({
      where: { id: card.id },
      data: {
        title: parsed.data.title,
        description: normaliseDescription(parsed.data.description),
        labels,
        assigneeId: parsed.data.assigneeId,
        dueDate,
      },
    });

    await tx.cardChecklistItem.deleteMany({
      where: {
        cardId: card.id,
      },
    });

    if (checklistItems.length > 0) {
      await tx.cardChecklistItem.createMany({
        data: checklistItems.map((item, index) => ({
          cardId: card.id,
          content: item.content,
          completed: item.completed,
          position: index,
        })),
      });
    }
  });

  const updatedCard = await getCardRecord(card.id);
  if (!updatedCard) {
    return { error: "Card not found" };
  }

  revalidateBoardViews(board.id);
  return { success: true, card: mapCard(updatedCard) };
}

export async function deleteCardAction(cardId: string): Promise<GenericActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  const parsed = deleteCardSchema.safeParse({ cardId });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const card = await getCardWithBoard(parsed.data.cardId);
  if (!card) {
    return { error: "Card not found" };
  }

  const board = await getAccessibleBoard(
    { id: currentUser.id, role: currentUser.role },
    card.column.boardId
  );
  if (!board) {
    return { error: "Board not found" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.card.delete({
      where: { id: card.id },
    });

    const remainingCards = await tx.card.findMany({
      where: { columnId: card.columnId },
      orderBy: { position: "asc" },
      select: { id: true },
    });

    await Promise.all(
      remainingCards.map((item, index) =>
        tx.card.update({
          where: { id: item.id },
          data: { position: index },
        })
      )
    );
  });

  revalidateBoardViews(board.id);
  return { success: true };
}

export async function moveCardsAction(
  boardId: string,
  columns: Array<{ columnId: string; cardIds: string[] }>
): Promise<GenericActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  const parsed = moveCardsSchema.safeParse({ boardId, columns });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const board = await prisma.board.findFirst({
    where: {
      id: parsed.data.boardId,
      ...getAccessibleBoardWhere({ id: currentUser.id, role: currentUser.role }),
    },
    select: {
      id: true,
      columns: {
        select: {
          id: true,
          cards: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });
  if (!board) {
    return { error: "Board not found" };
  }

  const existingColumnIds = board.columns.map((column) => column.id).sort();
  const nextColumnIds = parsed.data.columns.map((column) => column.columnId).sort();
  if (
    existingColumnIds.length !== nextColumnIds.length ||
    existingColumnIds.some((value, index) => value !== nextColumnIds[index])
  ) {
    return { error: "Board columns are out of date. Refresh and try again." };
  }

  const existingCardIds = board.columns
    .flatMap((column) => column.cards.map((card) => card.id))
    .sort();
  const nextCardIds = parsed.data.columns.flatMap((column) => column.cardIds).sort();
  if (
    existingCardIds.length !== nextCardIds.length ||
    existingCardIds.some((value, index) => value !== nextCardIds[index])
  ) {
    return { error: "Card positions are out of date. Refresh and try again." };
  }

  await prisma.$transaction(
    parsed.data.columns.flatMap((column) =>
      column.cardIds.map((cardId, index) =>
        prisma.card.update({
          where: { id: cardId },
          data: {
            columnId: column.columnId,
            position: index,
          },
        })
      )
    )
  );

  revalidateBoardViews(board.id);
  return { success: true };
}
