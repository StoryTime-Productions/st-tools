"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowUpRight, Pencil, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteBoardAction, renameBoardAction } from "@/app/actions/boards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface BoardListItem {
  id: string;
  href: string;
  title: string;
  createdAtLabel: string;
  cardCount: number;
  ownerLabel: string;
  scopeLabel: string;
  accessDescription: string;
  canManage: boolean;
}

interface BoardListProps {
  boards: BoardListItem[];
}

function BoardRow({ board }: { board: BoardListItem }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(board.title);
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    setDraftTitle(board.title);
    setIsEditing(false);
  }

  function handleRename() {
    const nextTitle = draftTitle.trim();
    if (nextTitle === board.title || nextTitle.length === 0) {
      setDraftTitle(board.title);
      setIsEditing(false);
      return;
    }

    startTransition(async () => {
      const result = await renameBoardAction(board.id, nextTitle);

      if ("error" in result) {
        toast.error(result.error);
        router.refresh();
        return;
      }

      toast.success("Board renamed");
      setIsEditing(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (
      !window.confirm(
        `Delete "${board.title}"? This removes all columns, cards, and checklist items inside it.`
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await deleteBoardAction(board.id);

      if ("error" in result) {
        toast.error(result.error);
        router.refresh();
        return;
      }

      toast.success("Board deleted");
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell className="w-full min-w-0 px-6 py-4 whitespace-normal">
        {isEditing ? (
          <div className="space-y-2">
            <Input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              maxLength={120}
              disabled={isPending}
              aria-label="Board title"
            />
            <p className="text-muted-foreground text-xs">{board.accessDescription}</p>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={board.href} className="font-medium hover:underline">
                {board.title}
              </Link>
              <Badge variant="outline">{board.scopeLabel}</Badge>
            </div>
            <p className="text-muted-foreground text-xs">{board.ownerLabel}</p>
            <p className="text-muted-foreground text-xs">{board.accessDescription}</p>
          </div>
        )}
      </TableCell>

      <TableCell className="text-muted-foreground px-4 py-4 text-sm">
        {board.createdAtLabel}
      </TableCell>

      <TableCell className="px-4 py-4 text-sm font-medium">{board.cardCount}</TableCell>

      <TableCell className="px-6 py-4 whitespace-normal">
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild type="button" size="sm" variant="outline">
            <Link href={board.href}>
              <ArrowUpRight className="size-4" />
              Open
            </Link>
          </Button>

          {board.canManage ? (
            isEditing ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleRename}
                  disabled={isPending || draftTitle.trim().length === 0}
                >
                  <Save className="size-4" />
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={handleCancel}>
                  <X className="size-4" />
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="size-4" />
                  Rename
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={handleDelete}>
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </>
            )
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function BoardList({ boards }: BoardListProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="px-6">Board</TableHead>
          <TableHead className="px-4">Created</TableHead>
          <TableHead className="px-4">Cards</TableHead>
          <TableHead className="px-6 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {boards.map((board) => (
          <BoardRow key={board.id} board={board} />
        ))}
      </TableBody>
    </Table>
  );
}
