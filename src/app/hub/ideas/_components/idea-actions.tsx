"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { dismissIdeaAction, promoteIdeaAction } from "@/app/actions/hangouts";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function IdeaActions({ ideaId, title }: { ideaId: string; title: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

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

  async function handleDismiss() {
    const confirmed = await confirm(`"${title}" will be deleted. This can't be undone.`, {
      title: "Dismiss this idea?",
      confirmLabel: "Dismiss",
      destructive: true,
    });
    if (!confirmed) return;

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
      <Button
        type="button"
        size="sm"
        aria-label={`Promote ${title}`}
        onClick={handlePromote}
        disabled={isPending}
      >
        <ArrowUpRight className="size-4" />
        Promote
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Dismiss ${title}`}
        onClick={handleDismiss}
        disabled={isPending}
      >
        <Trash2 className="size-4" />
        Dismiss
      </Button>
      {confirmDialog}
    </div>
  );
}
