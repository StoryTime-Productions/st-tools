import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookupSong = vi.fn();
vi.mock("@/lib/playlist-music", () => ({
  lookupSong: (entry: string) => lookupSong(entry),
  spotifySearchUrl: (entry: string) => `search:${entry}`,
}));

import { getPlaylistWidgetData } from "@/lib/playlist-widget";

const csv = [",Ann,Bo", "Week 1 (DONE),Old - A,Old - B", "Week 2 (56 h left),New - Ann,"].join(
  "\n"
);

const song = { title: "New", artistName: "Ann" };

function stubSheet(body: string, ok = true) {
  const fn = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, text: async () => body });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  process.env.PLAYLIST_CONTRIBUTORS = '{"d-ann":"Ann","d-bo":"Bo"}';
  process.env.PLAYLIST_SHEET_ID = "sheet1";
  process.env.PLAYLIST_URL = "https://open.spotify.com/playlist/x";
  lookupSong.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PLAYLIST_CONTRIBUTORS;
  delete process.env.PLAYLIST_SHEET_ID;
  delete process.env.PLAYLIST_URL;
});

describe("getPlaylistWidgetData", () => {
  it("returns null before any fetch for non-contributors", async () => {
    const fetchMock = stubSheet(csv);
    expect(await getPlaylistWidgetData({ discordId: null })).toBeNull();
    expect(await getPlaylistWidgetData({ discordId: "other" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the matched entry with week info and links", async () => {
    stubSheet(csv);
    lookupSong.mockResolvedValue(song);
    expect(await getPlaylistWidgetData({ discordId: "d-ann" })).toEqual({
      state: "entry",
      entry: "New - Ann",
      song,
      weekNumber: 2,
      timeLeft: "56 h left",
      playlistUrl: "https://open.spotify.com/playlist/x",
      sheetUrl: "https://docs.google.com/spreadsheets/d/sheet1/edit",
    });
  });

  it("returns unmatched with a search link when lookup finds nothing", async () => {
    stubSheet(csv);
    lookupSong.mockResolvedValue(null);
    expect(await getPlaylistWidgetData({ discordId: "d-ann" })).toMatchObject({
      state: "unmatched",
      entry: "New - Ann",
      searchUrl: "search:New - Ann",
    });
  });

  it("returns empty for a blank cell without looking up", async () => {
    stubSheet(csv);
    expect(await getPlaylistWidgetData({ discordId: "d-bo" })).toMatchObject({
      state: "empty",
      weekNumber: 2,
    });
    expect(lookupSong).not.toHaveBeenCalled();
  });

  it.each([
    ["http error", () => stubSheet("", false)],
    ["unparseable sheet", () => stubSheet("a,b")],
    ["network failure", () => vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("x")))],
  ])("returns unavailable on %s", async (_name, setup) => {
    setup();
    expect(await getPlaylistWidgetData({ discordId: "d-ann" })).toMatchObject({
      state: "unavailable",
      playlistUrl: "https://open.spotify.com/playlist/x",
    });
  });

  it("returns unavailable with no links when the sheet id is unset", async () => {
    delete process.env.PLAYLIST_SHEET_ID;
    delete process.env.PLAYLIST_URL;
    expect(await getPlaylistWidgetData({ discordId: "d-ann" })).toEqual({
      state: "unavailable",
      playlistUrl: null,
      sheetUrl: null,
    });
  });

  it("returns unavailable when lookup throws", async () => {
    stubSheet(csv);
    lookupSong.mockRejectedValue(new Error("boom"));
    expect(await getPlaylistWidgetData({ discordId: "d-ann" })).toMatchObject({
      state: "unavailable",
    });
  });
});
