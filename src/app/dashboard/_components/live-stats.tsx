"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the Discord stats live. The bot's reports touch a one-row pulse table; this listens to it
 * over Supabase Realtime and refreshes the server data a moment after any change (a burst of
 * events is one refresh). The pulse carries no member data.
 *
 * If the realtime subscription is not healthy (never connected, errored, timed out or closed) it
 * polls every few seconds instead, so the page still feels live. Coming back to the tab refreshes
 * too, and the minute poll in AutoRefresh is the last safety net.
 */
export function LiveStats({
  debounceMs = 800,
  fallbackPollMs = 10_000,
}: {
  debounceMs?: number;
  fallbackPollMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const refreshSoon = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), debounceMs);
    };
    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, fallbackPollMs);
    };
    const stopPolling = () => {
      clearInterval(pollTimer);
      pollTimer = undefined;
    };

    let cleanup = () => {};
    try {
      const supabase = createClient();
      // Until the subscription reports SUBSCRIBED, assume it may not come up.
      startPolling();
      const channel = supabase
        .channel("dashboard:discord-stats")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "discord_stats_pulse" },
          refreshSoon
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") stopPolling();
          else startPolling();
        });
      cleanup = () => void supabase.removeChannel(channel);
    } catch {
      // No Supabase browser config here: poll instead.
      startPolling();
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(refreshTimer);
      stopPolling();
      document.removeEventListener("visibilitychange", onVisible);
      cleanup();
    };
  }, [router, debounceMs, fallbackPollMs]);

  return null;
}
