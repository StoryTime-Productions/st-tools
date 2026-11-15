import { CountdownAlarm, type ApiCountdown } from "@/components/layout/countdown-alarm";
import { getVisibleCountdowns } from "@/lib/countdowns";

async function loadInitial(userId: string): Promise<ApiCountdown[]> {
  try {
    const list = await getVisibleCountdowns(userId, new Date());
    return list.map((c) => ({
      id: c.id,
      title: c.title,
      targetAt: c.targetAt.toISOString(),
      dismissed: c.dismissed,
    }));
  } catch (error) {
    console.error("Countdown alarm failed to load", error);
    return [];
  }
}

/** Loads this user's countdowns on the server so the alarm banner is in the first paint instead of shifting the page. */
export async function CountdownAlarmServer({ userId }: { userId: string }) {
  return <CountdownAlarm initial={await loadInitial(userId)} />;
}
