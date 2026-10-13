import Image from "next/image";
import { ExternalLink, Music } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration } from "@/lib/playlist-music";
import { getPlaylistWidgetData, type PlaylistLinks } from "@/lib/playlist-widget";

function ExternalAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground inline-flex items-center gap-1 underline underline-offset-4 hover:decoration-2"
    >
      {children}
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

function Links({ playlistUrl, sheetUrl }: PlaylistLinks) {
  if (!playlistUrl && !sheetUrl) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
      {playlistUrl ? <ExternalAnchor href={playlistUrl}>Open playlist</ExternalAnchor> : null}
      {sheetUrl ? <ExternalAnchor href={sheetUrl}>Open sheet</ExternalAnchor> : null}
    </div>
  );
}

export async function PlaylistWidget({ discordId }: { discordId: string | null }) {
  const data = await getPlaylistWidgetData({ discordId });
  if (!data) return null;

  const heading =
    data.state === "unavailable"
      ? "Playlist"
      : `Playlist · Week ${data.weekNumber}${data.timeLeft ? ` · ${data.timeLeft}` : ""}`;

  return (
    <Card className="border-border/70 bg-background/80 gap-4 rounded-3xl shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Music className="size-4" aria-hidden />
          {heading}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.state === "entry" ? (
          <div className="flex items-center gap-4">
            {data.song.albumArtUrl ? (
              <Image
                src={data.song.albumArtUrl}
                alt={`Cover art for ${data.song.title}`}
                width={72}
                height={72}
                className="size-[72px] shrink-0 rounded-xl object-cover"
              />
            ) : null}
            <div className="min-w-0 space-y-1">
              <p className="truncate font-semibold">
                {data.song.trackUrl ? (
                  <a
                    href={data.song.trackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-4 hover:underline"
                  >
                    {data.song.title}
                  </a>
                ) : (
                  data.song.title
                )}
              </p>
              <p className="text-muted-foreground truncate text-sm">{data.song.artistName}</p>
              {data.song.genre || data.song.durationSec ? (
                <p className="text-muted-foreground text-xs">
                  {[
                    data.song.genre,
                    data.song.durationSec ? formatDuration(data.song.durationSec) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {data.state === "unmatched" ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium break-words">{data.entry}</p>
            <ExternalAnchor href={data.searchUrl}>Search on Spotify</ExternalAnchor>
          </div>
        ) : null}

        {data.state === "empty" ? (
          <div className="flex items-center gap-4">
            <Skeleton className="size-[72px] shrink-0 rounded-xl" />
            <div className="space-y-2">
              <p className="text-sm font-medium">
                You have not added a song for Week {data.weekNumber} yet
              </p>
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ) : null}

        {data.state === "unavailable" ? (
          <p className="text-muted-foreground text-sm">Playlist is unavailable right now.</p>
        ) : null}

        <Links playlistUrl={data.playlistUrl} sheetUrl={data.sheetUrl} />
      </CardContent>
    </Card>
  );
}
