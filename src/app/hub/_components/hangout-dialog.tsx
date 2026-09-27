"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  cancelHangoutAction,
  createHangoutAction,
  updateHangoutAction,
} from "@/app/actions/hangouts";
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
import { Textarea } from "@/components/ui/textarea";
import type { HangoutDetail } from "@/lib/hangouts";

type EditableHangout = Pick<HangoutDetail, "id" | "title" | "description" | "discordThreadUrl">;

export function HangoutDialog({ hangout }: { hangout?: EditableHangout }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(hangout?.title ?? "");
  const [description, setDescription] = useState(hangout?.description ?? "");
  const [threadUrl, setThreadUrl] = useState(hangout?.discordThreadUrl ?? "");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setTitle(hangout?.title ?? "");
    setDescription(hangout?.description ?? "");
    setThreadUrl(hangout?.discordThreadUrl ?? "");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = {
      title,
      description: description.trim() || null,
      discordThreadUrl: threadUrl.trim() || null,
    };

    startTransition(async () => {
      const result = hangout
        ? await updateHangoutAction({ ...values, hangoutId: hangout.id })
        : await createHangoutAction(values);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success(hangout ? "Hangout updated" : "Hangout created");
      setOpen(false);
      if ("hangoutId" in result) {
        reset();
        router.push(`/hub/hangouts/${result.hangoutId}`);
      }
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {hangout ? (
          <Button className="gap-2">
            <Pencil className="size-4" />
            Edit hangout
          </Button>
        ) : (
          <Button className="gap-2">
            <Plus className="size-4" />
            New hangout
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{hangout ? "Edit hangout" : "Create a hangout"}</DialogTitle>
          <DialogDescription>
            {hangout
              ? "Title, description and Discord thread."
              : "It opens for availability; the date is set at lock-in."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="hangout-title">Title</Label>
            <Input
              id="hangout-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Beach day"
              maxLength={120}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hangout-description">Description</Label>
            <Textarea
              id="hangout-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What's the plan?"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hangout-thread">Discord thread link</Label>
            <Input
              id="hangout-thread"
              type="url"
              value={threadUrl}
              onChange={(event) => setThreadUrl(event.target.value)}
              placeholder="https://discord.com/channels/..."
            />
          </div>

          <DialogFooter showCloseButton>
            <Button type="submit" disabled={isPending || title.trim().length === 0}>
              {isPending ? "Saving..." : hangout ? "Save changes" : "Create hangout"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelHangoutButton({ hangoutId, title }: { hangoutId: string; title: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    if (!window.confirm(`Cancel "${title}"? The hangout is kept as a record.`)) return;

    startTransition(async () => {
      const result = await cancelHangoutAction(hangoutId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Hangout cancelled");
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="ghost" onClick={handleCancel} disabled={isPending}>
      <Ban className="size-4" />
      Cancel hangout
    </Button>
  );
}
