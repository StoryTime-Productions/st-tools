import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGithubIssueState, githubIssueRef, parseGithubIssueUrl } from "@/lib/github";

describe("github issue links", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses issue URLs only", () => {
    expect(parseGithubIssueUrl(" https://github.com/Org/st-tools/issues/12/ ")).toEqual({
      owner: "Org",
      repo: "st-tools",
      number: 12,
    });
    expect(parseGithubIssueUrl("https://github.com/org/repo/pull/12")).toBeNull();
    expect(parseGithubIssueUrl("https://gitlab.com/org/repo/issues/12")).toBeNull();
  });

  it("builds a reference with a short label", () => {
    expect(githubIssueRef("https://github.com/org/repo/issues/5")).toEqual({
      url: "https://github.com/org/repo/issues/5",
      label: "repo#5",
      state: null,
    });
    expect(githubIssueRef(null)).toBeNull();
    expect(githubIssueRef("not a link")).toBeNull();
  });

  it("looks up the issue state with a 5-minute cache", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ state: "closed" })));

    await expect(fetchGithubIssueState("https://github.com/org/repo/issues/5")).resolves.toBe(
      "closed"
    );
    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/org/repo/issues/5", {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 300 },
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ state: "open" })));
    await expect(fetchGithubIssueState("https://github.com/org/repo/issues/5")).resolves.toBe(
      "open"
    );
  });

  it("returns no state for private, missing or odd responses", async () => {
    await expect(fetchGithubIssueState("nope")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    await expect(fetchGithubIssueState("https://github.com/o/r/issues/1")).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({})));
    await expect(fetchGithubIssueState("https://github.com/o/r/issues/1")).resolves.toBeNull();

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(fetchGithubIssueState("https://github.com/o/r/issues/1")).resolves.toBeNull();
  });
});
