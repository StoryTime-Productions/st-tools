"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { dismissCountdownAction } from "@/app/actions/countdowns";
import { Button } from "@/components/ui/button";
import {
  countdownTabTitle,
  dueAlarms,
  nextTickMs,
  shouldRing,
  type AlarmCountdown,
} from "@/lib/countdown-alarm";
import { playAlarmChime, useAlarmSound, writeAlarmSound } from "@/lib/countdown-chime";
import { COUNTDOWN_CHANNEL, COUNTDOWNS_CHANGED } from "@/lib/countdown-sync";
import { currentTabTitle, setTabTitle, subscribeTabTitle } from "@/lib/tab-title";

const REFETCH_MS = 60_000;

export interface ApiCountdown {
  id: string;
  title: string;
  targetAt: string;
  dismissed: boolean;
}

function parse(rows: ApiCountdown[]): AlarmCountdown[] {
  return rows.map((row) => ({ ...row, targetAt: new Date(row.targetAt) }));
}

/** Applies the shared tab title: a pomodoro or countdown title over the title of the page itself. */
function useTitleOwner() {
  useEffect(() => {
    let base: string | null = null;
    let written: string | null = null;
    const apply = () => {
      const wanted = currentTabTitle();
      if (wanted === null) {
        if (base !== null) document.title = base;
        base = null;
        written = null;
        return;
      }
      // A page change replaces the title behind our back; whatever is there now is the new base.
      if (base === null || document.title !== written) base = document.title;
      document.title = wanted;
      written = wanted;
    };
    const unsubscribe = subscribeTabTitle(apply);
    // The page's own title is rewritten on every router refresh; take the title back whenever that happens.
    const observer = new MutationObserver(() => {
      if (written !== null && document.title !== written) apply();
    });
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    apply();
    return () => {
      observer.disconnect();
      unsubscribe();
      if (base !== null) document.title = base;
    };
  }, []);
}

/**
 * Countdown alarm for every workspace page: keeps the soonest countdown in the tab title, rings once when one
 * arrives while the tab is open, and shows a banner until the person dismisses it.
 */
export function CountdownAlarm({ initial }: { initial: ApiCountdown[] }) {
  useTitleOwner();
  const [list, setList] = useState<AlarmCountdown[]>(() => parse(initial));
  const [now, setNow] = useState(() => new Date());
  const [soundOn] = useAlarmSound();
  const [blocked, setBlocked] = useState(false);
  const openedAt = useRef(new Date());
  const rung = useRef(new Set<string>());
  const channel = useRef<BroadcastChannel | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/countdowns", { cache: "no-store" });
      if (!response.ok) return;
      const rows = (await response.json()) as ApiCountdown[];
      setList(parse(rows));
    } catch {
      // Offline or signed out: keep what we have.
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFETCH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(COUNTDOWNS_CHANGED, onVisible);
    const bc =
      typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(COUNTDOWN_CHANNEL);
    channel.current = bc;
    if (bc) bc.onmessage = () => void load();
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(COUNTDOWNS_CHANGED, onVisible);
      bc?.close();
      channel.current = null;
    };
  }, [load]);

  useEffect(() => {
    // Read the clock here, not from `now`: a refetch re-runs this effect, and a stale `now` would push the next tick (and the alarm) out by up to a minute.
    const timer = setTimeout(() => setNow(new Date()), nextTickMs(list, new Date()));
    return () => clearTimeout(timer);
  }, [list, now]);

  const due = dueAlarms(list, now);

  useEffect(() => {
    setTabTitle("countdown", countdownTabTitle(list, now));
  }, [list, now]);

  useEffect(() => {
    const fresh = due.filter((c) => !rung.current.has(c.id));
    if (fresh.length === 0) return;
    fresh.forEach((c) => rung.current.add(c.id));
    if (!soundOn || !fresh.some((c) => shouldRing(c, openedAt.current))) return;
    void playAlarmChime().then((played) => setBlocked(!played));
  }, [due, soundOn]);

  useEffect(() => () => setTabTitle("countdown", null), []);

  if (due.length === 0) return null;

  async function dismiss() {
    const ids = due.map((c) => c.id);
    setList((current) => current.map((c) => (ids.includes(c.id) ? { ...c, dismissed: true } : c)));
    const results = await Promise.all(ids.map((id) => dismissCountdownAction(id)));
    const failed = ids.filter((_, index) => "error" in results[index]);
    if (failed.length > 0) {
      setList((current) =>
        current.map((c) => (failed.includes(c.id) ? { ...c, dismissed: false } : c))
      );
      toast.error("Could not dismiss that alarm. Try again.");
    }
    if (failed.length < ids.length) channel.current?.postMessage({ type: "dismissed", ids });
  }

  const silent = !soundOn || blocked;

  return (
    <div
      role="alert"
      className="border-border/70 bg-background mb-6 flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        <BellRing className="size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-semibold break-words">
            {due.length === 1
              ? `${due[0].title} is now`
              : `${due.length} countdowns reached: ${due.map((c) => c.title).join(" · ")}`}
          </p>
          {silent ? (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <VolumeX className="size-3.5" aria-hidden="true" />
              Sound is off
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {silent ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              writeAlarmSound(true);
              setBlocked(false);
              void playAlarmChime().then((played) => setBlocked(!played));
            }}
          >
            Turn on sound
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
