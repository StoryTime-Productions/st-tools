"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { dismissIdeaAction, promoteIdeaAction } from "@/app/actions/hangouts";
import { Button } from "@/components/ui/button";

export function IdeaActions({ ideaId, title }: { ideaId: string; title: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handlePromote() {
    startTransition(async () => {
      const result = await promoteIdeaAction(ideaId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Hangout created from idea");
      router.push(`/hub/hangouts/${result.hangoutId}`);
    });
  }

  function handleDismiss() {
    if (!window.confirm(`Dismiss "${title}"? The idea is deleted.`)) return;

    startTransition(async () => {
      const result = await dismissIdeaAction(ideaId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Idea dismissed");
      router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button type="button" size="sm" onClick={handlePromote} disabled={isPending}>
        <ArrowUpRight className="size-4" />
        Promote
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={handleDismiss} disabled={isPending}>
        <Trash2 className="size-4" />
        Dismiss
      </Button>
    </div>
  );
}
