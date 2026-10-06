"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { setAvailabilitySetupAction } from "@/app/actions/hangouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dayLabel, hourLabel, rangeLabel, stepAnchor, visibleDays } from "@/lib/calendar";
import { cn } from "@/lib/utils";

export interface AvailabilitySetupValues {
  dates: string[];
  startHour: number;
  endHour: number;
  deadline: string | null;
}

const HOURS = Array.from({ length: 25 }, (_, hour) => hour);

export function AvailabilitySetup({
  hangoutId,
  today,
  initial,
}: {
  hangoutId: string;
  today: string;
  initial: AvailabilitySetupValues;
}) {
  const router = useRouter();
  const [dates, setDates] = useState(initial.dates);
  const [anchor, setAnchor] = useState(initial.dates[0] ?? today);
  const [startHour, setStartHour] = useState(initial.startHour);
  const [endHour, setEndHour] = useState(initial.endHour);
  const [deadline, setDeadline] = useState(initial.deadline ?? "");
  const [isPending, startTransition] = useTransition();

  const month = anchor.slice(0, 7);
  const days = visibleDays("month", anchor);

  function toggle(day: string) {
    setDates((current) =>
      current.includes(day) ? current.filter((key) => key !== day) : [...current, day].sort()
    );
  }

  function handleSave() {
    startTransition(async () => {
      const values = { hangoutId, dates, startHour, endHour, deadline: deadline || null };
      let result = await setAvailabilitySetupAction(values);
      if ("confirmDrop" in result) {
        const members = result.confirmDrop === 1 ? "1 member" : `${result.confirmDrop} members`;
        if (!confirm(`This drops availability outside the new dates or hours for ${members}.`))
          return;
        result = await setAvailabilitySetupAction(values, true);
      }
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Availability setup saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-10 lg:space-y-0">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium whitespace-nowrap">
            Dates <span className="text-muted-foreground">({dates.length} picked)</span>
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Previous month"
              onClick={() => setAnchor(stepAnchor("month", anchor, -1))}
            >
              <ChevronLeft />
            </Button>
            <p className="w-32 text-center text-sm">{rangeLabel("month", anchor)}</p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Next month"
              onClick={() => setAnchor(stepAnchor("month", anchor, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {days.slice(0, 7).map((day) => (
            <span key={day} className="text-muted-foreground py-1" aria-hidden="true">
              {dayLabel(day, { weekday: "narrow" })}
            </span>
          ))}
          {days.map((day) => {
            if (!day.startsWith(month)) return <span key={day} />;
            const picked = dates.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={picked}
                aria-label={dayLabel(day, { weekday: "long", month: "long", day: "numeric" })}
                disabled={day < today && !picked}
                onClick={() => toggle(day)}
                className={cn(
                  "focus-visible:ring-ring h-11 rounded-lg text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40",
                  picked ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  day === today && !picked && "border-primary border"
                )}
              >
                {Number(day.slice(8))}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-5">
        <div className="flex flex-wrap items-end gap-4 lg:flex-col lg:items-stretch">
          <HourSelect
            label="No earlier than"
            value={startHour}
            hours={HOURS.slice(0, 24)}
            onChange={setStartHour}
          />
          <HourSelect
            label="No later than"
            value={endHour}
            hours={HOURS.slice(1)}
            onChange={setEndHour}
          />
          <div className="space-y-2">
            <Label htmlFor="availability-deadline">Deadline (optional, EST)</Label>
            <Input
              id="availability-deadline"
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              className="w-56 lg:w-full"
            />
          </div>
        </div>

        <Button type="button" onClick={handleSave} disabled={isPending || dates.length === 0}>
          {isPending ? "Saving..." : "Save availability setup"}
        </Button>
      </div>
    </div>
  );
}

function HourSelect({
  label,
  value,
  hours,
  onChange,
}: {
  label: string;
  value: number;
  hours: number[];
  onChange: (hour: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger className="w-32 lg:w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {hours.map((hour) => (
            <SelectItem key={hour} value={String(hour)}>
              {hourLabel(hour)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
