import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const fetchMock = vi.fn();

async function get(z: string, x: string, y: string, query = "") {
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  const { GET } = await import("@/app/api/map-tiles/[z]/[x]/[y]/route");
  return GET(new Request(`https://example.test/api/map-tiles/${z}/${x}/${y}${query}`), {
    params: Promise.resolve({ z, x, y }),
  });
}

describe("GET /api/map-tiles/[z]/[x]/[y]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TOMTOM_API_KEY", "tt-key");
    getCurrentUser.mockResolvedValue({ id: "u1" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns 401 without a login and never calls TomTom", async () => {
    getCurrentUser.mockResolvedValue(null);
    const response = await get("10", "1", "2");
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 without a key and 400 for bad coordinates", async () => {
    vi.stubEnv("TOMTOM_API_KEY", "");
    expect((await get("10", "1", "2")).status).toBe(404);
    vi.stubEnv("TOMTOM_API_KEY", "tt-key");
    for (const [z, x, y] of [
      ["23", "1", "2"],
      ["10", "-1", "2"],
      ["10", "1", "a"],
      ["10", "1.5", "2"],
    ]) {
      expect((await get(z, x, y)).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies the PNG with a private day-long cache", async () => {
    fetchMock.mockResolvedValue(new Response("png-bytes", { status: 200 }));
    const response = await get("10", "1", "2");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tomtom.com/map/1/tile/basic/main/10/1/2.png?key=tt-key"
    );
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=86400");
    expect(await response.text()).toBe("png-bytes");
  });

  it("uses the night style on request", async () => {
    fetchMock.mockResolvedValue(new Response("x"));
    await get("3", "4", "5", "?style=night");
    expect(fetchMock.mock.calls[0][0]).toContain("/basic/night/3/4/5.png");
  });

  it("returns 502 when TomTom fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 403 }));
    expect((await get("10", "1", "2")).status).toBe(502);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect((await get("10", "1", "2")).status).toBe(502);
  });
});
