import { describe, expect, it } from "vitest";
import { isRecoverySession, RECOVERY_WINDOW_SECONDS } from "@/lib/auth-recovery";

const NOW = 1_800_000_000;

describe("isRecoverySession", () => {
  it("accepts a session created by a reset email within the window", () => {
    expect(isRecoverySession({ amr: [{ method: "otp", timestamp: NOW - 60 }] }, NOW)).toBe(true);
    expect(
      isRecoverySession({ amr: [{ method: "otp", timestamp: NOW - RECOVERY_WINDOW_SECONDS }] }, NOW)
    ).toBe(true);
  });

  it("rejects a reset session that is older than the window", () => {
    expect(
      isRecoverySession(
        { amr: [{ method: "otp", timestamp: NOW - RECOVERY_WINDOW_SECONDS - 1 }] },
        NOW
      )
    ).toBe(false);
  });

  it("rejects ordinary password and oauth sessions", () => {
    expect(isRecoverySession({ amr: [{ method: "password", timestamp: NOW }] }, NOW)).toBe(false);
    expect(isRecoverySession({ amr: [{ method: "oauth", timestamp: NOW }] }, NOW)).toBe(false);
  });

  it("rejects missing or malformed claims", () => {
    expect(isRecoverySession(null, NOW)).toBe(false);
    expect(isRecoverySession(undefined, NOW)).toBe(false);
    expect(isRecoverySession({}, NOW)).toBe(false);
    expect(isRecoverySession({ amr: "otp" }, NOW)).toBe(false);
    expect(isRecoverySession({ amr: [{ method: "otp" }] }, NOW)).toBe(false);
    expect(isRecoverySession({ amr: [{ method: "otp", timestamp: "now" }] }, NOW)).toBe(false);
  });

  it("defaults to the current time", () => {
    expect(isRecoverySession({ amr: [{ method: "otp", timestamp: Date.now() / 1000 }] })).toBe(
      true
    );
  });
});
