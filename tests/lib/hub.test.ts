import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadHubLib() {
  const prisma = {
    initiative: { findMany: vi.fn() },
    project: { findMany: vi.fn(), findUnique: vi.fn() },
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
});
