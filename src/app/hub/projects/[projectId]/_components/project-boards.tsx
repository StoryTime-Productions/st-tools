"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Plus, Unlink } from "lucide-react";
import { toast } from "sonner";
import { setBoardProjectAction } from "@/app/actions/hub";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectBoard } from "@/lib/hub";

interface ProjectBoardsProps {
  projectId: string;
  boards: ProjectBoard[];
  standaloneBoards: Array<{ id: string; title: string }> | null;
}

function cardCountLabel(count: number) {
  return count === 1 ? "1 card" : `${count} cards`;
}

export function ProjectBoards({ projectId, boards, standaloneBoards }: ProjectBoardsProps) {
  const router = useRouter();
  const [boardToAttach, setBoardToAttach] = useState("");
  const [isPending, startTransition] = useTransition();

  function setProject(boardId: string, nextProjectId: string | null, message: string) {
    startTransition(async () => {
      const result = await setBoardProjectAction(boardId, nextProjectId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(message);
      setBoardToAttach("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {boards.length === 0 ? (
        <p className="text-muted-foreground text-sm">No boards yet.</p>
      ) : (
        <ul className="space-y-2">
          {boards.map((board) => (
            <li
              key={board.id}
              className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-2 text-sm"
            >
              <div className="min-w-0">
                {board.accessible ? (
                  <Link href={`/boards/${board.id}`} className="font-medium hover:underline">
                    {board.title}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-2 font-medium">
                    <Lock className="text-muted-foreground size-3.5" aria-label="No access" />
                    {board.title}
                  </span>
                )}
                <p className="text-muted-foreground text-xs">{cardCountLabel(board.cardCount)}</p>
              </div>
              {standaloneBoards ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Detach ${board.title}`}
                  disabled={isPending}
                  onClick={() => setProject(board.id, null, "Board detached")}
                >
                  <Unlink className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {standaloneBoards ? (
        <div className="flex gap-2">
          <Select
            value={boardToAttach}
            onValueChange={(value) => value && setBoardToAttach(value)}
            disabled={isPending || standaloneBoards.length === 0}
          >
            <SelectTrigger className="w-full" aria-label="Board to attach">
              <SelectValue
                placeholder={
                  standaloneBoards.length === 0 ? "No standalone boards" : "Attach a board…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {standaloneBoards.map((board) => (
                <SelectItem key={board.id} value={board.id}>
                  {board.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={isPending || !boardToAttach}
            onClick={() => setProject(boardToAttach, projectId, "Board attached")}
          >
            <Plus className="size-4" />
            Attach
          </Button>
        </div>
      ) : null}
    </div>
  );
}
