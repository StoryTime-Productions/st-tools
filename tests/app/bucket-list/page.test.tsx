import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadPageModule() {
  const getCurrentUser = vi.fn();
  const getBucketList = vi.fn();
  const getTagNames = vi.fn();
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/bucket-list", () => ({ getBucketList, getTagNames }));
  vi.doMock("@/app/bucket-list/_components/bucket-list-view", () => ({
    BucketListView: () => null,
  }));

  const pageModule = await import("@/app/bucket-list/page");
  const { BucketListView } = await import("@/app/bucket-list/_components/bucket-list-view");
  return { ...pageModule, getCurrentUser, getBucketList, getTagNames, BucketListView };
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

  it("passes the grouped list, shared tags and the viewer to the view", async () => {
    const {
      default: BucketListPage,
      getCurrentUser,
      getBucketList,
      getTagNames,
      BucketListView,
    } = await loadPageModule();
    const grouped = { TODO: [], IN_PLAN: [], DONE: [] };
    getCurrentUser.mockResolvedValueOnce({ id: "u1", role: "ADMIN", email: "a@b.c" });
    getBucketList.mockResolvedValueOnce(grouped);
    getTagNames.mockResolvedValueOnce(["food"]);

    const element = await BucketListPage();

    expect(element?.type).toBe(BucketListView);
    expect(element?.props).toEqual({
      grouped,
      tagNames: ["food"],
      viewer: { id: "u1", role: "ADMIN" },
    });
  });
});
