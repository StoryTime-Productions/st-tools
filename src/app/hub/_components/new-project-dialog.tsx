"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createProjectAction } from "@/app/actions/hub";
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
import { InitiativeSelect } from "@/app/hub/_components/initiative-select";
import { QuarterRangeFields } from "@/app/hub/_components/quarter-range-fields";
import { keepOpenForInlineEdit } from "@/lib/dismiss";
import type { InitiativeOption } from "@/lib/hub";

export function NewProjectDialog({ initiatives }: { initiatives: InitiativeOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [initiativeId, setInitiativeId] = useState<string | null>(null);
  const [quarters, setQuarters] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const [isPending, startTransition] = useTransition();

  function reset() {
    setTitle("");
    setDescription("");
    setInitiativeId(null);
    setQuarters({ start: null, end: null });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!initiativeId) {
      toast.error("Choose an initiative");
      return;
    }

    startTransition(async () => {
      const result = await createProjectAction({
        title,
        description: description.trim() || null,
        initiativeId,
        startQuarter: quarters.start,
        endQuarter: quarters.end,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Project created");
      reset();
      setOpen(false);
      router.push(`/hub/projects/${result.projectId}`);
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
        <Button className="gap-2">
          <Plus className="size-4" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" onEscapeKeyDown={keepOpenForInlineEdit}>
        <DialogHeader>
          <DialogTitle>Create a project</DialogTitle>
          <DialogDescription>
            Phases, links, tags and boards can be added from the project page.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="project-title">Title</Label>
            <Input
              id="project-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="St-tools"
              maxLength={120}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-initiative">Initiative</Label>
            <InitiativeSelect
              id="project-initiative"
              initiatives={initiatives}
              value={initiativeId}
              onChange={setInitiativeId}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this project about?"
              rows={3}
            />
          </div>

          <QuarterRangeFields
            start={quarters.start}
            end={quarters.end}
            onChange={setQuarters}
            disabled={isPending}
          />

          <DialogFooter showCloseButton>
            <Button
              type="submit"
              disabled={isPending || title.trim().length === 0 || !initiativeId}
            >
              {isPending ? "Creating..." : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
