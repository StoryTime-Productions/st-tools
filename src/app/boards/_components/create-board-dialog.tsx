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
  const [isPending, startTransition] = useTransition();

  function reset() {
    setTitle("");
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
      const result = await createBoardAction({ title });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Board created");
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
            You become its first member. Add teammates from the board.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="board-title">Board name</Label>
            <Input
              id="board-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Production planning"
              maxLength={120}
              autoFocus
            />
          </div>

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
