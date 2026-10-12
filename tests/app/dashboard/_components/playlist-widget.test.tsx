import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getPlaylistWidgetData = vi.fn();
vi.mock("@/lib/playlist-widget", () => ({
  getPlaylistWidgetData: (user: unknown) => getPlaylistWidgetData(user),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import { PlaylistWidget } from "@/app/dashboard/_components/playlist-widget";

const links = { playlistUrl: "https://spotify/pl", sheetUrl: "https://sheet/edit" };
const week = { weekNumber: 4, timeLeft: "56 h left", ...links };

async function show(discordId: string | null = "d") {
  render(await PlaylistWidget({ discordId }));
}

beforeEach(() => getPlaylistWidgetData.mockReset());

describe("PlaylistWidget", () => {
  it("renders nothing for non-contributors", async () => {
    getPlaylistWidgetData.mockResolvedValue(null);
    expect(await PlaylistWidget({ discordId: null })).toBeNull();
    expect(getPlaylistWidgetData).toHaveBeenCalledWith({ discordId: null });
  });

  it("shows the song with art, genre, duration and links", async () => {
    getPlaylistWidgetData.mockResolvedValue({
      state: "entry",
      entry: "x",
      song: {
        title: "Song",
        artistName: "Artist",
        albumArtUrl: "https://cdn/a.jpg",
        trackUrl: "https://deezer/1",
        durationSec: 215,
        genre: "Rock",
        source: "deezer",
      },
      ...week,
    });
    await show();
    expect(screen.getByText("Playlist · Week 4 · 56 h left")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Song" })).toHaveAttribute("href", "https://deezer/1");
    expect(screen.getByText("Artist")).toBeInTheDocument();
    expect(screen.getByText("Rock · 3:35")).toBeInTheDocument();
    expect(screen.getByAltText("Cover art for Song")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open playlist/i })).toHaveAttribute(
      "href",
      "https://spotify/pl"
    );
    expect(screen.getByRole("link", { name: /open sheet/i })).toBeInTheDocument();
  });

  it("omits art, link and meta when the source lacks them", async () => {
    getPlaylistWidgetData.mockResolvedValue({
      state: "entry",
      entry: "x",
      song: {
        title: "Song",
        artistName: "Artist",
        albumArtUrl: null,
        trackUrl: null,
        durationSec: null,
        genre: null,
        source: "itunes",
      },
      ...week,
      timeLeft: null,
    });
    await show();
    expect(screen.getByText("Playlist · Week 4")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Song" })).not.toBeInTheDocument();
    expect(screen.queryByText(/·\s*\d/)).not.toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    getPlaylistWidgetData.mockResolvedValue({ state: "empty", ...week });
    await show();
    expect(screen.getByText("You have not added a song for Week 4 yet")).toBeInTheDocument();
  });

  it("shows raw text and a search link when unmatched", async () => {
    getPlaylistWidgetData.mockResolvedValue({
      state: "unmatched",
      entry: "mystery tune",
      searchUrl: "https://spotify/search/x",
      ...week,
    });
    await show();
    expect(screen.getByText("mystery tune")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /search on spotify/i })).toHaveAttribute(
      "href",
      "https://spotify/search/x"
    );
  });

  it("shows a quiet card when unavailable, with no links if unset", async () => {
    getPlaylistWidgetData.mockResolvedValue({
      state: "unavailable",
      playlistUrl: null,
      sheetUrl: null,
    });
    await show();
    expect(screen.getByText("Playlist is unavailable right now.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
