import "server-only";

import type { Prisma, Role } from "@prisma/client";
import type {
  BoardCardActivityData,
  BoardDetailsData,
  BoardMemberSummary,
} from "@/app/boards/types";
import { getAccessibleBoardWhere, sortUsersByDisplayName } from "@/lib/boards";
import { prisma } from "@/lib/prisma";

const CARD_ACTIVITY_RECENT_LIMIT = 50;

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

function mapActivityDetails(details: Prisma.JsonValue | null): BoardCardActivityData["details"] {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }

  const payload = details as Record<string, unknown>;
  const changedFields = Array.isArray(payload.changedFields)
    ? payload.changedFields.filter((item): item is string => typeof item === "string")
    : undefined;

  const fromColumnId = typeof payload.fromColumnId === "string" ? payload.fromColumnId : undefined;
  const toColumnId = typeof payload.toColumnId === "string" ? payload.toColumnId : undefined;
  const fromPosition = typeof payload.fromPosition === "number" ? payload.fromPosition : undefined;
  const toPosition = typeof payload.toPosition === "number" ? payload.toPosition : undefined;
  const commentCandidate = typeof payload.comment === "string" ? payload.comment.trim() : "";
  const comment = commentCandidate.length > 0 ? commentCandidate : undefined;

  if (
    !changedFields &&
    !fromColumnId &&
    !toColumnId &&
    !comment &&
    typeof fromPosition === "undefined" &&
    typeof toPosition === "undefined"
  ) {
    return null;
  }

  return {
    changedFields,
    fromColumnId,
    toColumnId,
    fromPosition,
    toPosition,
    comment,
  };
}

function mapCardActivity(activity: {
  id: string;
  eventType: BoardCardActivityData["eventType"];
  createdAt: Date;
  details: Prisma.JsonValue | null;
  actorUser: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
    role: BoardMemberSummary["role"];
  } | null;
}): BoardCardActivityData {
  return {
    id: activity.id,
    eventType: activity.eventType,
    createdAt: activity.createdAt.toISOString(),
    details: mapActivityDetails(activity.details),
    actor: activity.actorUser ? mapMember(activity.actorUser) : null,
  };
}

function getActiveMembers(board: {
  ownerId: string;
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
}): BoardMemberSummary[] {
  const memberMap = new Map<string, BoardMemberSummary>();

  memberMap.set(board.owner.id, {
    ...mapMember(board.owner),
    isOwner: true,
  });

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
        tags: Array<{ name: string }>;
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
        activities: Array<{
          id: string;
          eventType: BoardCardActivityData["eventType"];
          createdAt: Date;
          details: Prisma.JsonValue | null;
          actorUser: {
            id: string;
            name: string | null;
            email: string;
            avatarUrl: string | null;
            role: BoardMemberSummary["role"];
          } | null;
        }>;
      }>;
    }>;
  },
  allMembers: BoardMemberSummary[],
  tagOptions: string[],
  actor: BoardDataActor
): BoardDetailsData {
  const activeMembers = getActiveMembers(board);

  return {
    id: board.id,
    title: board.title,
    ownerId: board.ownerId,
    canManage: actor.role === "ADMIN" || board.ownerId === actor.id,
    activeMembers,
    allMembers,
    tagOptions,
    canCreateTags: actor.role === "ADMIN",
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
            labels: card.tags.map((tag) => tag.name),
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
            activities: card.activities
              .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
              .map(mapCardActivity),
          })),
      })),
  };
}

export async function getBoardDetailsData(
  boardId: string,
  actor: BoardDataActor
): Promise<BoardDetailsData | null> {
  const [board, workspaceUsers, tags] = await Promise.all([
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
                tags: {
                  select: { name: true },
                  orderBy: { name: "asc" },
                },
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
                activities: {
                  orderBy: {
                    createdAt: "desc",
                  },
                  take: CARD_ACTIVITY_RECENT_LIMIT,
                  include: {
                    actorUser: {
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
    prisma.tag.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!board) {
    return null;
  }

  const allMembers = sortUsersByDisplayName(workspaceUsers.map(mapMember));
  return normaliseBoardData(
    board,
    allMembers,
    tags.map((tag) => tag.name),
    actor
  );
}
