import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUCKET_STATUSES,
  canManageItem,
  groupByStatus,
  normalizeNotes,
  normalizeTitle,
  parseBucketInput,
  seasonLabel,
  statusLabel,
  type BucketItemView,
} from "@/lib/bucket-list-core";

const view = (id: string, over: Partial<BucketItemView> = {}): BucketItemView => ({
  id,
  title: id,
  notes: null,
  status: "TODO",
  season: null,
  seasonYear: null,
  suggestedById: "u1",
  suggestedByName: "Alice",
  hangoutId: null,
  hangoutTitle: null,
  driveFolderId: null,
  doneAt: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  tags: [],
  ...over,
});

describe("bucket list wording", () => {
  it("labels statuses in column order", () => {
    expect(BUCKET_STATUSES.map(statusLabel)).toEqual(["To do", "In plan", "Done"]);
  });

  it("writes the season with or without a year", () => {
    expect(seasonLabel("SUMMER", 2027)).toBe("Summer 2027");
    expect(seasonLabel("FALL", null)).toBe("Fall");
    expect(seasonLabel(null, null)).toBeNull();
  });

  it("tidies and caps titles and notes", () => {
    expect(normalizeTitle("  Go   camping ")).toBe("Go camping");
    expect(normalizeTitle("x".repeat(100))).toHaveLength(80);
    expect(normalizeNotes("  bring snacks ")).toBe("bring snacks");
    expect(normalizeNotes("   ")).toBeNull();
    expect(normalizeNotes(null)).toBeNull();
    expect(normalizeNotes(undefined)).toBeNull();
    expect(normalizeNotes("y".repeat(2000))).toHaveLength(1000);
  });
});

describe("parseBucketInput", () => {
  it("accepts a title alone", () => {
    expect(parseBucketInput({ title: " Skydiving " })).toEqual({
      ok: true,
      value: { title: "Skydiving", notes: null, season: null, seasonYear: null },
    });
  });

  it("accepts a season with and without a year", () => {
    expect(
      parseBucketInput({ title: "Beach", notes: "sunscreen", season: "SUMMER", seasonYear: 2027 })
    ).toEqual({
      ok: true,
      value: { title: "Beach", notes: "sunscreen", season: "SUMMER", seasonYear: 2027 },
    });
    expect(parseBucketInput({ title: "Beach", season: "SUMMER" })).toMatchObject({ ok: true });
  });

  it("refuses an empty title", () => {
    expect(parseBucketInput({ title: "   " })).toEqual({ ok: false, error: "Give it a title." });
  });

  it("refuses an unknown season", () => {
    expect(parseBucketInput({ title: "x", season: "MONSOON" })).toEqual({
      ok: false,
      error: "Pick a valid season.",
    });
  });

  it("refuses a year without a season", () => {
    expect(parseBucketInput({ title: "x", seasonYear: 2027 })).toEqual({
      ok: false,
      error: "Pick a season to go with the year.",
    });
  });

  it("refuses a year out of range or not whole", () => {
    for (const seasonYear of [1999, 2101, 2027.5]) {
      expect(parseBucketInput({ title: "x", season: "FALL", seasonYear })).toEqual({
        ok: false,
        error: "Pick a valid year.",
      });
    }
  });
});

describe("canManageItem", () => {
  it("lets the suggester and any admin manage, nobody else", () => {
    const item = { suggestedById: "u1" };
    expect(canManageItem(item, { id: "u1", role: "MEMBER" })).toBe(true);
    expect(canManageItem(item, { id: "u2", role: "ADMIN" })).toBe(true);
    expect(canManageItem(item, { id: "u2", role: "MEMBER" })).toBe(false);
  });

  it("leaves an item with a deleted suggester to admins", () => {
    const item = { suggestedById: null };
    expect(canManageItem(item, { id: "u1", role: "MEMBER" })).toBe(false);
    expect(canManageItem(item, { id: "u1", role: "ADMIN" })).toBe(true);
  });
});

