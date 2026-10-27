import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ChevronDown, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvailabilityGrid } from "@/app/hub/hangouts/[hangoutId]/_components/availability-grid";
import {
  AvailabilitySetup,
  EditableSetup,
} from "@/app/hub/hangouts/[hangoutId]/_components/availability-setup";
import { Carpools, RecomputeRoutes } from "@/app/hub/hangouts/[hangoutId]/_components/carpools";
import { CostDialog, Costs } from "@/app/hub/hangouts/[hangoutId]/_components/costs";
import { CommuteMap } from "@/app/hub/hangouts/[hangoutId]/_components/commute-map";
import { HangoutCover } from "@/app/hub/hangouts/[hangoutId]/_components/hangout-cover";
import { Itinerary, StopDialog } from "@/app/hub/hangouts/[hangoutId]/_components/itinerary";
import {
  LockedIn,
  RankedSlots,
  ReopenAvailability,
} from "@/app/hub/hangouts/[hangoutId]/_components/lock-in";
import { LiveRefresh } from "@/app/hub/hangouts/[hangoutId]/_components/live-refresh";
import { CancelHangoutButton, HangoutDialog } from "@/app/hub/_components/hangout-dialog";
import { hourLabel, todayKey, torontoInputValue } from "@/lib/calendar";
import { rankRuns } from "@/lib/availability";
import { getCurrentUser } from "@/lib/get-current-user";
import { getAvailabilityResponses, getHangoutDetail, getMemberOptions } from "@/lib/hangouts";
import { HANGOUT_STATUS_LABEL } from "@/lib/hub-format";
import { buildCommuteMap, toMapCar, toMapTransit } from "@/lib/commute-map";
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
  const goingIds = hangout.attendees
    .filter((attendee) => attendee.status === "GOING")
    .map((attendee) => attendee.userId);
  const showCosts = canEdit || hangout.costs.length > 0;
  const members = canEdit ? await getMemberOptions() : [];
  const startSlot = hangout.status === "SCHEDULED" ? hangout.startSlot : null;
  const { times } = scheduleStops(startSlot, hangout.stops);
  // Homes of everyone on a car, so "another rider's home" points can be placed on the map.
  const homes = new Map(
    hangout.cars.flatMap((car) =>
      [car.driver, ...car.pickups, ...car.dropoffs].map((person) => [
        person.userId,
        person.homeLat !== null && person.homeLon !== null
          ? ([person.homeLat, person.homeLon] as [number, number])
          : null,
      ])
    )
  );
  const homeOf = (userId: string) => homes.get(userId) ?? null;
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

  const setupSummary = (
    <p className="text-muted-foreground flex flex-col text-sm sm:flex-row sm:gap-x-2">
      <span className="whitespace-nowrap">
        Window: {hourLabel(hangout.windowStartHour)} – {hourLabel(hangout.windowEndHour)} EST
      </span>
      {hangout.availabilityDeadline ? (
        <>
          <span aria-hidden="true" className="hidden sm:inline">
            ·
          </span>
          <span className="whitespace-nowrap">
            Fill in by{" "}
            {hangout.availabilityDeadline.toLocaleString("en-US", {
              timeZone: "America/Toronto",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </>
      ) : null}
    </p>
  );
  const showItinerary = canEdit || hangout.stops.length > 0;
  const jumps = [
    collecting || hasDates ? ["#availability", "Availability"] : null,
    showItinerary ? ["#itinerary", "Itinerary"] : null,
    ["#commute", "Commute"],
    ["#carpools", "Carpools"],
    showCosts ? ["#costs", "Costs"] : null,
  ].filter((jump): jump is string[] => jump !== null);

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
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
          <HangoutCover
            id={hangout.id}
            title={hangout.title}
            coverImageUrl={hangout.coverImageUrl}
            canEdit={canEdit}
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

      {scheduled ? (
        <nav
          aria-label="Jump to a section"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 lg:hidden"
        >
          {jumps.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="hover:bg-muted/40 inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm"
            >
              {label}
            </a>
          ))}
        </nav>
      ) : null}

      {collecting || hasDates ? (
        <Card
          id="availability"
          className="border-border/70 bg-background/85 gap-4 rounded-3xl shadow-none"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Availability</CardTitle>
            {hangout.status === "SCHEDULED" && user.role === "ADMIN" && !ended ? (
              <ReopenAvailability hangoutId={hangout.id} />
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {hangout.status === "SCHEDULED" && hangout.startSlot ? (
              <fieldset disabled={ended} className="min-w-0">
                <LockedIn
                  hangoutId={hangout.id}
                  startSlot={hangout.startSlot}
                  attendees={hangout.attendees}
                  userId={user.id}
                />
              </fieldset>
            ) : null}
            {collecting && user.role === "ADMIN" ? (
              <EditableSetup
                defaultOpen={!hasDates}
                summary={
                  hasDates ? (
                    setupSummary
                  ) : (
                    <p className="text-muted-foreground">Pick dates to start collecting.</p>
                  )
                }
              >
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
              </EditableSetup>
            ) : !hasDates ? (
              <p className="text-muted-foreground text-sm">
                The admins haven&apos;t picked dates yet.
              </p>
            ) : (
              setupSummary
            )}
            {hasDates && scheduled ? (
              <details className="group rounded-2xl border">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  Availability responses
                  <ChevronDown
                    className="size-4 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="p-4 pt-0">
                  <AvailabilityGrid
                    hangoutId={hangout.id}
                    setup={setup}
                    user={{ id: user.id, name: user.name ?? user.email }}
                    responses={responses}
                    editable={collecting}
                  />
                </div>
              </details>
            ) : hasDates ? (
              <div className="space-y-4 border-t pt-4">
                <AvailabilityGrid
                  hangoutId={hangout.id}
                  setup={setup}
                  user={{ id: user.id, name: user.name ?? user.email }}
                  responses={responses}
                  editable={collecting}
                />
              </div>
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

      {showItinerary ? (
        <Card id="itinerary" className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Itinerary</CardTitle>
            {canEdit && !ended ? <StopDialog hangoutId={hangout.id} costs={hangout.costs} /> : null}
          </CardHeader>
          {hangout.stops.length > 0 || scheduled ? (
            <CardContent>
              <Itinerary
                hangoutId={hangout.id}
                startSlot={hangout.startSlot}
                stops={hangout.stops}
                canEdit={canEdit && !ended}
                weather={weather}
                costs={hangout.costs}
              />
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {hangout.status === "SCHEDULED" ? (
        <Card id="commute" className="border-border/70 bg-background/85 rounded-3xl shadow-none">
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
                hangout.cars.map((car) => toMapCar(car, homeOf)),
                hangout.stopRoute,
                toMapTransit(hangout.transit)
              )}
            />
          </CardContent>
        </Card>
      ) : null}

      {hangout.status === "SCHEDULED" ? (
        <Card id="carpools" className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Carpools</CardTitle>
            {user.role === "ADMIN" && !ended && hangout.cars.length > 0 ? (
              <RecomputeRoutes hangoutId={hangout.id} />
            ) : null}
          </CardHeader>
          <CardContent>
            <fieldset disabled={ended} className="min-w-0">
              <Carpools
                hangoutId={hangout.id}
                cars={hangout.cars}
                attendees={hangout.attendees}
                transit={hangout.transit}
                weather={{ warnings, checked: weather.length > 0 }}
                stops={hangout.stops.flatMap((stop) =>
                  stop.address ? [{ id: stop.id, title: stop.title, address: stop.address }] : []
                )}
                viewer={{
                  id: user.id,
                  isAdmin: user.role === "ADMIN",
                  going: hangout.attendees.some(
                    (attendee) => attendee.userId === user.id && attendee.status === "GOING"
                  ),
                  homeAddress: user.homeAddress,
                }}
              />
            </fieldset>
          </CardContent>
        </Card>
      ) : null}

      {showCosts ? (
        <Card id="costs" className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Costs</CardTitle>
            {canEdit ? (
              <CostDialog hangoutId={hangout.id} members={members} goingIds={goingIds} />
            ) : null}
          </CardHeader>
          {hangout.costs.length > 0 ? (
            <CardContent>
              <Costs
                items={hangout.costs}
                members={members}
                scheduled={scheduled}
                goingIds={goingIds}
                canEdit={canEdit}
                viewer={{
                  id: user.id,
                  isAdmin: user.role === "ADMIN",
                  status:
                    hangout.attendees.find((attendee) => attendee.userId === user.id)?.status ??
                    null,
                }}
              />
            </CardContent>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
