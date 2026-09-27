import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadHubLib() {
  const prisma = {
    initiative: { findMany: vi.fn() },
    project: { findMany: vi.fn(), findUnique: vi.fn() },
    board: { findMany: vi.fn() },
  };
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  const lib = await import("@/lib/hub");
  return { ...lib, prisma };
}

describe("hub data loaders", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("loads initiative options by name", async () => {
    const { getInitiativeOptions, prisma } = await loadHubLib();
    prisma.initiative.findMany.mockResolvedValue([{ id: "i1", name: "Game Dev" }]);

    await expect(getInitiativeOptions()).resolves.toEqual([{ id: "i1", name: "Game Dev" }]);
    expect(prisma.initiative.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: "asc" } })
    );
  });

  it("maps project summaries", async () => {
    const { getProjectSummaries, prisma } = await loadHubLib();
    prisma.project.findMany.mockResolvedValue([
      {
        id: "p1",
        title: "St-tools",
        coverImageUrl: null,
        startQuarter: "2026-Q3",
        endQuarter: "2026-Q4",
        currentPhaseIndex: 1,
        finishedAt: null,
        initiative: { name: "Internal Tools" },
        phases: [{ name: "Concept" }, { name: "Build" }],
      },
      {
        id: "p2",
        title: "Old",
        coverImageUrl: "https://example.com/c.png",
        startQuarter: null,
        endQuarter: null,
        currentPhaseIndex: 4,
        finishedAt: new Date(),
        initiative: null,
        phases: [],
      },
      {
        id: "p3",
        title: "New",
        coverImageUrl: null,
        startQuarter: null,
        endQuarter: null,
        currentPhaseIndex: null,
        finishedAt: null,
        initiative: null,
        phases: [],
      },
    ]);

    await expect(getProjectSummaries()).resolves.toEqual([
      {
        id: "p1",
        title: "St-tools",
        coverImageUrl: null,
        initiativeName: "Internal Tools",
        quarterLabel: "Q3 2026 – Q4 2026",
        currentPhase: "Build",
        finished: false,
      },
      {
        id: "p2",
        title: "Old",
        coverImageUrl: "https://example.com/c.png",
        initiativeName: null,
        quarterLabel: null,
        currentPhase: null,
        finished: true,
      },
      {
        id: "p3",
        title: "New",
        coverImageUrl: null,
        initiativeName: null,
        quarterLabel: null,
        currentPhase: null,
        finished: false,
      },
    ]);
  });

  it("maps project detail and handles missing projects", async () => {
    const { getProjectDetail, prisma } = await loadHubLib();
    prisma.project.findUnique.mockResolvedValueOnce(null);
    await expect(getProjectDetail("missing")).resolves.toBeNull();

    prisma.project.findUnique.mockResolvedValueOnce({
      id: "p1",
      title: "St-tools",
      description: "Tools",
      coverImageUrl: null,
      initiativeId: "i1",
      startQuarter: "2026-Q3",
      endQuarter: "2026-Q3",
      currentPhaseIndex: 0,
      finishedAt: null,
      initiative: { name: "Internal Tools" },
      phases: [{ name: "Concept" }],
      links: [{ label: "GitHub", url: "https://github.com" }],
      tags: [{ name: "web" }],
    });
    await expect(getProjectDetail("p1")).resolves.toEqual({
      id: "p1",
      title: "St-tools",
      description: "Tools",
      coverImageUrl: null,
      initiativeId: "i1",
      initiativeName: "Internal Tools",
      startQuarter: "2026-Q3",
      endQuarter: "2026-Q3",
      phases: ["Concept"],
      currentPhaseIndex: 0,
      links: [{ label: "GitHub", url: "https://github.com" }],
      tags: ["web"],
      finished: false,
    });

    prisma.project.findUnique.mockResolvedValueOnce({
      id: "p2",
      title: "X",
      description: null,
      coverImageUrl: null,
      initiativeId: null,
      startQuarter: null,
      endQuarter: null,
      currentPhaseIndex: null,
      finishedAt: new Date(),
      initiative: null,
      phases: [],
      links: [],
      tags: [],
    });
    await expect(getProjectDetail("p2")).resolves.toMatchObject({
      initiativeName: null,
      finished: true,
    });
  });

  it("loads project boards, participants and available tasks for the viewer", async () => {
    const { getProjectWork, prisma } = await loadHubLib();
    const alice = { id: "u1", name: "Alice", email: "a@x", avatarUrl: "https://a.png" };
    const bob = { id: "u2", name: " ", email: "bob@x", avatarUrl: null };
    const due = new Date("2026-10-01T12:00:00Z");
    prisma.board.findMany.mockResolvedValue([
      {
        id: "b1",
        title: "Art",
        members: [{ user: alice }, { user: bob }],
        accessRequests: [],
        columns: [
          {
            cards: [
              { id: "c1", title: "Undated", dueDate: null, assigneeId: null },
              { id: "c2", title: "Taken", dueDate: null, assigneeId: "u1" },
              { id: "c3", title: "Dated", dueDate: due, assigneeId: null },
            ],
          },
        ],
      },
      {
        id: "b2",
        title: "Secret",
        members: [{ user: bob }],
        accessRequests: [
          { id: "r1", userId: "u1", user: { name: "Alice", email: "a@x" } },
          { id: "r2", userId: "u3", user: { name: null, email: "carol@x" } },
        ],
        columns: [{ cards: [{ id: "c4", title: "Hidden", dueDate: null, assigneeId: null }] }],
      },
    ]);

    const work = await getProjectWork("p1", { id: "u1", role: "MEMBER" });

    expect(prisma.board.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "p1" } })
    );
    expect(work.boards).toEqual([
      { id: "b1", title: "Art", cardCount: 3, accessible: true, requested: false },
      { id: "b2", title: "Secret", cardCount: 1, accessible: false, requested: true },
    ]);
    expect(work.accessRequests).toEqual([]);
    expect(work.participants).toEqual([
      { id: "u1", name: "Alice", avatarUrl: "https://a.png" },
      { id: "u2", name: "bob@x", avatarUrl: null },
    ]);
    expect(work.availableTasks.map((task) => task.id)).toEqual(["c3", "c1"]);
    expect(work.availableTasks[0]).toEqual({
      id: "c3",
      title: "Dated",
      boardId: "b1",
      boardTitle: "Art",
      dueDate: due,
    });

    const adminWork = await getProjectWork("p1", { id: "admin", role: "ADMIN" });
    expect(adminWork.boards.every((board) => board.accessible)).toBe(true);
    expect(adminWork.availableTasks.map((task) => task.id)).toEqual(["c3", "c1", "c4"]);
    expect(adminWork.accessRequests).toEqual([
      { id: "r1", boardTitle: "Secret", userName: "Alice" },
      { id: "r2", boardTitle: "Secret", userName: "carol@x" },
    ]);
  });

  it("lists standalone boards", async () => {
    const { getStandaloneBoardOptions, prisma } = await loadHubLib();
    prisma.board.findMany.mockResolvedValue([{ id: "b3", title: "Loose" }]);

    await expect(getStandaloneBoardOptions()).resolves.toEqual([{ id: "b3", title: "Loose" }]);
    expect(prisma.board.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: null } })
    );
  });
});
