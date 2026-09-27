"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteInitiativeAction, renameInitiativeAction } from "@/app/actions/hub";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { keepOpenForInlineEdit } from "@/lib/dismiss";
import type { InitiativeOption } from "@/lib/hub";

function InitiativeRow({ initiative }: { initiative: InitiativeOption }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initiative.name);
  const [isPending, startTransition] = useTransition();

  function handleRename() {
    startTransition(async () => {
      const result = await renameInitiativeAction(initiative.id, name);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Initiative renamed");
      setEditing(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (
      !window.confirm(
        `Delete "${initiative.name}"? Its projects stay, but will no longer have an initiative.`
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await deleteInitiativeAction(initiative.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Initiative deleted");
      router.refresh();
    });
  }

  if (editing) {
    return (
      <li className="flex gap-2">
        <Input
          aria-label={`Rename ${initiative.name}`}
          data-inline-edit
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleRename();
            if (event.key === "Escape") setEditing(false);
          }}
          maxLength={80}
          autoFocus
          disabled={isPending}
        />
        <Button type="button" onClick={handleRename} disabled={isPending || !name.trim()}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-2">
      <span className="truncate text-sm font-medium">{initiative.name}</span>
      <div className="flex shrink-0 gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => setEditing(true)}
          aria-label={`Rename ${initiative.name}`}
          disabled={isPending}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={handleDelete}
          aria-label={`Delete ${initiative.name}`}
          disabled={isPending}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}

export function ManageInitiativesDialog({ initiatives }: { initiatives: InitiativeOption[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Manage initiatives</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" onEscapeKeyDown={keepOpenForInlineEdit}>
        <DialogHeader>
          <DialogTitle>Initiatives</DialogTitle>
          <DialogDescription>
            Rename or delete initiatives. New ones are created from a project&apos;s initiative
            picker.
          </DialogDescription>
        </DialogHeader>
        {initiatives.length === 0 ? (
          <p className="text-muted-foreground text-sm">No initiatives yet.</p>
        ) : (
          <ul className="space-y-2">
            {initiatives.map((initiative) => (
              <InitiativeRow key={`${initiative.id}:${initiative.name}`} initiative={initiative} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
