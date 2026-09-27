import { redirect } from "next/navigation";
import { HubCalendar } from "@/app/hub/calendar/_components/hub-calendar";
import { HubTabs } from "@/app/hub/_components/hub-tabs";
import { todayKey } from "@/lib/calendar";
import { getCurrentUser } from "@/lib/get-current-user";
import { getCalendarCards } from "@/lib/hub";

export default async function HubCalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const cards = await getCalendarCards(user);

  return (
    <div className="space-y-6">
      <HubTabs active="/hub/calendar" />
      <HubCalendar cards={cards} today={todayKey()} />
    </div>
  );
}
