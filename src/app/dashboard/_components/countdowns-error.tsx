import { AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { RetryButton } from "./retry-button";

/** Shown in place of the Countdowns card when loading them failed, so alarms never vanish silently. */
export function CountdownsError() {
  return (
    <Card role="alert" className="border-border/70 bg-background/80 rounded-3xl shadow-none">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          Countdowns could not load.
        </p>
        <RetryButton />
      </CardContent>
    </Card>
  );
}
