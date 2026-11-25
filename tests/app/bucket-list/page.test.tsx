import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadPageModule() {
  const getCurrentUser = vi.fn();
  const getBucketList = vi.fn();
  const getLinkableHangouts = vi.fn().mockResolvedValue([]);
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/bucket-list", () => ({ getBucketList, getLinkableHangouts }));
  vi.doMock("@/app/bucket-list/_components/bucket-list-view", () => ({
    BucketListView: () => null,
  }));

  const pageModule = await import("@/app/bucket-list/page");
  const { BucketListView } = await import("@/app/bucket-list/_components/bucket-list-view");
  return { ...pageModule, getCurrentUser, getBucketList, getLinkableHangouts, BucketListView };
}

describe("BucketListPage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("renders nothing when signed out (the layout redirects)", async () => {
    const { default: BucketListPage, getCurrentUser, getBucketList } = await loadPageModule();
    getCurrentUser.mockResolvedValueOnce(null);

    expect(await BucketListPage()).toBeNull();
    expect(getBucketList).not.toHaveBeenCalled();
  });

  it("passes the grouped list and the viewer to the view", async () => {
    const {
      default: BucketListPage,
      getCurrentUser,
      getBucketList,
      getLinkableHangouts,
      BucketListView,
    } = await loadPageModule();
    const grouped = { TODO: [], IN_PLAN: [], DONE: [] };
    getCurrentUser.mockResolvedValueOnce({ id: "u1", role: "ADMIN", email: "a@b.c" });
    getBucketList.mockResolvedValueOnce(grouped);
    getLinkableHangouts.mockResolvedValueOnce([{ id: "h1", title: "Lake day" }]);

    const element = await BucketListPage();

    expect(element?.type).toBe(BucketListView);
    expect(element?.props).toEqual({
      grouped,
      viewer: { id: "u1", role: "ADMIN" },
      hangouts: [{ id: "h1", title: "Lake day" }],
    });
  });
});
