import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadHangoutsLib() {
  const prisma = { hangout: { findMany: vi.fn(), findUnique: vi.fn() } };
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  const lib = await import("@/lib/hangouts");
  return { ...lib, prisma };
}

describe("hangout data loaders", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("lists hangouts that are not cancelled, newest first", async () => {
    const { getHangoutSummaries, prisma } = await loadHangoutsLib();
    prisma.hangout.findMany.mockResolvedValue([{ id: "h1" }]);

    await expect(getHangoutSummaries()).resolves.toEqual([{ id: "h1" }]);
    expect(prisma.hangout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { not: "CANCELLED" } },
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("loads one hangout by id", async () => {
    const { getHangoutDetail, prisma } = await loadHangoutsLib();
    prisma.hangout.findUnique.mockResolvedValue(null);

    await expect(getHangoutDetail("h1")).resolves.toBeNull();
    expect(prisma.hangout.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "h1" } })
    );
  });
});
