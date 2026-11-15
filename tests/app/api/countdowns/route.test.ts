import { beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  const getCurrentUser = vi.fn();
  const getVisibleCountdowns = vi.fn();
  vi.doMock("server-only", () => ({}));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/countdowns", () => ({ getVisibleCountdowns }));
  const route = await import("@/app/api/countdowns/route");
  return { ...route, getCurrentUser, getVisibleCountdowns };
}

describe("GET /api/countdowns", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when signed out", async () => {
    const { GET, getCurrentUser, getVisibleCountdowns } = await load();
    getCurrentUser.mockResolvedValueOnce(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(getVisibleCountdowns).not.toHaveBeenCalled();
  });

  it("returns the user's countdowns with ISO dates and no private fields", async () => {
    const { GET, getCurrentUser, getVisibleCountdowns } = await load();
    getCurrentUser.mockResolvedValueOnce({ id: "u1" });
    getVisibleCountdowns.mockResolvedValueOnce([
      {
        id: "c1",
        title: "Dinner",
        targetAt: new Date("2026-11-16T13:00:00Z"),
        dismissed: true,
        scope: "GLOBAL",
        ownerId: "admin",
        audienceUserIds: ["x"],
      },
    ]);
    const response = await GET();
    expect(getVisibleCountdowns).toHaveBeenCalledWith("u1", expect.any(Date));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual([
      { id: "c1", title: "Dinner", targetAt: "2026-11-16T13:00:00.000Z", dismissed: true },
    ]);
  });
});
