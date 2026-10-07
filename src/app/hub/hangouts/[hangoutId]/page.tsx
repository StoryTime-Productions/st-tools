import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvailabilityGrid } from "@/app/hub/hangouts/[hangoutId]/_components/availability-grid";
import { AvailabilitySetup } from "@/app/hub/hangouts/[hangoutId]/_components/availability-setup";
import { Carpools } from "@/app/hub/hangouts/[hangoutId]/_components/carpools";
import { Costs } from "@/app/hub/hangouts/[hangoutId]/_components/costs";
import { CommuteMap } from "@/app/hub/hangouts/[hangoutId]/_components/commute-map";
import { Itinerary } from "@/app/hub/hangouts/[hangoutId]/_components/itinerary";
import { LockedIn, RankedSlots } from "@/app/hub/hangouts/[hangoutId]/_components/lock-in";
import { LiveRefresh } from "@/app/hub/hangouts/[hangoutId]/_components/live-refresh";
import { CancelHangoutButton, HangoutDialog } from "@/app/hub/_components/hangout-dialog";
import { ProjectCover } from "@/app/hub/_components/project-cover";
import { ProjectCoverEditor } from "@/app/hub/projects/[projectId]/_components/project-cover-editor";
import { dayLabel, hourLabel, todayKey, torontoInputValue } from "@/lib/calendar";
import { rankRuns } from "@/lib/availability";
import { getCurrentUser } from "@/lib/get-current-user";
import { getAvailabilityResponses, getHangoutDetail, getMemberOptions } from "@/lib/hangouts";
import { HANGOUT_STATUS_LABEL } from "@/lib/hub-format";
import { buildCommuteMap } from "@/lib/commute-map";
import { scheduleStops, timeText } from "@/lib/itinerary";
import { getStopWeather } from "@/lib/weather";

