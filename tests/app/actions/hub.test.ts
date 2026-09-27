import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const IDS = {
  initiative: "11111111-1111-4111-8111-111111111111",
  project: "22222222-2222-4222-8222-222222222222",
  board: "55555555-5555-4555-8555-555555555555",
  otherProject: "66666666-6666-4666-8666-666666666666",
  request: "77777777-7777-4777-8777-777777777777",
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
    boardMember: { createMany: vi.fn() },
    boardAccessRequest: { deleteMany: vi.fn() },
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
    board: { findUnique: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    boardAccessRequest: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const sendDiscordDm = vi.fn().mockResolvedValue(true);
  const requestHeaders = new Headers({ origin: "https://tools.test" });
  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("next/headers", () => ({ headers: vi.fn(async () => requestHeaders) }));
  vi.doMock("@/lib/discord", () => ({ sendDiscordDm }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  const storage = {
    upload: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://cdn/${path}` } })),
  };
  const createClient = vi.fn(async () => ({ storage: { from: vi.fn(() => storage) } }));

  vi.doMock("@/lib/prisma", () => ({ prisma }));
  vi.doMock("@/lib/supabase/server", () => ({ createClient }));

  const hub = await import("@/app/actions/hub");
  return {
    ...hub,
    revalidatePath,
    getCurrentUser,
    prisma,
    tx,
    storage,
    sendDiscordDm,
    requestHeaders,
  };
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
    await expect(hub.setBoardProjectAction(IDS.board, IDS.project)).resolves.toEqual(forbidden);
    await expect(hub.approveBoardAccessAction(IDS.request)).resolves.toEqual(forbidden);
    await expect(hub.declineBoardAccessAction(IDS.request)).resolves.toEqual(forbidden);
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

  it("sets and clears a cover image URL", async () => {
    const hub = await loadHubModule();

    await expect(hub.setProjectCoverUrlAction(IDS.project, "ftp://x.org/a.png")).resolves.toEqual({
      error: "Image URLs must start with http(s)://",
    });
    await expect(hub.setProjectCoverUrlAction(IDS.project, "nope")).resolves.toEqual({
      error: "Enter a full image URL",
    });

    hub.prisma.project.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      hub.setProjectCoverUrlAction(IDS.project, "https://example.com/a.png")
    ).resolves.toEqual({ error: "Project not found" });

    hub.prisma.project.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      hub.setProjectCoverUrlAction(IDS.project, " https://example.com/a.png ")
    ).resolves.toEqual({ success: true });
    expect(hub.prisma.project.updateMany).toHaveBeenLastCalledWith({
      where: { id: IDS.project },
      data: { coverImageUrl: "https://example.com/a.png" },
    });

    await expect(hub.setProjectCoverUrlAction(IDS.project, null)).resolves.toEqual({
      success: true,
    });
    expect(hub.prisma.project.updateMany).toHaveBeenLastCalledWith({
      where: { id: IDS.project },
      data: { coverImageUrl: null },
    });

    hub.getCurrentUser.mockResolvedValue(member);
    await expect(hub.setProjectCoverUrlAction(IDS.project, null)).resolves.toEqual({
      error: "Forbidden: Admin access required",
    });
  });

  it("uploads cover images to storage", async () => {
    const hub = await loadHubModule();
    const form = (fields: Record<string, string | File>) => {
      const data = new FormData();
      Object.entries(fields).forEach(([key, value]) => data.set(key, value));
      return data;
    };
    const png = new File([new Uint8Array([1, 2, 3])], "Cover.PNG", { type: "image/png" });

    await expect(hub.uploadProjectCoverAction(form({ projectId: "bad" }))).resolves.toEqual({
      error: "Invalid project",
    });
    await expect(hub.uploadProjectCoverAction(form({ projectId: IDS.project }))).resolves.toEqual({
      error: "No file provided",
    });
    await expect(
      hub.uploadProjectCoverAction(
        form({ projectId: IDS.project, cover: new File(["x"], "a.txt", { type: "text/plain" }) })
      )
    ).resolves.toEqual({ error: "Only JPEG, PNG, WebP and GIF images are allowed" });
    await expect(
      hub.uploadProjectCoverAction(
        form({
          projectId: IDS.project,
          cover: new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }),
        })
      )
    ).resolves.toEqual({ error: "File must be smaller than 5 MB" });

    hub.storage.upload.mockResolvedValueOnce({ error: { message: "Bucket full" } });
    await expect(
      hub.uploadProjectCoverAction(form({ projectId: IDS.project, cover: png }))
    ).resolves.toEqual({ error: "Bucket full" });

    hub.prisma.project.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      hub.uploadProjectCoverAction(form({ projectId: IDS.project, cover: png }))
    ).resolves.toEqual({ success: true });

    const path = `${admin.id}/project-covers/${IDS.project}.png`;
    expect(hub.storage.upload).toHaveBeenLastCalledWith(path, expect.any(ArrayBuffer), {
      contentType: "image/png",
      upsert: true,
    });
    expect(hub.prisma.project.updateMany).toHaveBeenLastCalledWith({
      where: { id: IDS.project },
      data: { coverImageUrl: expect.stringContaining(`https://cdn/${path}?v=`) },
    });

    hub.getCurrentUser.mockResolvedValue(member);
    await expect(hub.uploadProjectCoverAction(form({ projectId: IDS.project }))).resolves.toEqual({
      error: "Forbidden: Admin access required",
    });
  });

  it("attaches, moves and detaches boards", async () => {
    const hub = await loadHubModule();

    await expect(hub.setBoardProjectAction("bad", null)).resolves.toEqual({
      error: "Invalid UUID",
    });

    hub.prisma.board.findUnique.mockResolvedValueOnce(null);
    await expect(hub.setBoardProjectAction(IDS.board, IDS.project)).resolves.toEqual({
      error: "Board not found",
    });

    hub.prisma.board.findUnique.mockResolvedValue({ projectId: IDS.otherProject });
    hub.prisma.project.findUnique.mockResolvedValueOnce(null);
    await expect(hub.setBoardProjectAction(IDS.board, IDS.project)).resolves.toEqual({
      error: "Project not found",
    });
    expect(hub.prisma.board.update).not.toHaveBeenCalled();

    hub.prisma.project.findUnique.mockResolvedValueOnce({ id: IDS.project });
    await expect(hub.setBoardProjectAction(IDS.board, IDS.project)).resolves.toEqual({
      success: true,
    });
    expect(hub.prisma.board.update).toHaveBeenCalledWith({
      where: { id: IDS.board },
      data: { projectId: IDS.project },
    });
    expect(hub.revalidatePath).toHaveBeenCalledWith(`/hub/projects/${IDS.project}`);
    expect(hub.revalidatePath).toHaveBeenCalledWith(`/hub/projects/${IDS.otherProject}`);
    expect(hub.revalidatePath).toHaveBeenCalledWith("/boards");

    hub.prisma.board.findUnique.mockResolvedValue({ projectId: null });
    await expect(hub.setBoardProjectAction(IDS.board, null)).resolves.toEqual({ success: true });
    expect(hub.prisma.board.update).toHaveBeenLastCalledWith({
      where: { id: IDS.board },
      data: { projectId: null },
    });
  });

  it("records board access requests from non-members", async () => {
    const hub = await loadHubModule();

    hub.getCurrentUser.mockResolvedValueOnce(null);
    await expect(hub.requestBoardAccessAction(IDS.board)).resolves.toEqual({
      error: "You must be signed in",
    });

    hub.getCurrentUser.mockResolvedValue(member);
    await expect(hub.requestBoardAccessAction("bad")).resolves.toEqual({ error: "Invalid UUID" });

    hub.prisma.board.findUnique.mockResolvedValueOnce(null);
    await expect(hub.requestBoardAccessAction(IDS.board)).resolves.toEqual({
      error: "Board not found",
    });

    hub.prisma.board.findUnique.mockResolvedValueOnce({ project: null, members: [{ id: "m" }] });
    await expect(hub.requestBoardAccessAction(IDS.board)).resolves.toEqual({
      error: "You already have access to this board",
    });

    const boardWithProject = {
      title: "Art",
      project: { id: IDS.project, title: "St-tools" },
      members: [],
    };
    hub.prisma.board.findUnique.mockResolvedValueOnce(boardWithProject);
    await expect(hub.requestBoardAccessAction(IDS.board)).resolves.toEqual({ success: true });
    expect(hub.sendDiscordDm).not.toHaveBeenCalled();
    expect(hub.prisma.boardAccessRequest.createMany).toHaveBeenCalledWith({
      data: [{ boardId: IDS.board, userId: member.id }],
      skipDuplicates: true,
    });
    expect(hub.revalidatePath).toHaveBeenCalledWith(`/hub/projects/${IDS.project}`);

    hub.prisma.board.findUnique.mockResolvedValueOnce({
      title: "Loose",
      project: null,
      members: [],
    });
    await expect(hub.requestBoardAccessAction(IDS.board)).resolves.toEqual({ success: true });

    hub.getCurrentUser.mockResolvedValue(admin);
    hub.prisma.board.findUnique.mockResolvedValueOnce({ project: null, members: [] });
    await expect(hub.requestBoardAccessAction(IDS.board)).resolves.toEqual({
      error: "You already have access to this board",
    });
  });

  it("approves and declines access requests", async () => {
    const hub = await loadHubModule();

    await expect(hub.approveBoardAccessAction("bad")).resolves.toEqual({ error: "Invalid UUID" });
    await expect(hub.declineBoardAccessAction("bad")).resolves.toEqual({ error: "Invalid UUID" });

    hub.prisma.boardAccessRequest.findUnique.mockResolvedValue(null);
    await expect(hub.approveBoardAccessAction(IDS.request)).resolves.toEqual({
      error: "Request not found",
    });
    await expect(hub.declineBoardAccessAction(IDS.request)).resolves.toEqual({
      error: "Request not found",
    });

    hub.prisma.boardAccessRequest.findUnique.mockResolvedValue({
      boardId: IDS.board,
      userId: member.id,
    });
    hub.prisma.board.findUnique.mockResolvedValue({ projectId: IDS.project });
    await expect(hub.approveBoardAccessAction(IDS.request)).resolves.toEqual({ success: true });
    expect(hub.tx.boardMember.createMany).toHaveBeenCalledWith({
      data: [{ boardId: IDS.board, userId: member.id }],
      skipDuplicates: true,
    });
    expect(hub.tx.boardAccessRequest.deleteMany).toHaveBeenCalledWith({
      where: { id: IDS.request },
    });
    expect(hub.revalidatePath).toHaveBeenCalledWith(`/hub/projects/${IDS.project}`);

    hub.prisma.board.findUnique.mockResolvedValue(null);
    await expect(hub.declineBoardAccessAction(IDS.request)).resolves.toEqual({ success: true });
    expect(hub.prisma.boardAccessRequest.deleteMany).toHaveBeenCalledWith({
      where: { id: IDS.request },
    });
  });

  it("DMs every admin with a linked Discord account about a new request", async () => {
    const hub = await loadHubModule();
    const requester = { ...member, name: " ", email: "alice@x", avatarUrl: null };
    hub.getCurrentUser.mockResolvedValue(requester);
    const board = { title: "Art", project: { id: IDS.project, title: "St-tools" }, members: [] };
    hub.prisma.board.findUnique.mockResolvedValue(board);
    hub.prisma.user.findMany.mockResolvedValue([{ discordId: "111" }, { discordId: "222" }]);

    await expect(hub.requestBoardAccessAction(IDS.board)).resolves.toEqual({ success: true });

    expect(hub.prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: "ADMIN", discordId: { not: null } },
      select: { discordId: true },
    });
    expect(hub.sendDiscordDm).toHaveBeenCalledTimes(2);
    const url = `https://tools.test/hub/projects/${IDS.project}`;
    expect(hub.sendDiscordDm).toHaveBeenCalledWith("111", {
      embeds: [
        expect.objectContaining({
          author: { name: "alice@x" },
          title: "Board access request",
          description: "alice@x wants to join Art in St-tools.",
          url,
        }),
      ],
      linkButton: { label: "Review request", url },
    });

    hub.sendDiscordDm.mockClear();
    hub.getCurrentUser.mockResolvedValue({ ...requester, name: "Alice", avatarUrl: "https://a" });
    hub.requestHeaders.delete("origin");
    process.env.NEXT_PUBLIC_SITE_URL = "https://site.test";
    await hub.requestBoardAccessAction(IDS.board);
    expect(hub.sendDiscordDm.mock.calls[0][1].embeds[0]).toMatchObject({
      author: { name: "Alice", icon_url: "https://a" },
      url: `https://site.test/hub/projects/${IDS.project}`,
    });
    delete process.env.NEXT_PUBLIC_SITE_URL;

    hub.sendDiscordDm.mockClear();
    hub.prisma.boardAccessRequest.createMany.mockResolvedValueOnce({ count: 0 });
    await hub.requestBoardAccessAction(IDS.board);
    hub.prisma.user.findMany.mockResolvedValueOnce([]);
    await hub.requestBoardAccessAction(IDS.board);
    expect(hub.sendDiscordDm).not.toHaveBeenCalled();
  });
});
