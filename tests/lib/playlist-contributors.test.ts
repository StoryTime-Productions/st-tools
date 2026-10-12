import { describe, expect, it } from "vitest";
import { getContributorColumn, parseContributors } from "@/lib/playlist-contributors";

describe("parseContributors", () => {
  it("parses a valid map", () => {
    expect(parseContributors('{"1":" Ann ","2":"Bo"}')).toEqual(
      new Map([
        ["1", "Ann"],
        ["2", "Bo"],
      ])
    );
  });

  it.each([undefined, "", "not json", "[]", "null", '"x"', '{"1":5}', '{"1":"Ann","2":""}'])(
    "fails closed on %s",
    (raw) => {
      expect(parseContributors(raw).size).toBe(0);
    }
  );
});

describe("getContributorColumn", () => {
  const raw = '{"1":"Ann"}';

  it("returns the column for a listed id", () => {
    expect(getContributorColumn("1", raw)).toBe("Ann");
  });

  it("returns null for unlisted, missing or empty ids", () => {
    expect(getContributorColumn("2", raw)).toBeNull();
    expect(getContributorColumn(null, raw)).toBeNull();
    expect(getContributorColumn("", raw)).toBeNull();
  });

  it("reads PLAYLIST_CONTRIBUTORS by default", () => {
    process.env.PLAYLIST_CONTRIBUTORS = '{"9":"Cy"}';
    try {
      expect(getContributorColumn("9")).toBe("Cy");
    } finally {
      delete process.env.PLAYLIST_CONTRIBUTORS;
    }
  });
});
