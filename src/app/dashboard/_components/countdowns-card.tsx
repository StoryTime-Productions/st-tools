"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  MoreHorizontal,
  Pencil,
  Plus,
  Timer,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { deleteCountdownAction } from "@/app/actions/countdowns";
import {
  CountdownDialog,
  type CountdownItem,
  type CountdownMember,
} from "@/app/dashboard/_components/countdown-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { playAlarmChime, useAlarmSound } from "@/lib/countdown-chime";
import { formatCountdownDate } from "@/lib/countdown-time";
import {
  MAX_PERSONAL_COUNTDOWNS,
  audienceLabel,
  hasReached,
  remainingLabel,
} from "@/lib/countdown-core";
import { nextTickMs } from "@/lib/countdown-alarm";
import { notifyCountdownsChanged } from "@/lib/countdown-sync";

/** Re-reads the clock on the minute and at each target, on the same schedule as the alarm banner, so a row never lags it. */
function useCountdownClock(targets: Date[]) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setTimeout(
      () => setNow(new Date()),
      nextTickMs(
        targets.map((targetAt) => ({ targetAt })),
        new Date()
      )
    );
    return () => clearTimeout(timer);
  }, [targets, now]);
  return now;
}

export function CountdownsCard({
  countdowns,
  userId,
  isAdmin,
  members,
}: {
  countdowns: CountdownItem[];
  userId: string;
  isAdmin: boolean;
  members: CountdownMember[];
}) {
  const router = useRouter();
  const targets = useMemo(() => countdowns.map((c) => new Date(c.targetAt)), [countdowns]);
  const now = useCountdownClock(targets);
  const [soundOn, setSoundOn] = useAlarmSound();
  const [confirm, confirmDialog] = useConfirm();
  const [dialog, setDialog] = useState<{ item: CountdownItem | null } | null>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const opener = useRef<HTMLElement | undefined>(undefined);
  const personalCount = countdowns.filter((c) => c.scope === "PERSONAL").length;

  function closeDialog() {
    setDialog(null);
    notifyCountdownsChanged();
    router.refresh();
  }

  async function handleDelete(item: CountdownItem) {
    const ok = await confirm(`Delete "${item.title}"? This can't be undone.`, {
      title: "Delete countdown",
      confirmLabel: "Delete",
      destructive: true,
      returnFocusTo: () => newButton.current,
    });
    if (!ok) return;
    const result = await deleteCountdownAction(item.id);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Countdown deleted");
    notifyCountdownsChanged();
    router.refresh();
  }

  const mayManage = (item: CountdownItem) =>
    item.scope === "GLOBAL" ? isAdmin : item.ownerId === userId;

  return (
    <Card className="border-border/70 bg-background/80 gap-4 rounded-3xl shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <h2 className="flex items-center gap-2 text-base leading-none font-semibold">
            <Timer className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
            Countdowns
          </h2>
          <p className="text-muted-foreground text-xs">
            {personalCount}/{MAX_PERSONAL_COUNTDOWNS} personal
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Alarm sound"
            aria-pressed={soundOn}
            title={soundOn ? "Alarm sound is on" : "Alarm sound is off"}
            onClick={() => {
              setSoundOn(!soundOn);
              if (!soundOn) void playAlarmChime();
            }}
          >
            {soundOn ? (
              <Volume2 className="size-4" aria-hidden="true" />
            ) : (
              <VolumeX className="size-4" aria-hidden="true" />
            )}
          </Button>
          <Button
            ref={newButton}
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            aria-label="New countdown"
            onClick={() => setDialog({ item: null })}
          >
            <Plus className="size-4" aria-hidden="true" />
            New
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {countdowns.length === 0 ? (
          <div className="flex items-start gap-3">
            <Timer className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">
              Nothing to count down to yet. Use New to add a date you are looking forward to.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {countdowns.map((item) => {
              const target = new Date(item.targetAt);
              return (
                <li key={item.id} className="flex items-start gap-2 rounded-xl border px-3 py-3">
                  <div className="min-w-0 flex-1 space-y-1.5 pr-1">
                    <p className="text-sm font-medium break-words">{item.title}</p>
                    <p
                      className={
                        hasReached(target, now)
                          ? "text-muted-foreground flex items-center gap-1.5 text-base leading-tight font-medium tabular-nums"
                          : "flex items-center gap-1.5 text-base leading-tight font-semibold tabular-nums"
                      }
                    >
                      {hasReached(target, now) ? (
                        <CheckCircle2 className="size-4" aria-hidden="true" />
                      ) : null}
                      {remainingLabel(target, now)}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {formatCountdownDate(target)}
                      <span aria-hidden="true"> · </span>
                      <span className="sr-only">, </span>
                      {audienceLabel(item)}
                    </p>
                  </div>
                  {mayManage(item) ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          ref={(node) => {
                            if (node) triggers.current.set(item.id, node);
                            else triggers.current.delete(item.id);
                          }}
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="-my-1 -mr-2 shrink-0"
                          aria-label={`Actions for ${item.title}`}
                        >
                          <MoreHorizontal className="size-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            opener.current = triggers.current.get(item.id);
                            setDialog({ item });
                          }}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => handleDelete(item)}>
                          <Trash2 className="size-4" aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {dialog ? (
        <CountdownDialog
          key={dialog.item?.id ?? "new"}
          open
          onOpenChange={closeDialog}
          onCloseAutoFocus={(event) => {
            const target = opener.current?.isConnected ? opener.current : newButton.current;
            opener.current = undefined;
            if (target) {
              event.preventDefault();
              target.focus();
            }
          }}
          item={dialog.item}
          isAdmin={isAdmin}
          members={members}
        />
      ) : null}
      {confirmDialog}
    </Card>
  );
}
