"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { saveCountdownAction } from "@/app/actions/countdowns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { isoToTorontoLocal, torontoLocalToIso } from "@/lib/countdown-time";
import { MAX_COUNTDOWN_TITLE } from "@/lib/countdown-core";

export type CountdownWho = "ONLY_ME" | "EVERYONE" | "CHOSEN";

export interface CountdownItem {
  id: string;
  title: string;
  /** ISO instant; the card and the form read it in Toronto time. */
  targetAt: string;
  scope: "GLOBAL" | "PERSONAL";
  ownerId: string;
  audienceCount: number | null;
  audienceUserIds: string[];
  dismissed: boolean;
}

export interface CountdownMember {
  id: string;
  name: string;
}

const WHO_OPTIONS = [
  { value: "ONLY_ME", label: "Only me" },
  { value: "EVERYONE", label: "Everyone" },
  { value: "CHOSEN", label: "Choose people" },
] as const;

function whoOf(item: CountdownItem | null): CountdownWho {
  if (!item || item.scope === "PERSONAL") return "ONLY_ME";
  return item.audienceCount === null ? "EVERYONE" : "CHOSEN";
}

/** Create or edit one countdown. Only admins see "Who sees it"; members always make personal ones. */
export function CountdownDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  item,
  isAdmin,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  item: CountdownItem | null;
  isAdmin: boolean;
  members: CountdownMember[];
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [when, setWhen] = useState(item ? isoToTorontoLocal(item.targetAt) : "");
  const [who, setWho] = useState<CountdownWho>(whoOf(item));
  const [chosen, setChosen] = useState<string[]>(item?.audienceUserIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const whenInput = useRef<HTMLInputElement>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetAt = torontoLocalToIso(when);
    if (!targetAt) {
      setError("Pick a date and time.");
      whenInput.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveCountdownAction({
        id: item?.id,
        title,
        targetAt,
        who,
        userIds: who === "CHOSEN" ? chosen : [],
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
    });
  }

  function toggleMember(id: string) {
    setChosen((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (isPending ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{item ? "Edit countdown" : "New countdown"}</DialogTitle>
          <DialogDescription>
            Counts down to a date and time in Toronto time.
            {isAdmin
              ? " Personal ones disappear a day after they end."
              : " Only you see it, and it disappears a day after it ends."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="countdown-title">Title</Label>
            <Input
              id="countdown-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={MAX_COUNTDOWN_TITLE}
              placeholder="Road trip"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="countdown-when">Date and time</Label>
            <Input
              id="countdown-when"
              ref={whenInput}
              type="datetime-local"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "countdown-error" : undefined}
              value={when}
              onChange={(event) => setWhen(event.target.value)}
            />
          </div>

          {isAdmin ? (
            <div className="space-y-2">
              <p className="text-sm leading-none font-medium" aria-hidden="true">
                Who sees it
              </p>
              <SegmentedToggle
                label="Who sees it"
                options={WHO_OPTIONS}
                value={who}
                onChange={setWho}
              />
              {who === "CHOSEN" ? (
                <fieldset className="border-border/70 max-h-44 space-y-1 overflow-y-auto rounded-xl border p-2">
                  <legend className="text-muted-foreground px-1 text-xs">
                    {chosen.length} selected
                  </legend>
                  {members.map((member) => (
                    <label
                      key={member.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm sm:min-h-9"
                    >
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={chosen.includes(member.id)}
                        onChange={() => toggleMember(member.id)}
                      />
                      {member.name}
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p
              id="countdown-error"
              role="alert"
              className="text-destructive flex items-start gap-2 text-sm"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <DialogFooter className="max-sm:flex-col-reverse">
            <Button
              type="button"
              variant="outline"
              className="max-sm:h-11"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="max-sm:h-11" disabled={isPending}>
              {isPending ? "Saving..." : item ? "Save changes" : "Create countdown"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
