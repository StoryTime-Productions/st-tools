"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  lockInHangoutAction,
  reopenAvailabilityAction,
  setAttendanceAction,
} from "@/app/actions/hangouts";
import { Button } from "@/components/ui/button";
import type { RankedRun } from "@/lib/availability";
import { dayLabel, timeLabel } from "@/lib/calendar";

const DAY = { weekday: "short", month: "short", day: "numeric" } as const;
const STATUSES = [
  ["GOING", "Going"],
  ["MAYBE", "Maybe"],
  ["NOT_GOING", "Not going"],
] as const;

function useAction() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<{ error: string } | { success: true }>, done: string) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }
  return [isPending, run] as const;
}

export function RankedSlots({
  hangoutId,
  runs,
  total,
  canLock,
}: {
  hangoutId: string;
  runs: RankedRun[];
  total: number;
  canLock: boolean;
}) {
  const [isPending, run] = useAction();

  if (runs.length === 0) return null;

  function lockIn({ day, start }: RankedRun) {
    const label = `${dayLabel(day, DAY)}, ${timeLabel(start)}`;
    if (!window.confirm(`Lock in ${label}? Members free then start as Going, the rest Maybe.`))
      return;
    run(() => lockInHangoutAction({ hangoutId, slot: `${day}T${start}` }), "Hangout scheduled");
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Best times</p>
      <ol className="space-y-2">
        {runs.map((option) => (
          <li
            key={`${option.day}T${option.start}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-2 text-sm"
          >
            <span>
              {dayLabel(option.day, DAY)}, {timeLabel(option.start)} – {timeLabel(option.end)}
              <span className="text-muted-foreground">
                {" "}
                · {option.free.length} of {total} free
              </span>
            </span>
            {canLock ? (
              <Button
                size="sm"
                className="max-sm:h-11"
                disabled={isPending}
                onClick={() => lockIn(option)}
              >
                Lock in
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ReopenAvailability({ hangoutId }: { hangoutId: string }) {
  const [isPending, run] = useAction();

  function reopen() {
    if (!window.confirm("Reopen availability? The locked time and everyone's Going / Maybe reset."))
      return;
    run(() => reopenAvailabilityAction(hangoutId), "Availability reopened");
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="max-sm:h-11"
      disabled={isPending}
      onClick={reopen}
    >
      Reopen availability
    </Button>
  );
}

export function LockedIn({
  hangoutId,
  startSlot,
  attendees,
  userId,
}: {
  hangoutId: string;
  startSlot: string;
  attendees: { userId: string; name: string; status: string }[];
  userId: string;
}) {
  const [isPending, run] = useAction();
  const [day, time] = startSlot.split("T");
  const mine = attendees.find((attendee) => attendee.userId === userId)?.status;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Locked in
          </p>
          <p className="text-lg font-semibold">
            {dayLabel(day, DAY)} · {timeLabel(time)} EST
          </p>
        </div>
        <div className="grid grid-cols-3 gap-1 sm:flex" role="group" aria-label="Your attendance">
          {STATUSES.map(([status, label]) => (
            <Button
              key={status}
              size="sm"
              variant={mine === status ? "default" : "outline"}
              className="h-11 whitespace-nowrap sm:h-8"
              aria-pressed={mine === status}
              disabled={isPending}
              onClick={() =>
                run(() => setAttendanceAction({ hangoutId, status }), "Attendance saved")
              }
            >
              {mine === status ? <Check className="size-4" aria-hidden="true" /> : null}
              {label}
            </Button>
          ))}
        </div>
      </div>
      <dl className="space-y-2">
        {STATUSES.map(([status, label]) => {
          const people = attendees.filter((attendee) => attendee.status === status);
          return (
            <div key={status} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
              <dt className="w-28 shrink-0 font-medium">
                {label} ({people.length})
              </dt>
              <dd>
                {people.length === 0 ? (
                  <span className="text-muted-foreground">Nobody yet</span>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {people.map((person) => (
                      <li key={person.userId} className="rounded-full border px-2.5 py-0.5">
                        {person.name}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
