export interface SongMatch {
  title: string;
  artistName: string;
  albumArtUrl: string | null;
  trackUrl: string | null;
  durationSec: number | null;
  genre: string | null;
  source: "deezer" | "itunes";
}

const LOOKUP_TIMEOUT_MS = 5000;
const REVALIDATE_SEC = 60 * 60 * 24 * 7;

export function normalizeSearchQuery(entry: string): string {
  return entry
    .replace(/^["“]+|["”]+$/g, "")
    .replace(/\s+by\s+/i, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlausibleMatch(entry: string, title: string, artistName: string): boolean {
  const normalizedEntry = entry.toLowerCase();
  return (
    normalizedEntry.includes(artistName.toLowerCase()) ||
    normalizedEntry.includes(title.toLowerCase())
  );
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: REVALIDATE_SEC },
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function formatDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function spotifySearchUrl(entry: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(entry.trim())}`;
}

interface DeezerSearchResponse {
  data?: Array<{
    title?: string;
    link?: string;
    duration?: number;
    artist?: { name?: string };
    album?: { id?: number; cover_big?: string; cover_medium?: string };
  }>;
}

async function deezerGenre(albumId: number | undefined): Promise<string | null> {
  if (albumId === undefined) return null;
  const json = (await fetchJson(`https://api.deezer.com/album/${albumId}`)) as {
    genres?: { data?: Array<{ name?: string }> };
  } | null;
  return json?.genres?.data?.[0]?.name ?? null;
}

async function searchDeezer(entry: string, query: string): Promise<SongMatch | null> {
  const url = `https://api.deezer.com/search?limit=1&q=${encodeURIComponent(query)}`;
  const json = (await fetchJson(url)) as DeezerSearchResponse | null;
  const track = json?.data?.[0];
  if (!track?.title || !track.artist?.name) return null;
  if (!isPlausibleMatch(entry, track.title, track.artist.name)) return null;

  return {
    title: track.title,
    artistName: track.artist.name,
    albumArtUrl: track.album?.cover_big ?? track.album?.cover_medium ?? null,
    trackUrl: track.link ?? null,
    durationSec: track.duration && track.duration > 0 ? track.duration : null,
    genre: await deezerGenre(track.album?.id),
    source: "deezer",
  };
}

interface ItunesSearchResponse {
  results?: Array<{
    trackName?: string;
    artistName?: string;
    artworkUrl100?: string;
    trackViewUrl?: string;
    trackTimeMillis?: number;
    primaryGenreName?: string;
  }>;
}

async function searchItunes(entry: string, query: string): Promise<SongMatch | null> {
  const url = `https://itunes.apple.com/search?limit=1&media=music&entity=song&term=${encodeURIComponent(query)}`;
  const json = (await fetchJson(url)) as ItunesSearchResponse | null;
  const track = json?.results?.[0];
  if (!track?.trackName || !track.artistName) return null;
  if (!isPlausibleMatch(entry, track.trackName, track.artistName)) return null;

  return {
    title: track.trackName,
    artistName: track.artistName,
    albumArtUrl: track.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null,
    trackUrl: track.trackViewUrl ?? null,
    durationSec: track.trackTimeMillis ? Math.round(track.trackTimeMillis / 1000) : null,
    genre: track.primaryGenreName || null,
    source: "itunes",
  };
}

export async function lookupSong(entry: string): Promise<SongMatch | null> {
  const query = normalizeSearchQuery(entry);
  if (!query) return null;
  try {
    return (await searchDeezer(entry, query)) ?? (await searchItunes(entry, query));
  } catch {
    return null;
  }
}
