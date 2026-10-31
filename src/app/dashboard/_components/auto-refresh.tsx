"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-runs the server data every minute while the tab is visible, so "on a call" stays current. */
export function AutoRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);

  return null;
}
