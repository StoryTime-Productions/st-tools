import { beforeEach, describe, expect, it, vi } from "vitest";

type TestUser = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: "ADMIN" | "MEMBER";
};

function buildUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: overrides.id ?? "user-1",
    name: overrides.name ?? "User One",
    email: overrides.email ?? "user-1@example.com",
    avatarUrl: overrides.avatarUrl ?? null,
    role: overrides.role ?? "MEMBER",
  };
}

async function loadBoardDetailsModule() {
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const getAccessibleBoardWhere = vi.fn();
  const sortUsersByDisplayName = vi.fn((users: unknown[]) => users);

  vi.doMock("@/lib/prisma", () => ({
    prisma: {
      board: {
        findFirst,
      },
      user: {
        findMany,
      },
    },
  }));

  vi.doMock("@/lib/boards", () => ({
    getAccessibleBoardWhere,
    sortUsersByDisplayName,
  }));

  const { getBoardDetailsData } = await import("@/lib/board-details");

  return {
    getBoardDetailsData,
    findFirst,
    findMany,
    getAccessibleBoardWhere,
    sortUsersByDisplayName,
  };
}

describe("getBoardDetailsData", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns null when board is not accessible", async () => {
    const {
      getBoardDetailsData,
      findFirst,
      findMany,
      getAccessibleBoardWhere,
      sortUsersByDisplayName,
    } = await loadBoardDetailsModule();

    getAccessibleBoardWhere.mockReturnValueOnce({
      OR: [{ ownerId: "member-1" }],
    });
    findFirst.mockResolvedValueOnce(null);
    findMany.mockResolvedValueOnce([]);

    const result = await getBoardDetailsData("board-1", {
      id: "member-1",
      role: "MEMBER",
    });

    expect(result).toBeNull();
    expect(getAccessibleBoardWhere).toHaveBeenCalledWith({
      id: "member-1",
      role: "MEMBER",
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "board-1",
          OR: [{ ownerId: "member-1" }],
        },
      })
    );
    expect(sortUsersByDisplayName).not.toHaveBeenCalled();
  });

  it("normalises open workspace board data and applies sorting/mapping rules", async () => {
    const {
      getBoardDetailsData,
      findFirst,
      findMany,
      getAccessibleBoardWhere,
      sortUsersByDisplayName,
    } = await loadBoardDetailsModule();

    const owner = buildUser({
      id: "owner-1",
      name: "Olivia Owner",
      email: "owner@example.com",
      role: "ADMIN",
    });
    const memberA = buildUser({
      id: "member-a",
      name: "Amy Member",
      email: "amy@example.com",
      role: "MEMBER",
    });
    const memberB = buildUser({
      id: "member-b",
      name: "Ben Member",
      email: "ben@example.com",
      role: "MEMBER",
    });

    const board = {
      id: "board-2",
      title: "Product roadmap",
      ownerId: owner.id,
      isPersonal: false,
      isOpenToWorkspace: true,
      owner,
      members: [{ user: memberB }],
      columns: [
        {
          id: "col-2",
          title: "Doing",
          position: 2,
          cards: [
            {
              id: "card-2",
              title: "Second card",
              description: "Follow-up",
              position: 2,
              dueDate: null,
              labels: ["ops"],
              assigneeId: null,
              assignee: null,
              checklistItems: [
                {
                  id: "check-2",
                  content: "Second item",
                  completed: true,
                  position: 2,
                },
                {
                  id: "check-1",
                  content: "First item",
                  completed: false,
                  position: 1,
                },
              ],
              activities: [
                {
                  id: "activity-old",
                  eventType: "UPDATED",
                  createdAt: new Date("2026-03-10T08:00:00.000Z"),
                  details: {
                    changedFields: ["title", 123],
                    fromColumnId: "col-1",
                    toColumnId: "col-2",
                    fromPosition: 2,
                    toPosition: 1,
                    comment: "  moved to doing  ",
                  },
                  actorUser: owner,
                },
                {
                  id: "activity-new",
                  eventType: "COMMENTED",
                  createdAt: new Date("2026-03-10T10:00:00.000Z"),
                  details: {},
                  actorUser: null,
                },
              ],
            },
            {
              id: "card-1",
              title: "First card",
              description: null,
              position: 1,
              dueDate: new Date("2026-03-20T00:00:00.000Z"),
              labels: ["frontend", "priority"],
              assigneeId: memberA.id,
              assignee: memberA,
              checklistItems: [],
              activities: [],
            },
          ],
        },
        {
          id: "col-1",
          title: "Todo",
          position: 1,
          cards: [],
        },
      ],
    };

    const workspaceUsers = [memberB, owner, memberA];
    const sortedWorkspaceUsers = [memberA, owner, memberB];

    getAccessibleBoardWhere.mockReturnValueOnce({
      OR: [{ ownerId: "member-admin" }],
    });
    findFirst.mockResolvedValueOnce(board);
    findMany.mockResolvedValueOnce(workspaceUsers);
    sortUsersByDisplayName.mockReturnValueOnce(sortedWorkspaceUsers);

    const result = await getBoardDetailsData("board-2", {
      id: "member-admin",
      role: "ADMIN",
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe("board-2");
    expect(result?.canManage).toBe(true);

    expect(sortUsersByDisplayName).toHaveBeenCalledWith([
      expect.objectContaining({ id: memberB.id }),
      expect.objectContaining({ id: owner.id }),
      expect.objectContaining({ id: memberA.id }),
    ]);

    expect(result?.allMembers.map((member) => member.id)).toEqual([
      memberA.id,
      owner.id,
      memberB.id,
    ]);

    expect(result?.activeMembers.map((member) => member.id)).toEqual([
      owner.id,
      memberA.id,
      memberB.id,
    ]);
    expect(result?.activeMembers.find((member) => member.id === owner.id)?.isOwner).toBe(true);

    // Columns and cards are position-sorted.
    expect(result?.columns.map((column) => column.id)).toEqual(["col-1", "col-2"]);
    expect(result?.columns[1]?.cards.map((card) => card.id)).toEqual(["card-1", "card-2"]);

    const sortedCard = result?.columns[1]?.cards[0];
    expect(sortedCard?.dueDate).toBe("2026-03-20");
    expect(sortedCard?.assignee?.id).toBe(memberA.id);

    const activityCard = result?.columns[1]?.cards[1];
    expect(activityCard?.checklistItems.map((item) => item.id)).toEqual(["check-1", "check-2"]);
    expect(activityCard?.activities.map((activity) => activity.id)).toEqual([
      "activity-new",
      "activity-old",
    ]);
    expect(activityCard?.activities[0]?.details).toBeNull();
    expect(activityCard?.activities[1]?.details).toEqual({
      changedFields: ["title"],
      fromColumnId: "col-1",
      toColumnId: "col-2",
      fromPosition: 2,
      toPosition: 1,
      comment: "moved to doing",
    });
    expect(activityCard?.activities[1]?.actor).toMatchObject({
      id: owner.id,
      email: owner.email,
    });
  });

  it("limits personal boards to owner in active members", async () => {
    const {
      getBoardDetailsData,
      findFirst,
      findMany,
      getAccessibleBoardWhere,
      sortUsersByDisplayName,
    } = await loadBoardDetailsModule();

    const owner = buildUser({
      id: "owner-p",
      name: "Personal Owner",
      email: "owner-p@example.com",
      role: "MEMBER",
    });
    const outsider = buildUser({
      id: "outsider-p",
      name: "Outside User",
      email: "outside@example.com",
      role: "MEMBER",
    });

    getAccessibleBoardWhere.mockReturnValueOnce({
      OR: [{ ownerId: owner.id }],
    });
    findFirst.mockResolvedValueOnce({
      id: "board-personal",
      title: "Private board",
      ownerId: owner.id,
      isPersonal: true,
      isOpenToWorkspace: false,
      owner,
      members: [{ user: outsider }],
      columns: [],
    });
    findMany.mockResolvedValueOnce([owner, outsider]);
    sortUsersByDisplayName.mockImplementationOnce((users: unknown[]) => users);

    const result = await getBoardDetailsData("board-personal", {
      id: owner.id,
      role: "MEMBER",
    });

    expect(result?.canManage).toBe(true);
    expect(result?.activeMembers).toHaveLength(1);
    expect(result?.activeMembers[0]).toMatchObject({
      id: owner.id,
      isOwner: true,
    });
  });

  it("includes only explicit members for non-workspace collaborative boards", async () => {
    const {
      getBoardDetailsData,
      findFirst,
      findMany,
      getAccessibleBoardWhere,
      sortUsersByDisplayName,
    } = await loadBoardDetailsModule();

    const owner = buildUser({
      id: "owner-r",
      name: "Restricted Owner",
      email: "owner-r@example.com",
      role: "ADMIN",
    });
    const invited = buildUser({
      id: "invited-r",
      name: "Invited Member",
      email: "invited@example.com",
      role: "MEMBER",
    });
    const outsider = buildUser({
      id: "outsider-r",
      name: "Outsider Member",
      email: "outsider@example.com",
      role: "MEMBER",
    });

    getAccessibleBoardWhere.mockReturnValueOnce({
      OR: [{ ownerId: invited.id }],
    });
    findFirst.mockResolvedValueOnce({
      id: "board-restricted",
      title: "Restricted board",
      ownerId: owner.id,
      isPersonal: false,
      isOpenToWorkspace: false,
      owner,
      members: [{ user: invited }],
      columns: [],
    });
    findMany.mockResolvedValueOnce([owner, invited, outsider]);
    sortUsersByDisplayName.mockImplementationOnce((users: unknown[]) => users);

    const result = await getBoardDetailsData("board-restricted", {
      id: invited.id,
      role: "MEMBER",
    });

    expect(result?.canManage).toBe(false);
    expect(result?.activeMembers.map((member) => member.id)).toEqual([owner.id, invited.id]);
    expect(result?.activeMembers.find((member) => member.id === owner.id)?.isOwner).toBe(true);
    expect(result?.activeMembers.find((member) => member.id === outsider.id)).toBeUndefined();
  });
});
