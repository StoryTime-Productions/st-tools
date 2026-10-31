"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteBoardAction, renameBoardAction } from "@/app/actions/boards";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";

export interface BoardListItem {
  id: string;
  href: string;
  title: string;
  createdAtLabel: string;
  cardCount: number;
  ownerLabel: string;
  memberLabel: string;
  canManage: boolean;
}

interface BoardListProps {
  boards: BoardListItem[];
}

function BoardRow({ board }: { board: BoardListItem }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(board.title);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const renameButton = useRef<HTMLButtonElement>(null);

  function stopEditing() {
    setIsEditing(false);
    setTimeout(() => renameButton.current?.focus(), 0);
  }

  function handleCancel() {
    setDraftTitle(board.title);
    setError(null);
    stopEditing();
  }

  function handleRename(event: FormEvent) {
    event.preventDefault();
    const nextTitle = draftTitle.trim();
    if (nextTitle === board.title || nextTitle.length === 0) {
      handleCancel();
      return;
    }

    startTransition(async () => {
      const result = await renameBoardAction(board.id, nextTitle);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      toast.success("Board renamed");
      setError(null);
      stopEditing();
      router.refresh();
    });
  }

  async function handleDelete() {
    const confirmed = await confirm(
      `This removes all columns, cards, and checklist items inside "${board.title}".`,
      { title: `Delete ${board.title}?`, confirmLabel: "Delete board", destructive: true }
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteBoardAction(board.id);

      if ("error" in result) {
        toast.error(result.error);
        router.refresh();
        return;
      }

      toast.success("Board deleted");
      router.refresh();
      document.querySelector<HTMLElement>("h1")?.focus();
    });
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") handleCancel();
  }

  return (
    <li className="border-border/60 flex flex-col gap-3 border-b px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      {isEditing ? (
        <form
          onSubmit={handleRename}
          onKeyDown={handleKeyDown}
          className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <Input
              autoFocus
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              maxLength={120}
              disabled={isPending}
              aria-label={`New title for ${board.title}`}
              aria-invalid={error ? true : undefined}
            />
            {error ? (
              <p role="alert" className="text-destructive text-xs">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending || draftTitle.trim().length === 0}>
              <Save className="size-4" />
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={handleCancel}>
              <X className="size-4" />
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="min-w-0 space-y-1">
            <Link
              href={board.href}
              className="focus-visible:ring-ring/50 inline-flex min-h-11 items-center rounded-md font-medium break-words outline-none hover:underline focus-visible:ring-[3px] sm:min-h-0"
            >
              {board.title}
            </Link>
            <p className="text-muted-foreground text-xs">
              {board.ownerLabel}
              <span aria-hidden="true"> · </span>
              {board.memberLabel}
              <span aria-hidden="true"> · </span>
              {board.cardCount} {board.cardCount === 1 ? "card" : "cards"}
              <span aria-hidden="true"> · </span>
              Created {board.createdAtLabel}
            </p>
          </div>

          {board.canManage ? (
            <div className="flex shrink-0 gap-2">
              <Button
                ref={renameButton}
                type="button"
                size="sm"
                variant="outline"
                aria-label={`Rename ${board.title}`}
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="size-4" />
                Rename
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                aria-label={`Delete ${board.title}`}
                disabled={isPending}
                onClick={handleDelete}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          ) : null}
        </>
      )}
      {confirmDialog}
    </li>
  );
}

export function BoardList({ boards }: BoardListProps) {
  return (
    <ul>
      {boards.map((board) => (
        <BoardRow key={board.id} board={board} />
      ))}
    </ul>
  );
}