describe("groupByStatus", () => {
  it("splits by status, oldest first, and Done newest first", () => {
    const d = (day: number) => new Date(`2026-11-${String(day).padStart(2, "0")}T00:00:00Z`);
    const grouped = groupByStatus([
      view("t2", { createdAt: d(5) }),
      view("t1", { createdAt: d(2) }),
      view("p1", { status: "IN_PLAN", createdAt: d(9) }),
      view("p0", { status: "IN_PLAN", createdAt: d(3) }),
      view("d1", { status: "DONE", doneAt: d(10) }),
      view("d2", { status: "DONE", doneAt: d(20) }),
      view("d3", { status: "DONE", doneAt: null, createdAt: d(15) }),
    ]);
    expect(grouped.TODO.map((i) => i.id)).toEqual(["t1", "t2"]);
    expect(grouped.IN_PLAN.map((i) => i.id)).toEqual(["p0", "p1"]);
    expect(grouped.DONE.map((i) => i.id)).toEqual(["d2", "d3", "d1"]);
  });

  it("returns empty columns for an empty list", () => {
    expect(groupByStatus([])).toEqual({ TODO: [], IN_PLAN: [], DONE: [] });
  });

  it("falls back to the created date for a Done item missing doneAt on either side", () => {
    const grouped = groupByStatus([
      view("a", { status: "DONE", doneAt: null, createdAt: new Date("2026-11-02T00:00:00Z") }),
      view("b", { status: "DONE", doneAt: null, createdAt: new Date("2026-11-09T00:00:00Z") }),
    ]);
    expect(grouped.DONE.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("bucket list queries", () => {
  beforeEach(() => vi.resetModules());

  const row = (over: Record<string, unknown> = {}) => ({
    id: "b1",
    title: "Camping",
    notes: "n",
    status: "IN_PLAN",
    season: "SUMMER",
    seasonYear: 2027,
    suggestedById: "u1",
    hangoutId: "h1",
    driveFolderId: "f1",
    doneAt: null,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    suggestedBy: { name: "Alice" },
    hangout: { title: "Lake day" },
    tags: [{ name: "outdoors" }, { name: "summer" }],
    ...over,
  });

  async function load(prismaOver: Record<string, unknown>) {
    const prisma = { bucketItem: prismaOver };
    vi.doMock("@/lib/prisma", () => ({ prisma }));
    return import("@/lib/bucket-list");
  }

  it("groups the whole list by status with names and tags resolved", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        row(),
        row({ id: "b2", status: "TODO", suggestedBy: null, hangout: null }),
      ]);
    const { getBucketList } = await load({ findMany });
    const list = await getBucketList();
    expect(findMany).toHaveBeenCalledOnce();
    expect(list.IN_PLAN[0]).toMatchObject({
      id: "b1",
      suggestedByName: "Alice",
      hangoutTitle: "Lake day",
      tags: ["outdoors", "summer"],
    });
    expect(list.TODO[0]).toMatchObject({ id: "b2", suggestedByName: null, hangoutTitle: null });
  });

  it("lists the shared tag names alphabetically", async () => {
    const findMany = vi.fn().mockResolvedValue([{ name: "food" }, { name: "trip" }]);
    vi.doMock("@/lib/prisma", () => ({ prisma: { tag: { findMany } } }));
    const { getTagNames } = await import("@/lib/bucket-list");

    expect(await getTagNames()).toEqual(["food", "trip"]);
    expect(findMany).toHaveBeenCalledWith({ select: { name: true }, orderBy: { name: "asc" } });
  });

  it("finds one item by id, or null", async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    const { getBucketItem } = await load({ findUnique });
    expect(await getBucketItem("b1")).toMatchObject({ id: "b1", driveFolderId: "f1" });
    expect(await getBucketItem("nope")).toBeNull();
  });

  it("finds the item linked to a hangout, or null", async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    const { getBucketItemForHangout } = await load({ findUnique });
    expect(await getBucketItemForHangout("h1")).toMatchObject({ hangoutId: "h1" });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hangoutId: "h1" } })
    );
    expect(await getBucketItemForHangout("h2")).toBeNull();
  });
});
