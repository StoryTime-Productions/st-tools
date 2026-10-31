import { Flame, Headphones } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { VoiceNowRow } from "@/lib/discord-stats";
import { projectInitials } from "@/lib/hub-format";

const SINCE = {
  timeZone: "America/Toronto",
  hour: "numeric",
  minute: "2-digit",
} as const;

export function RightNow({
  voice,
  wordle,
  loaded,
}: {
  voice: VoiceNowRow[];
  wordle: { streak: number; postedOn: string } | null;
  loaded: boolean;
}) {
  return (
    <section aria-labelledby="right-now-heading" className="space-y-4">
      <h2 id="right-now-heading" className="text-2xl font-semibold tracking-tight">
        Right now
      </h2>

      {!loaded ? (
        <Card role="alert" className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardContent className="text-muted-foreground text-sm">
            Couldn&apos;t load the Discord stats. Try refreshing in a moment.
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card className="border-border/70 bg-background/85 min-w-0 rounded-3xl shadow-none">
            <CardHeader>
              <h3 className="flex items-center gap-2 text-base leading-none font-semibold">
                <Headphones aria-hidden="true" className="text-muted-foreground size-4" />
                On a call
                <span className="text-muted-foreground text-sm font-normal">
                  {voice.length === 0 ? "" : `· ${voice.length}`}
                </span>
              </h3>
            </CardHeader>
            <CardContent>
              {voice.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nobody is on a call right now.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {voice.map((person) => (
                    <li key={person.discordId} className="flex min-w-0 items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarImage src={person.avatarUrl ?? undefined} alt="" />
                        <AvatarFallback className="text-[10px]">
                          {projectInitials(person.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" title={person.name}>
                          {person.name}
                        </p>
                        <p className="text-muted-foreground text-xs break-words">
                          {person.channelName} · since{" "}
                          {person.joinedAt.toLocaleTimeString("en-US", SINCE)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-background/85 min-w-0 rounded-3xl shadow-none">
            <CardHeader>
              <h3 className="flex items-center gap-2 text-base leading-none font-semibold">
                <Flame aria-hidden="true" className="text-muted-foreground size-4" />
                Wordle streak
              </h3>
            </CardHeader>
            <CardContent>
              {wordle ? (
                <>
                  <p className="text-4xl font-bold tracking-tight tabular-nums">
                    {wordle.streak}{" "}
                    <span className="text-muted-foreground text-base font-medium">
                      {wordle.streak === 1 ? "day" : "days"}
                    </span>
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    Group streak as of {wordle.postedOn}.
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  The streak shows up after the next Wordle post.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
