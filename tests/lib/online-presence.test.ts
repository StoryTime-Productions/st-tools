import { describe, expect, it } from "vitest";
import { WORKSPACE_ONLINE_CHANNEL, WORKSPACE_POKE_EVENT } from "@/lib/online-presence";

describe("online presence constants", () => {
  it("exports expected channel names", () => {
    expect(WORKSPACE_ONLINE_CHANNEL).toBe("workspace:online");
    expect(WORKSPACE_POKE_EVENT).toBe("poke");
  });
});
