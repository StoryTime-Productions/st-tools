import { Cake, PartyPopper } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { UpcomingBirthday } from "@/lib/discord-birthdays";
import { formatDay } from "@/lib/discord-stats-format";
import { projectInitials } from "@/lib/hub-format";

export function birthdayLabel(daysUntil: number) {
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `in ${daysUntil} days`;
}

/** Month and day only: a leap year key so Feb 29 stays valid. */
function birthdayDate(month: number, day: number) {
  return formatDay(`2000-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}

export function BirthdaysCard({ birthdays }: { birthdays: UpcomingBirthday[] }) {
  return (
    <Card className="border-border/70 bg-background/80 gap-4 rounded-3xl shadow-none">
      <CardHeader>
        <h2 className="flex items-center gap-2 text-base leading-none font-semibold">
          <Cake className="text-muted-foreground size-4" aria-hidden="true" />
          Birthdays
        </h2>
      </CardHeader>
      <CardContent>
        {birthdays.length === 0 ? (
          <div className="flex items-start gap-3">
            <Cake className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">
              No birthdays saved yet. An admin can add them in Discord with{" "}
              <code className="whitespace-nowrap">/birthday set</code>.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {birthdays.map((birthday) => (
              <li key={birthday.discordId} className="flex items-center gap-3">
                <Avatar className="size-9">
                  <AvatarImage src={birthday.avatarUrl ?? undefined} alt="" />
                  <AvatarFallback className="text-xs">
                    {projectInitials(birthday.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={birthday.name}>
                    {birthday.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {birthdayDate(birthday.month, birthday.day)}
                  </p>
                </div>
                <p
                  className={
                    birthday.daysUntil === 0
                      ? "flex shrink-0 items-center gap-1 text-sm font-semibold"
                      : "text-muted-foreground shrink-0 text-sm"
                  }
                >
                  {birthday.daysUntil === 0 ? (
                    <PartyPopper className="size-4" aria-hidden="true" />
                  ) : null}
                  {birthdayLabel(birthday.daysUntil)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
