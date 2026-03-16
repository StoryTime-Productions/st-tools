"use client";

import { useState, useTransition, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createBoardAction } from "@/app/actions/boards";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface CreateBoardDialogProps {
  triggerLabel?: string;
  triggerVariant?: ComponentProps<typeof Button>["variant"];
  triggerSize?: ComponentProps<typeof Button>["size"];
}

export function CreateBoardDialog({
  triggerLabel = "New board",
  triggerVariant = "default",
  triggerSize = "default",
}: CreateBoardDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [collaborative, setCollaborative] = useState(false);
  const [openToWorkspace, setOpenToWorkspace] = useState(true);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setTitle("");
    setCollaborative(false);
    setOpenToWorkspace(true);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !isPending) {
      reset();
    }

    setOpen(nextOpen);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await createBoardAction({
        title,
        collaborative,
        openToWorkspace,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success(collaborative ? "Collaborative board created" : "Personal board created");
      reset();
      setOpen(false);

      if (result.boardId) {
        router.push(`/boards/${result.boardId}`);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} className="gap-2">
          <Plus className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a board</DialogTitle>
          <DialogDescription>
            Start with a private personal board or open a collaborative board for the team.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="board-title">Board name</Label>
            <Input
              id="board-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={collaborative ? "Production planning" : "Personal planning"}
              maxLength={120}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Board type</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCollaborative(false)}
                className={cn(
                  "rounded-2xl border px-4 py-3 text-left transition-colors",
                  !collaborative
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div className="text-sm font-medium">Personal</div>
                <div
                  className={cn(
                    "text-xs",
                    !collaborative ? "text-background/70" : "text-muted-foreground"
                  )}
                >
                  Visible only to you.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setCollaborative(true)}
                className={cn(
                  "rounded-2xl border px-4 py-3 text-left transition-colors",
                  collaborative
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div className="text-sm font-medium">Collaborative</div>
                <div
                  className={cn(
                    "text-xs",
                    collaborative ? "text-background/70" : "text-muted-foreground"
                  )}
                >
                  Shared with teammates.
                </div>
              </button>
            </div>
          </div>

          {collaborative ? (
            <label className="flex items-start gap-3 rounded-2xl border px-4 py-3">
              <input
                type="checkbox"
                checked={openToWorkspace}
                onChange={(event) => setOpenToWorkspace(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border"
              />
              <div className="space-y-1">
                <div className="text-sm font-medium">Open to the full workspace</div>
                <p className="text-muted-foreground text-xs leading-5">
                  Turn this off if you want to invite specific teammates instead of making the board
                  visible to everyone.
                </p>
              </div>
            </label>
          ) : null}

          <DialogFooter showCloseButton>
            <Button type="submit" disabled={isPending || title.trim().length === 0}>
              {isPending ? "Creating..." : "Create board"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
