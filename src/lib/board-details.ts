import "server-only";

import type { Role } from "@prisma/client";
import type { BoardDetailsData, BoardMemberSummary } from "@/app/boards/types";
import { getAccessibleBoardWhere, sortUsersByDisplayName } from "@/lib/boards";
import { prisma } from "@/lib/prisma";

interface BoardDataActor {
  id: string;
  role: Role;
}

function mapMember(user: {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: BoardMemberSummary["role"];
}): BoardMemberSummary {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
  };
}

function getActiveMembers(
  board: {
    ownerId: string;
    isPersonal: boolean;
    isOpenToWorkspace: boolean;
    owner: {
      id: string;
      name: string | null;
      email: string;
      avatarUrl: string | null;
      role: BoardMemberSummary["role"];
    };
    members: Array<{
      user: {
        id: string;
        name: string | null;
        email: string;
        avatarUrl: string | null;
        role: BoardMemberSummary["role"];
      };
    }>;
  },
  allMembers: BoardMemberSummary[]
): BoardMemberSummary[] {
  const memberMap = new Map<string, BoardMemberSummary>();

  memberMap.set(board.owner.id, {
    ...mapMember(board.owner),
    isOwner: true,
  });

  if (board.isPersonal) {
    return Array.from(memberMap.values());
  }

  if (board.isOpenToWorkspace) {
    allMembers.forEach((member) => {
      memberMap.set(
        member.id,
        member.id === board.owner.id ? { ...member, isOwner: true } : member
      );
    });
    return Array.from(memberMap.values());
  }

  board.members.forEach(({ user }) => {
    memberMap.set(
      user.id,
      user.id === board.owner.id ? { ...mapMember(user), isOwner: true } : mapMember(user)
    );
  });

  return Array.from(memberMap.values());
}

function normaliseBoardData(
  board: {
    id: string;
    title: string;
    ownerId: string;
    isPersonal: boolean;
    isOpenToWorkspace: boolean;
    owner: {
      id: string;
      name: string | null;
      email: string;
      avatarUrl: string | null;
      role: BoardMemberSummary["role"];
    };
    members: Array<{
      user: {
        id: string;
        name: string | null;
        email: string;
        avatarUrl: string | null;
        role: BoardMemberSummary["role"];
      };
    }>;
    columns: Array<{
      id: string;
      title: string;
      position: number;
      cards: Array<{
        id: string;
        title: string;
        description: string | null;
        position: number;
        dueDate: Date | null;
        labels: string[];
        assigneeId: string | null;
        assignee: {
          id: string;
          name: string | null;
          email: string;
          avatarUrl: string | null;
          role: BoardMemberSummary["role"];
        } | null;
        checklistItems: Array<{
          id: string;
          content: string;
          completed: boolean;
          position: number;
        }>;
      }>;
    }>;
  },
  allMembers: BoardMemberSummary[],
  actor: BoardDataActor
): BoardDetailsData {
  const activeMembers = getActiveMembers(board, allMembers);

  return {
    id: board.id,
    title: board.title,
    isPersonal: board.isPersonal,
    isOpenToWorkspace: board.isOpenToWorkspace,
    ownerId: board.ownerId,
    canManage: actor.role === "ADMIN" || board.ownerId === actor.id,
    activeMembers,
    allMembers,
    columns: board.columns
      .sort((left, right) => left.position - right.position)
      .map((column) => ({
        id: column.id,
        title: column.title,
        position: column.position,
        cards: column.cards
          .sort((left, right) => left.position - right.position)
          .map((card) => ({
            id: card.id,
            title: card.title,
            description: card.description,
            position: card.position,
            dueDate: card.dueDate ? card.dueDate.toISOString().slice(0, 10) : null,
            labels: card.labels,
            assigneeId: card.assigneeId,
            assignee: card.assignee ? mapMember(card.assignee) : null,
            checklistItems: card.checklistItems
              .sort((left, right) => left.position - right.position)
              .map((item) => ({
                id: item.id,
                content: item.content,
                completed: item.completed,
                position: item.position,
              })),
          })),
      })),
  };
}

export async function getBoardDetailsData(
  boardId: string,
  actor: BoardDataActor
): Promise<BoardDetailsData | null> {
  const [board, workspaceUsers] = await Promise.all([
    prisma.board.findFirst({
      where: {
        id: boardId,
        ...getAccessibleBoardWhere({ id: actor.id, role: actor.role }),
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
                role: true,
              },
            },
          },
        },
        columns: {
          orderBy: {
            position: "asc",
          },
          include: {
            cards: {
              orderBy: {
                position: "asc",
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
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
      },
    }),
  ]);

  if (!board) {
    return null;
  }

  const allMembers = sortUsersByDisplayName(workspaceUsers.map(mapMember));
  return normaliseBoardData(board, allMembers, actor);
}
