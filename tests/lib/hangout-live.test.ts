import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyHangout, revalidateHangoutPage } from "@/lib/hangout-live";

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

describe("hangout live signal", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("broadcasts an empty changed event on the hangout topic", async () => {
    await notifyHangout("h1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:54321/realtime/v1/api/broadcast");
    expect(init.headers.apikey).toBe("anon");
    expect(JSON.parse(init.body)).toEqual({
      messages: [{ topic: "hangout:h1", event: "changed", payload: {}, private: false }],
    });
  });

  it("never throws when the network or config fails", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    await expect(notifyHangout("h1")).resolves.toBeUndefined();

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await expect(notifyHangout("h1")).resolves.toBeUndefined();
  });

  it("revalidates the hangout page", () => {
    revalidateHangoutPage("h1");
    expect(revalidatePath).toHaveBeenCalledWith("/hub/hangouts/h1");
  });
});
