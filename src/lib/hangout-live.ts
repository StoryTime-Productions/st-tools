import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/env";

export const hangoutTopic = (hangoutId: string) => `hangout:${hangoutId}`;

/** Tell open pages of this hangout to re-fetch. Carries no data; failures are ignored (pages just stay stale until reload). */
export async function notifyHangout(hangoutId: string) {
  try {
    const { url, anonKey } = getSupabaseConfig();
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { topic: hangoutTopic(hangoutId), event: "changed", payload: {}, private: false },
        ],
      }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // ponytail: best-effort signal; add a retry only if missed updates are reported.
  }
}

/** Revalidate the hangout page and signal open pages once the response is sent. */
export function revalidateHangoutPage(hangoutId: string) {
  revalidatePath(`/hub/hangouts/${hangoutId}`);
  after(() => notifyHangout(hangoutId));
}
