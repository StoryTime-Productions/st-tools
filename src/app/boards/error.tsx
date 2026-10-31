"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BoardsError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
        <AlertTriangle aria-hidden="true" className="text-muted-foreground size-7" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">Couldn&apos;t load your boards</h2>
      <p className="text-muted-foreground max-w-md text-sm leading-6">
        Something went wrong on our side. Try again in a moment.
      </p>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
