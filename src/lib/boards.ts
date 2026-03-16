import type { Prisma, Role } from "@prisma/client";

export interface BoardActor {
  id: string;
  role: Role;
}

export function getAccessibleBoardWhere(actor: BoardActor): Prisma.BoardWhereInput {
  if (actor.role === "ADMIN") {
    return {};
  }

  return {
    OR: [
      { ownerId: actor.id },
      {
        isPersonal: false,
        isOpenToWorkspace: true,
      },
      {
        members: {
          some: {
            userId: actor.id,
          },
        },
      },
    ],
  };
}

export function getManageableBoardWhere(actor: BoardActor): Prisma.BoardWhereInput {
  if (actor.role === "ADMIN") {
    return {};
  }

  return {
    ownerId: actor.id,
  };
}

export function sortUsersByDisplayName<T extends { name: string | null; email: string }>(
  users: T[]
): T[] {
  return [...users].sort((left, right) => {
    const leftLabel = left.name?.trim() || left.email;
    const rightLabel = right.name?.trim() || right.email;
    return leftLabel.localeCompare(rightLabel);
  });
}

export function getUserDisplayName(user: { name: string | null; email: string }): string {
  return user.name?.trim() || user.email;
}
