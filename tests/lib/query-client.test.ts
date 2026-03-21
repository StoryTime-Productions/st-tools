import { beforeEach, describe, expect, it, vi } from "vitest";

describe("query client helpers", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("creates query client with expected defaults", async () => {
    const { makeQueryClient } = await import("@/lib/query-client");
    const client = makeQueryClient();
    const defaults = client.getDefaultOptions();

    expect(defaults.queries?.staleTime).toBe(60 * 1000);
    expect(defaults.queries?.gcTime).toBe(5 * 60 * 1000);
  });

  it("reuses one browser query client instance", async () => {
    const { getQueryClient } = await import("@/lib/query-client");

    const first = getQueryClient();
    const second = getQueryClient();

    expect(first).toBe(second);
  });

  it("creates a new client per call on the server", async () => {
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      value: undefined,
      configurable: true,
    });

    try {
      const { getQueryClient } = await import("@/lib/query-client");

      const first = getQueryClient();
      const second = getQueryClient();

      expect(first).not.toBe(second);
    } finally {
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
      });
    }
  });
});
