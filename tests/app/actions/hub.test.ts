import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const IDS = {
  initiative: "11111111-1111-4111-8111-111111111111",
  project: "22222222-2222-4222-8222-222222222222",
};

const admin = { id: "33333333-3333-4333-8333-333333333333", role: "ADMIN" };
const member = { id: "44444444-4444-4444-8444-444444444444", role: "MEMBER" };

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

async function loadHubModule() {
  const revalidatePath = vi.fn();
  const getCurrentUser = vi.fn().mockResolvedValue(admin);
  const tx = {
    tag: { createMany: vi.fn() },
    project: { update: vi.fn() },
    projectPhase: { deleteMany: vi.fn(), createMany: vi.fn() },
    projectLink: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  const prisma = {
    initiative: {
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
    project: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/prisma", () => ({ prisma }));

  const hub = await import("@/app/actions/hub");
  return { ...hub, revalidatePath, getCurrentUser, prisma, tx };
}

function projectUpdate(overrides: Record<string, unknown> = {}) {
  return {
    projectId: IDS.project,
    title: "St-tools",
    description: "  Internal tooling  ",
    initiativeId: IDS.initiative,
    startQuarter: "2026-Q3",
    endQuarter: null,
    tags: ["web", "web", "tools"],
    phases: ["Concept", "Build"],
    currentPhaseIndex: 1,
    links: [{ label: "GitHub", url: "https://github.com/StoryTime-Productions/st-tools" }],
    ...overrides,
  };
}

describe("hub actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects every action for non-admins", async () => {
    const hub = await loadHubModule();
    hub.getCurrentUser.mockResolvedValue(member);
    const forbidden = { error: "Forbidden: Admin access required" };

    await expect(hub.createInitiativeAction("Game Dev")).resolves.toEqual(forbidden);
    await expect(hub.renameInitiativeAction(IDS.initiative, "X")).resolves.toEqual(forbidden);
    await expect(hub.deleteInitiativeAction(IDS.initiative)).resolves.toEqual(forbidden);
    await expect(
      hub.createProjectAction({
        title: "P",
        description: null,
        initiativeId: IDS.initiative,
        startQuarter: null,
        endQuarter: null,
      })
    ).resolves.toEqual(forbidden);
    await expect(hub.updateProjectAction(projectUpdate())).resolves.toEqual(forbidden);
    await expect(hub.setProjectFinishedAction(IDS.project, true)).resolves.toEqual(forbidden);
    await expect(hub.deleteProjectAction(IDS.project)).resolves.toEqual(forbidden);
    expect(hub.prisma.initiative.create).not.toHaveBeenCalled();
  });

  it("creates initiatives and reports duplicates", async () => {
    const hub = await loadHubModule();

    await expect(hub.createInitiativeAction("   ")).resolves.toEqual({
      error: "Name is required",
    });

    hub.prisma.initiative.create.mockResolvedValueOnce({ id: IDS.initiative, name: "Game Dev" });
    await expect(hub.createInitiativeAction("  Game Dev ")).resolves.toEqual({
      success: true,
      initiative: { id: IDS.initiative, name: "Game Dev" },
    });
    expect(hub.prisma.initiative.create).toHaveBeenCalledWith({
      data: { name: "Game Dev" },
      select: { id: true, name: true },
    });
    expect(hub.revalidatePath).toHaveBeenCalledWith("/hub");

    hub.prisma.initiative.create.mockRejectedValueOnce(uniqueViolation());
    await expect(hub.createInitiativeAction("Game Dev")).resolves.toEqual({
      error: "An initiative with that name already exists",
    });

    hub.prisma.initiative.create.mockRejectedValueOnce(new Error("db down"));
    await expect(hub.createInitiativeAction("Other")).rejects.toThrow("db down");
  });

  it("renames initiatives", async () => {
    const hub = await loadHubModule();

    await expect(hub.renameInitiativeAction("bad", "Name")).resolves.toEqual({
      error: "Invalid UUID",
    });

    hub.prisma.initiative.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(hub.renameInitiativeAction(IDS.initiative, "YouTube")).resolves.toEqual({
      error: "Initiative not found",
    });

    hub.prisma.initiative.updateMany.mockRejectedValueOnce(uniqueViolation());
    await expect(hub.renameInitiativeAction(IDS.initiative, "YouTube")).resolves.toEqual({
      error: "An initiative with that name already exists",
    });

    hub.prisma.initiative.updateMany.mockRejectedValueOnce(new Error("db down"));
    await expect(hub.renameInitiativeAction(IDS.initiative, "YouTube")).rejects.toThrow();

    hub.prisma.initiative.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(hub.renameInitiativeAction(IDS.initiative, "YouTube")).resolves.toEqual({
      success: true,
    });
  });

  it("deletes initiatives", async () => {
    const hub = await loadHubModule();

    await expect(hub.deleteInitiativeAction("bad")).resolves.toEqual({ error: "Invalid UUID" });

    hub.prisma.initiative.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(hub.deleteInitiativeAction(IDS.initiative)).resolves.toEqual({
      error: "Initiative not found",
    });

    hub.prisma.initiative.deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(hub.deleteInitiativeAction(IDS.initiative)).resolves.toEqual({ success: true });
  });

  it("creates projects with an initiative and optional quarters", async () => {
    const hub = await loadHubModule();
    const base = {
      title: "St-tools",
      description: "",
      initiativeId: IDS.initiative,
      startQuarter: null,
      endQuarter: null,
    };

    await expect(hub.createProjectAction({ ...base, initiativeId: "" })).resolves.toEqual({
      error: "Choose an initiative",
    });
    await expect(hub.createProjectAction({ ...base, startQuarter: "Q3 2026" })).resolves.toEqual({
      error: "Quarter must look like 2026-Q3",
    });
    await expect(
      hub.createProjectAction({ ...base, startQuarter: "2026-Q4", endQuarter: "2026-Q1" })
    ).resolves.toEqual({ error: "End quarter must not be before the start quarter" });

    hub.prisma.initiative.findUnique.mockResolvedValueOnce(null);
    await expect(hub.createProjectAction(base)).resolves.toEqual({
      error: "Initiative not found",
    });

    hub.prisma.initiative.findUnique.mockResolvedValueOnce({ id: IDS.initiative });
    hub.prisma.project.create.mockResolvedValueOnce({ id: IDS.project });
    await expect(hub.createProjectAction({ ...base, startQuarter: "2026-Q3" })).resolves.toEqual({
      success: true,
      projectId: IDS.project,
    });
    expect(hub.prisma.project.create).toHaveBeenCalledWith({
      data: {
        title: "St-tools",
        description: null,
        initiativeId: IDS.initiative,
        startQuarter: "2026-Q3",
        endQuarter: "2026-Q3",
      },
      select: { id: true },
    });
    expect(hub.revalidatePath).toHaveBeenCalledWith(`/hub/projects/${IDS.project}`);
  });

  it("validates project updates", async () => {
    const hub = await loadHubModule();

    await expect(
      hub.updateProjectAction(projectUpdate({ links: [{ label: "X", url: "ftp://x.org" }] }))
    ).resolves.toEqual({ error: "Links must start with http(s)://" });
    await expect(hub.updateProjectAction(projectUpdate({ currentPhaseIndex: 2 }))).resolves.toEqual(
      { error: "Current phase must be one of the project's phases" }
    );

    hub.prisma.project.findUnique.mockResolvedValueOnce(null);
    await expect(hub.updateProjectAction(projectUpdate())).resolves.toEqual({
      error: "Project not found",
    });

    hub.prisma.project.findUnique.mockResolvedValueOnce({ id: IDS.project });
    hub.prisma.initiative.findUnique.mockResolvedValueOnce(null);
    await expect(hub.updateProjectAction(projectUpdate())).resolves.toEqual({
      error: "Initiative not found",
    });
  });

  it("replaces project details, tags, phases and links", async () => {
    const hub = await loadHubModule();
    hub.prisma.project.findUnique.mockResolvedValue({ id: IDS.project });
    hub.prisma.initiative.findUnique.mockResolvedValue({ id: IDS.initiative });

    await expect(hub.updateProjectAction(projectUpdate())).resolves.toEqual({ success: true });

    expect(hub.tx.tag.createMany).toHaveBeenCalledWith({
      data: [{ name: "web" }, { name: "tools" }],
      skipDuplicates: true,
    });
    expect(hub.tx.project.update).toHaveBeenCalledWith({
      where: { id: IDS.project },
      data: {
        title: "St-tools",
        description: "Internal tooling",
        initiativeId: IDS.initiative,
        currentPhaseIndex: 1,
        tags: { set: [{ name: "web" }, { name: "tools" }] },
        startQuarter: "2026-Q3",
        endQuarter: "2026-Q3",
      },
    });
    expect(hub.tx.projectPhase.createMany).toHaveBeenCalledWith({
      data: [
        { projectId: IDS.project, name: "Concept", position: 0 },
        { projectId: IDS.project, name: "Build", position: 1 },
      ],
    });
    expect(hub.tx.projectLink.createMany).toHaveBeenCalledWith({
      data: [
        {
          projectId: IDS.project,
          label: "GitHub",
          url: "https://github.com/StoryTime-Productions/st-tools",
          position: 0,
        },
      ],
    });

    vi.clearAllMocks();
    await expect(
      hub.updateProjectAction(
        projectUpdate({
          initiativeId: null,
          startQuarter: null,
          endQuarter: "2026-Q3",
          tags: [],
          phases: [],
          currentPhaseIndex: null,
          links: [],
        })
      )
    ).resolves.toEqual({ success: true });
    expect(hub.prisma.initiative.findUnique).not.toHaveBeenCalled();
    expect(hub.tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ startQuarter: null, endQuarter: null }),
      })
    );
    expect(hub.tx.tag.createMany).not.toHaveBeenCalled();
    expect(hub.tx.projectPhase.deleteMany).toHaveBeenCalled();
    expect(hub.tx.projectPhase.createMany).not.toHaveBeenCalled();
    expect(hub.tx.projectLink.createMany).not.toHaveBeenCalled();
  });

  it("marks projects finished and deletes them", async () => {
    const hub = await loadHubModule();

    await expect(hub.setProjectFinishedAction("bad", true)).resolves.toEqual({
      error: "Invalid UUID",
    });

    hub.prisma.project.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(hub.setProjectFinishedAction(IDS.project, true)).resolves.toEqual({
      error: "Project not found",
    });

    hub.prisma.project.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(hub.setProjectFinishedAction(IDS.project, true)).resolves.toEqual({
      success: true,
    });
    expect(hub.prisma.project.updateMany).toHaveBeenLastCalledWith({
      where: { id: IDS.project },
      data: { finishedAt: expect.any(Date) },
    });

    hub.prisma.project.updateMany.mockResolvedValueOnce({ count: 1 });
    await hub.setProjectFinishedAction(IDS.project, false);
    expect(hub.prisma.project.updateMany).toHaveBeenLastCalledWith({
      where: { id: IDS.project },
      data: { finishedAt: null },
    });

    await expect(hub.deleteProjectAction("bad")).resolves.toEqual({ error: "Invalid UUID" });

    hub.prisma.project.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(hub.deleteProjectAction(IDS.project)).resolves.toEqual({
      error: "Project not found",
    });

    hub.prisma.project.deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(hub.deleteProjectAction(IDS.project)).resolves.toEqual({ success: true });
    expect(hub.revalidatePath).toHaveBeenCalledWith("/boards");
  });
});
