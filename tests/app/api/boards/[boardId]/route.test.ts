import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadBoardRouteModule() {
  const getCurrentUser = vi.fn();
  const getBoardDetailsData = vi.fn();

  vi.doMock("server-only", () => ({}));
  vi.doMock("@/lib/get-current-user", () => ({
    getCurrentUser,
  }));
  vi.doMock("@/lib/board-details", () => ({
    getBoardDetailsData,
  }));

  const routeModule = await import("@/app/api/boards/[boardId]/route");

  return {
    ...routeModule,
    getCurrentUser,
    getBoardDetailsData,
  };
}

describe("GET /api/boards/[boardId]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when the user is not authenticated", async () => {
    const { GET, getCurrentUser } = await loadBoardRouteModule();
    getCurrentUser.mockResolvedValueOnce(null);

    const response = await GET(new Request("https://example.test/api/boards/board-1"), {
      params: Promise.resolve({ boardId: "board-1" }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not authenticated" });
  });

  it("returns 404 when board details are not found", async () => {
    const { GET, getCurrentUser, getBoardDetailsData } = await loadBoardRouteModule();
    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      role: "MEMBER",
    });
    getBoardDetailsData.mockResolvedValueOnce(null);

    const response = await GET(new Request("https://example.test/api/boards/board-1"), {
      params: Promise.resolve({ boardId: "board-1" }),
    });

    expect(getBoardDetailsData).toHaveBeenCalledWith("board-1", {
      id: "11111111-1111-4111-8111-111111111111",
      role: "MEMBER",
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Board not found" });
  });

  it("returns board payload with no-store cache headers", async () => {
    const boardPayload = {
      id: "board-1",
      title: "Product Roadmap",
      columns: [],
    };

    const { GET, getCurrentUser, getBoardDetailsData } = await loadBoardRouteModule();
    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      role: "ADMIN",
    });
    getBoardDetailsData.mockResolvedValueOnce(boardPayload);

    const response = await GET(new Request("https://example.test/api/boards/board-1"), {
      params: Promise.resolve({ boardId: "board-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(boardPayload);
  });
});
