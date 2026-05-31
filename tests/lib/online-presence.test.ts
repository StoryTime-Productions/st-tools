import { describe, expect, it } from "vitest";
import {
  EMOTE_CONFIG,
  WORKSPACE_EMOTE_EVENT,
  WORKSPACE_ONLINE_CHANNEL,
  WORKSPACE_POKE_EVENT,
  isWorkspaceEmotePayload,
} from "@/lib/online-presence";

describe("online presence constants", () => {
  it("exports expected channel and event names", () => {
    expect(WORKSPACE_ONLINE_CHANNEL).toBe("workspace:online");
    expect(WORKSPACE_POKE_EVENT).toBe("poke");
    expect(WORKSPACE_EMOTE_EVENT).toBe("emote");
  });
});

describe("EMOTE_CONFIG", () => {
  it("contains all four emotes with emoji and label", () => {
    expect(Object.keys(EMOTE_CONFIG)).toEqual([
      "locked-in",
      "burnt-out",
      "crashing-out",
      "doom-scrolling",
    ]);

    for (const config of Object.values(EMOTE_CONFIG)) {
      expect(typeof config.label).toBe("string");
      expect(config.label.length).toBeGreaterThan(0);
      expect(typeof config.emoji).toBe("string");
      expect(config.emoji.length).toBeGreaterThan(0);
    }
  });
});

describe("isWorkspaceEmotePayload", () => {
  it("accepts a valid payload", () => {
    expect(
      isWorkspaceEmotePayload({
        emoteId: "locked-in",
        fromUserId: "user-1",
        fromName: "Alice",
        fromAvatarUrl: null,
        createdAt: new Date().toISOString(),
      })
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isWorkspaceEmotePayload(null)).toBe(false);
  });

  it("rejects an unknown emoteId", () => {
    expect(
      isWorkspaceEmotePayload({
        emoteId: "unknown-emote",
        fromUserId: "user-1",
        fromName: "Alice",
        fromAvatarUrl: null,
        createdAt: new Date().toISOString(),
      })
    ).toBe(false);
  });

  it("rejects a payload missing required fields", () => {
    expect(isWorkspaceEmotePayload({ emoteId: "locked-in" })).toBe(false);
  });

  it("rejects a payload where fromUserId is not a string", () => {
    expect(
      isWorkspaceEmotePayload({
        emoteId: "burnt-out",
        fromUserId: 42,
        fromName: "Bob",
        fromAvatarUrl: null,
        createdAt: new Date().toISOString(),
      })
    ).toBe(false);
  });
});
