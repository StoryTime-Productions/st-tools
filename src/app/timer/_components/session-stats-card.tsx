import type { PomodoroStatsSnapshot } from "@/lib/pomodoro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SessionStatsCardProps {
  stats: PomodoroStatsSnapshot;
}

export function SessionStatsCard({ stats }: SessionStatsCardProps) {
  const tiles = [
    { label: "Today", value: stats.todayCount },
    { label: "This week", value: stats.weekCount },
    { label: "All time", value: stats.totalCount },
  ];
  const maxCount = Math.max(1, ...stats.weekDays.map((day) => day.count));

  return (
    <Card className="border-border/70 bg-background/85 gap-4 rounded-3xl shadow-none">
      <CardHeader className="gap-0">
        <CardTitle className="text-base">Session stats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-3 gap-2">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-2xl border p-3">
              <dt
                className="text-muted-foreground text-xs"
                title={tile.label === "This week" ? "Monday to Sunday" : undefined}
              >
                {tile.label}
              </dt>
              <dd className="text-2xl font-semibold">{tile.value}</dd>
            </div>
          ))}
        </dl>

        {stats.totalCount === 0 ? (
          <p className="text-muted-foreground text-sm">
            No sessions yet. Start a focus session to see your week here.
          </p>
        ) : (
          <div
            role="img"
            aria-label={`Sessions per day this week: ${stats.weekDays
              .map((day) => `${day.label} ${day.count}`)
              .join(", ")}`}
          >
            <div className="flex h-28 gap-2">
              {stats.weekDays.map((day) => {
                const isToday = day.isToday;

                return (
                  <div
                    key={day.dateKey}
                    title={`${day.label}: ${day.count} session${day.count === 1 ? "" : "s"}`}
                    className="flex h-full flex-1 flex-col items-center gap-1"
                  >
                    <span
                      className={cn(
                        "h-4 text-xs tabular-nums",
                        isToday ? "font-bold" : "font-medium"
                      )}
                    >
                      {day.count > 0 ? day.count : ""}
                    </span>
                    <div className="border-border flex min-h-0 w-full flex-1 items-end justify-center border-b">
                      <div
                        className={cn(
                          "w-full max-w-7 rounded-t-sm",
                          isToday ? "bg-primary" : "bg-foreground/50"
                        )}
                        style={{
                          height: day.count === 0 ? "1px" : `${(day.count / maxCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-muted-foreground mt-1 flex gap-2 text-xs">
              {stats.weekDays.map((day) => (
                <span
                  key={day.dateKey}
                  className={cn("flex-1 text-center", day.isToday && "text-foreground font-medium")}
                >
                  {day.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="sr-only">
          <table>
            <caption>Sessions per day</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {stats.weekDays.map((day) => (
                <tr key={day.dateKey}>
                  <th scope="row">{day.label}</th>
                  <td>{day.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
