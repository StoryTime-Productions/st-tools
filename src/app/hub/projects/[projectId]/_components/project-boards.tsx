"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Lock, Plus, Unlink, X } from "lucide-react";
import { toast } from "sonner";
import {
  approveBoardAccessAction,
  declineBoardAccessAction,
  requestBoardAccessAction,
  setBoardProjectAction,
  type HubActionResult,
} from "@/app/actions/hub";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BoardAccessRequestItem, ProjectBoard } from "@/lib/hub";

interface ProjectBoardsProps {
  projectId: string;
  boards: ProjectBoard[];
  standaloneBoards: Array<{ id: string; title: string }> | null;
  accessRequests: BoardAccessRequestItem[];
}

function cardCountLabel(count: number) {
  return count === 1 ? "1 card" : `${count} cards`;
}

export function ProjectBoards({
  projectId,
  boards,
  standaloneBoards,
  accessRequests,
}: ProjectBoardsProps) {
  const router = useRouter();
  const [boardToAttach, setBoardToAttach] = useState("");
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<HubActionResult>, message: string) {
    startTransition(async () => {
      const result = await action();
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
      {accessRequests.length > 0 ? (
        <section aria-label="Access requests" className="space-y-2">
          <h3 className="text-sm font-medium">Access requests</h3>
          <ul className="space-y-2">
            {accessRequests.map((request) => (
              <li
                key={request.id}
                className="bg-muted/40 flex items-center justify-between gap-3 rounded-2xl px-4 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium">{request.userName}</span> wants to join{" "}
                  <span className="font-medium">{request.boardTitle}</span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    aria-label={`Approve ${request.userName} for ${request.boardTitle}`}
                    onClick={() =>
                      run(() => approveBoardAccessAction(request.id), "Access approved")
                    }
                  >
                    <Check className="size-4" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    aria-label={`Decline ${request.userName} for ${request.boardTitle}`}
                    onClick={() =>
                      run(() => declineBoardAccessAction(request.id), "Request declined")
                    }
                  >
                    <X className="size-4" />
                    Decline
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
                  onClick={() => run(() => setBoardProjectAction(board.id, null), "Board detached")}
                >
                  <Unlink className="size-4" />
                </Button>
              ) : board.accessible ? null : board.requested ? (
                <span className="text-muted-foreground text-xs">Requested</span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  aria-label={`Request access to ${board.title}`}
                  onClick={() => run(() => requestBoardAccessAction(board.id), "Access requested")}
                >
                  Request access
                </Button>
              )}
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
            onClick={() =>
              run(() => setBoardProjectAction(boardToAttach, projectId), "Board attached")
            }
          >
            <Plus className="size-4" />
            Attach
          </Button>
        </div>
      ) : null}
    </div>
  );
}
