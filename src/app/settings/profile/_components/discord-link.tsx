"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { connectDiscordAction, disconnectDiscordAction } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";

export function DiscordLink({ connected }: { connected: boolean }) {
  const [isPending, startTransition] = useTransition();

  function run(action: typeof connectDiscordAction, message?: string) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
      } else if (message) {
        toast.success(message);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        {connected
          ? "Connected. st-bot can message you on Discord."
          : "Connect your Discord account so st-bot can message you."}
      </p>
      {connected ? (
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => run(disconnectDiscordAction, "Discord disconnected")}
        >
          Disconnect
        </Button>
      ) : (
        <Button type="button" disabled={isPending} onClick={() => run(connectDiscordAction)}>
          Connect Discord
        </Button>
      )}
    </div>
  );
}
