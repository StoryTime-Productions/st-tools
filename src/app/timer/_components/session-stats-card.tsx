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
  const maxCount = Math.max(1, ...stats.last7Days.map((day) => day.count));
  const todayIndex = stats.last7Days.length - 1;

  return (
    <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Session stats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-3 gap-2">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-2xl border p-3">
              <dt className="text-muted-foreground text-xs">{tile.label}</dt>
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
            aria-label={`Sessions per day for the last 7 days, ${stats.weekCount} this week`}
          >
            <p className="text-muted-foreground mb-2 text-xs">Last 7 days</p>
            <div className="flex h-28 gap-2">
              {stats.last7Days.map((day, index) => {
                const isToday = index === todayIndex;

                return (
                  <div
                    key={day.dateKey}
                    title={`${day.label}: ${day.count} session${day.count === 1 ? "" : "s"}`}
                    className="flex h-full flex-1 flex-col items-center gap-1"
                  >
                    <span className="h-4 text-xs font-medium tabular-nums">
                      {isToday && day.count > 0 ? day.count : ""}
                    </span>
                    <div className="flex min-h-0 w-full flex-1 items-end justify-center">
                      <div
                        className={cn(
                          "w-full max-w-7 rounded-t-sm",
                          isToday ? "bg-primary" : "bg-muted-foreground"
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
              {stats.last7Days.map((day, index) => (
                <span
                  key={day.dateKey}
                  className={cn(
                    "flex-1 text-center",
                    index === todayIndex && "text-foreground font-medium"
                  )}
                >
                  {day.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <table className="sr-only">
          <caption>Sessions per day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {stats.last7Days.map((day) => (
              <tr key={day.dateKey}>
                <th scope="row">{day.label}</th>
                <td>{day.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
