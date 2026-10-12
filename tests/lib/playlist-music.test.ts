import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatDuration,
  lookupSong,
  normalizeSearchQuery,
  spotifySearchUrl,
} from "@/lib/playlist-music";

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn((url: string | URL | Request) => Promise.resolve(handler(String(url))));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("normalizeSearchQuery", () => {
  it("strips quotes, 'by' and dashes", () => {
    expect(normalizeSearchQuery('"Song by Artist"')).toBe("Song Artist");
    expect(normalizeSearchQuery("Song - Artist")).toBe("Song Artist");
    expect(normalizeSearchQuery("  ")).toBe("");
  });
});

describe("formatDuration / spotifySearchUrl", () => {
  it("formats m:ss", () => {
    expect(formatDuration(215)).toBe("3:35");
    expect(formatDuration(65.4)).toBe("1:05");
    expect(formatDuration(-3)).toBe("0:00");
  });

  it("encodes the search text", () => {
    expect(spotifySearchUrl(" a b&c ")).toBe("https://open.spotify.com/search/a%20b%26c");
  });
});

describe("lookupSong", () => {
  const deezerHit = {
    data: [
      {
        title: "Song",
        link: "https://deezer.com/track/1",
        duration: 215,
        artist: { name: "Artist" },
        album: { id: 7, cover_big: "https://cdn/big.jpg" },
      },
    ],
  };

  it("returns Deezer match with duration and album genre", async () => {
    mockFetch((url) =>
      url.includes("/album/") ? json({ genres: { data: [{ name: "Rock" }] } }) : json(deezerHit)
    );
    expect(await lookupSong("Song - Artist")).toEqual({
      title: "Song",
      artistName: "Artist",
      albumArtUrl: "https://cdn/big.jpg",
      trackUrl: "https://deezer.com/track/1",
      durationSec: 215,
      genre: "Rock",
      source: "deezer",
    });
  });

  it("omits genre when the album call fails", async () => {
    mockFetch((url) => (url.includes("/album/") ? json({}, false) : json(deezerHit)));
    expect((await lookupSong("Song - Artist"))?.genre).toBeNull();
  });

  it("omits genre and duration when the track has no album or duration", async () => {
    mockFetch(() => json({ data: [{ title: "Song", artist: { name: "Artist" } }] }));
    const match = await lookupSong("Song Artist");
    expect(match).toMatchObject({ genre: null, durationSec: null, albumArtUrl: null });
  });

  it("falls back to iTunes when Deezer has no plausible match", async () => {
    mockFetch((url) =>
      url.includes("deezer")
        ? json({ data: [{ title: "Other", artist: { name: "Nobody" } }] })
        : json({
            results: [
              {
                trackName: "Song",
                artistName: "Artist",
                artworkUrl100: "https://x/100x100bb.jpg",
                trackViewUrl: "https://apple/1",
                trackTimeMillis: 180400,
                primaryGenreName: "Pop",
              },
            ],
          })
    );
    expect(await lookupSong("Song - Artist")).toEqual({
      title: "Song",
      artistName: "Artist",
      albumArtUrl: "https://x/600x600bb.jpg",
      trackUrl: "https://apple/1",
      durationSec: 180,
      genre: "Pop",
      source: "itunes",
    });
  });

  it("handles iTunes results without optional fields", async () => {
    mockFetch((url) =>
      url.includes("deezer")
        ? json({ data: [] })
        : json({ results: [{ trackName: "Song", artistName: "Artist" }] })
    );
    expect(await lookupSong("Song Artist")).toMatchObject({
      albumArtUrl: null,
      durationSec: null,
      genre: null,
    });
  });

  it("returns null for empty query, no match, and thrown fetches", async () => {
    expect(await lookupSong("  ")).toBeNull();
    mockFetch(() => json({ data: [], results: [] }));
    expect(await lookupSong("Song Artist")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    expect(await lookupSong("Song Artist")).toBeNull();
  });
});
