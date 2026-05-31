"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EMOTE_CONFIG, type EmoteId } from "@/lib/online-presence";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EmoteCardProps {
  onEmote: (emoteId: EmoteId) => Promise<{ retryAfterSeconds?: number } | void>;
}

export function EmoteCard({ onEmote }: EmoteCardProps) {
  const [isOnCooldown, setIsOnCooldown] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const cooldownTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current !== null) clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  const isDisabled = isSending || isOnCooldown;

  async function handleEmote(emoteId: EmoteId) {
    if (isDisabled) return;
    setIsSending(true);

    const result = await onEmote(emoteId);

    const cooldownMs =
      result && "retryAfterSeconds" in result && result.retryAfterSeconds
        ? result.retryAfterSeconds * 1000
        : 5000;

    if (result && "retryAfterSeconds" in result && result.retryAfterSeconds) {
      toast.error(`Wait ${result.retryAfterSeconds}s before emoting again.`);
    }

    if (cooldownTimerRef.current !== null) clearTimeout(cooldownTimerRef.current);
    setIsOnCooldown(true);
    cooldownTimerRef.current = window.setTimeout(() => setIsOnCooldown(false), cooldownMs);

    setIsSending(false);
  }

  return (
    <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Emote</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(EMOTE_CONFIG) as [EmoteId, { label: string; emoji: string }][]).map(
            ([id, { label, emoji }]) => (
              <Button
                key={id}
                type="button"
                variant="outline"
                size="sm"
                disabled={isDisabled}
                onClick={() => void handleEmote(id)}
                className="justify-start gap-2"
              >
                <span aria-hidden="true">{emoji}</span>
                {label}
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
