"use client";

import { useTransition } from "react";
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
              <Button size="sm" disabled={isPending} onClick={() => lockIn(option)}>
                Lock in
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function LockedIn({
  hangoutId,
  startSlot,
  attendees,
  userId,
  canReopen,
}: {
  hangoutId: string;
  startSlot: string;
  attendees: { userId: string; name: string; status: string }[];
  userId: string;
  canReopen: boolean;
}) {
  const [isPending, run] = useAction();
  const [day, time] = startSlot.split("T");
  const names = (status: string) =>
    attendees
      .filter((attendee) => attendee.status === status)
      .map((attendee) => attendee.name)
      .join(", ") || "Nobody yet";
  const mine = attendees.find((attendee) => attendee.userId === userId)?.status;

  function reopen() {
    if (!window.confirm("Reopen availability? The locked time and everyone's Going / Maybe reset."))
      return;
    run(() => reopenAvailabilityAction(hangoutId), "Availability reopened");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 text-sm">
      <div className="space-y-1">
        <p className="font-medium">
          {dayLabel(day, DAY)}, {timeLabel(time)} EST
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {STATUSES.map(([status, label]) => (
            <span key={status}>
              <span className="text-muted-foreground">{label}:</span> {names(status)}
            </span>
          ))}
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Your attendance">
        {STATUSES.map(([status, label]) => (
          <Button
            key={status}
            size="sm"
            variant={mine === status ? "default" : "outline"}
            aria-pressed={mine === status}
            disabled={isPending}
            onClick={() =>
              run(() => setAttendanceAction({ hangoutId, status }), "Attendance saved")
            }
          >
            {label}
          </Button>
        ))}
        {canReopen ? (
          <Button size="sm" variant="outline" disabled={isPending} onClick={reopen}>
            Reopen availability
          </Button>
        ) : null}
      </div>
    </div>
  );
}
