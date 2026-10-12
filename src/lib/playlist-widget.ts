import { getContributorColumn } from "@/lib/playlist-contributors";
import { lookupSong, spotifySearchUrl, type SongMatch } from "@/lib/playlist-music";
import { getSheetUrl, parseSheet, pickCurrentWeek } from "@/lib/playlist-sheet";

const SHEET_REVALIDATE_SEC = 300;
const SHEET_TIMEOUT_MS = 5000;

export interface PlaylistLinks {
  playlistUrl: string | null;
  sheetUrl: string | null;
}

interface WeekInfo extends PlaylistLinks {
  weekNumber: number;
  timeLeft: string | null;
}

export type PlaylistWidgetData =
  | (WeekInfo & { state: "entry"; entry: string; song: SongMatch })
  | (WeekInfo & { state: "unmatched"; entry: string; searchUrl: string })
  | (WeekInfo & { state: "empty" })
  | (PlaylistLinks & { state: "unavailable" });

async function fetchSheetCsv(sheetId: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`,
      {
        signal: controller.signal,
        next: { revalidate: SHEET_REVALIDATE_SEC },
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getPlaylistWidgetData(user: {
  discordId: string | null;
}): Promise<PlaylistWidgetData | null> {
  const column = getContributorColumn(user.discordId);
  if (!column) return null;

  const sheetId = process.env.PLAYLIST_SHEET_ID;
  const links: PlaylistLinks = {
    playlistUrl: process.env.PLAYLIST_URL || null,
    sheetUrl: sheetId ? getSheetUrl(sheetId) : null,
  };

  try {
    if (!sheetId) return { state: "unavailable", ...links };
    const { weeks } = parseSheet(await fetchSheetCsv(sheetId));
    const week = pickCurrentWeek(weeks);
    if (!week) return { state: "unavailable", ...links };

    const info: WeekInfo = {
      weekNumber: week.weekNumber,
      timeLeft: week.status || null,
      ...links,
    };
    const entry = week.entries[column];
    if (!entry) return { state: "empty", ...info };

    const song = await lookupSong(entry);
    if (!song) return { state: "unmatched", entry, searchUrl: spotifySearchUrl(entry), ...info };
    return { state: "entry", entry, song, ...info };
  } catch {
    return { state: "unavailable", ...links };
  }
}