export default async function HangoutPage({ params }: { params: Promise<{ hangoutId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const { hangoutId } = await params;
  const hangout = await getHangoutDetail(hangoutId);
  if (!hangout) notFound();

  const ended = hangout.phase === "SETTLING_UP" || hangout.phase === "DONE";
  const canEdit =
    user.role === "ADMIN" && hangout.phase !== "CANCELLED" && hangout.phase !== "DONE";
  const collecting = hangout.status === "COLLECTING";
  const hasDates = hangout.availabilityDates.length > 0;
  const responses = hasDates ? await getAvailabilityResponses(hangout.id) : [];
  const scheduled = hangout.status === "SCHEDULED";
  const going = hangout.attendees.filter((attendee) => attendee.status === "GOING").length;
  const headcount = scheduled ? going : responses.length;
  const showCosts = canEdit || hangout.costs.length > 0;
  const members = canEdit ? await getMemberOptions() : [];
  const startSlot = hangout.status === "SCHEDULED" ? hangout.startSlot : null;
  const { times } = scheduleStops(startSlot, hangout.stops);
  const weather =
    startSlot && hangout.stops.length > 0
      ? await getStopWeather(
          startSlot.slice(0, 10),
          hangout.stops.map((stop, index) => ({
            lat: stop.lat,
            lon: stop.lon,
            at: "at" in times[index] ? times[index].at : null,
            durationMinutes: stop.durationMinutes,
          }))
        )
      : [];
  const warnings = [
    ...new Set(weather.flatMap((stop) => (stop.status === "ok" ? stop.warnings : []))),
  ];
  const setup = {
    dates: hangout.availabilityDates,
    startHour: hangout.windowStartHour,
    endHour: hangout.windowEndHour,
  };

  return (
    <div className="space-y-6">
      <LiveRefresh hangoutId={hangout.id} />
      <Link
        href="/hub"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft className="size-4" />
        Hub
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <ProjectCover
            title={hangout.title}
            coverImageUrl={hangout.coverImageUrl}
            className="size-16 text-lg"
          />
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">{hangout.title}</h2>
            <div className="flex flex-wrap gap-2">
              <Badge variant={hangout.status === "CANCELLED" ? "outline" : "secondary"}>
                {HANGOUT_STATUS_LABEL[hangout.phase]}
              </Badge>
              {hangout.phase === "SETTLING_UP" ? (
                <Badge variant="outline">{hangout.unpaid} unpaid</Badge>
              ) : null}
            </div>
            {hangout.proposerName ? (
              <p className="text-muted-foreground text-xs">
                Idea by {hangout.proposerName} in Discord
              </p>
            ) : null}
          </div>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <HangoutDialog hangout={hangout} />
            <CancelHangoutButton hangoutId={hangout.id} title={hangout.title} />
          </div>
        ) : null}
      </div>

      {hangout.description ? (
        <p className="max-w-3xl text-sm leading-6 whitespace-pre-line">{hangout.description}</p>
      ) : null}

      {hangout.discordThreadUrl ? (
        <a
          href={hangout.discordThreadUrl}
          target="_blank"
          rel="noreferrer"
          className="hover:bg-muted/40 inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          Discord thread
        </a>
      ) : null}

      {collecting || hasDates ? (
        <Card
          id="availability"
          className="border-border/70 bg-background/85 rounded-3xl shadow-none"
        >
          <CardHeader>
            <CardTitle className="text-base">Availability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {hangout.status === "SCHEDULED" && hangout.startSlot ? (
              <fieldset disabled={ended} className="min-w-0">
                <LockedIn
                  hangoutId={hangout.id}
                  startSlot={hangout.startSlot}
                  attendees={hangout.attendees}
                  userId={user.id}
                  canReopen={user.role === "ADMIN" && !ended}
                />
              </fieldset>
            ) : null}
            {collecting && user.role === "ADMIN" ? (
              <AvailabilitySetup
                hangoutId={hangout.id}
                today={todayKey()}
                initial={{
                  dates: hangout.availabilityDates,
                  startHour: hangout.windowStartHour,
                  endHour: hangout.windowEndHour,
                  deadline: hangout.availabilityDeadline
                    ? torontoInputValue(hangout.availabilityDeadline)
                    : null,
                }}
              />
            ) : !hasDates ? (
              <p className="text-muted-foreground text-sm">
                The admins haven&apos;t picked dates yet.
              </p>
            ) : (
              <div className="space-y-1 text-sm">
                <p>
                  {hangout.availabilityDates
                    .map((day) =>
                      dayLabel(day, { weekday: "short", month: "short", day: "numeric" })
                    )
                    .join(", ")}
                </p>
                <p className="text-muted-foreground">
                  {hourLabel(hangout.windowStartHour)} – {hourLabel(hangout.windowEndHour)} EST
                  {hangout.availabilityDeadline
                    ? ` · Fill in by ${hangout.availabilityDeadline.toLocaleString("en-US", {
                        timeZone: "America/Toronto",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}`
                    : ""}
                </p>
              </div>
            )}
            {hasDates ? (
              <AvailabilityGrid
                hangoutId={hangout.id}
                setup={setup}
                user={{ id: user.id, name: user.name ?? user.email }}
                responses={responses}
                editable={collecting}
              />
            ) : null}
            {collecting ? (
              <RankedSlots
                hangoutId={hangout.id}
                runs={rankRuns(setup, responses)}
                total={responses.length}
                canLock={user.role === "ADMIN"}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {canEdit || hangout.stops.length > 0 ? (
        <Card id="itinerary" className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Itinerary</CardTitle>
          </CardHeader>
          <CardContent>
            <Itinerary
              hangoutId={hangout.id}
              startSlot={hangout.startSlot}
              stops={hangout.stops}
              canEdit={canEdit && !ended}
              weather={weather}
              costs={hangout.costs}
              headcount={headcount}
            />
          </CardContent>
        </Card>
      ) : null}

      {hangout.status === "SCHEDULED" ? (
        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Commute map</CardTitle>
          </CardHeader>
          <CardContent>
            <CommuteMap
              hasKey={Boolean(process.env.TOMTOM_API_KEY)}
              data={buildCommuteMap(
                hangout.stops.map((stop, index) => ({
                  title: stop.title,
                  lat: stop.lat,
                  lon: stop.lon,
                  time: timeText(times[index], startSlot?.slice(0, 10) ?? null),
                })),
                hangout.cars
              )}
            />
          </CardContent>
        </Card>
      ) : null}

      {hangout.status === "SCHEDULED" ? (
        <Card id="carpools" className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Carpools</CardTitle>
          </CardHeader>
          <CardContent>
            <fieldset disabled={ended} className="min-w-0">
              <Carpools
                hangoutId={hangout.id}
                cars={hangout.cars}
                weather={{
                  warnings,
                  bufferMinutes: hangout.weatherBufferMinutes,
                  checked: weather.length > 0,
                }}
                viewer={{
                  id: user.id,
                  isAdmin: user.role === "ADMIN",
                  going: hangout.attendees.some(
                    (attendee) => attendee.userId === user.id && attendee.status === "GOING"
                  ),
                }}
              />
            </fieldset>
          </CardContent>
        </Card>
      ) : null}

      {showCosts ? (
        <Card id="costs" className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Costs</CardTitle>
          </CardHeader>
          <CardContent>
            <Costs
              hangoutId={hangout.id}
              items={hangout.costs}
              members={members}
              scheduled={scheduled}
              headcount={headcount}
              canEdit={canEdit}
              viewer={{
                id: user.id,
                isAdmin: user.role === "ADMIN",
                status:
                  hangout.attendees.find((attendee) => attendee.userId === user.id)?.status ?? null,
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {canEdit ? (
        <div className="max-w-xl">
          <ProjectCoverEditor
            id={hangout.id}
            title={hangout.title}
            coverImageUrl={hangout.coverImageUrl}
            kind="hangout"
          />
        </div>
      ) : null}
    </div>
  );
}
