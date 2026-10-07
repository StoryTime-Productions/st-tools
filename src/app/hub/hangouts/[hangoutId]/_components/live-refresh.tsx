"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const DEBOUNCE_MS = 500;

/** Re-fetches the server-rendered page when anyone changes this hangout. Renders nothing. */
export function LiveRefresh({ hangoutId }: { hangoutId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`hangout:${hangoutId}`) // topic matches hangoutTopic() in lib/hangout-live.ts
      .on("broadcast", { event: "changed" }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
      })
      .subscribe();

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [hangoutId, router]);

  return null;
}
