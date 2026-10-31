"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Kanban, Lock, Plus, Unlink, X } from "lucide-react";
import { toast } from "sonner";
import {
  approveBoardAccessAction,
  declineBoardAccessAction,
  requestBoardAccessAction,
  setBoardProjectAction,
  type HubActionResult,
} from "@/app/actions/hub";
import { EmptyNote } from "@/app/hub/_components/empty-note";
import { Badge } from "@/components/ui/badge";
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
          <h4 className="text-sm font-medium">Access requests</h4>
          <ul className="space-y-2">
            {accessRequests.map((request) => (
              <li
                key={request.id}
                className="bg-muted/40 flex flex-col items-start gap-2 rounded-2xl px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3"
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
        <EmptyNote icon={Kanban}>
          {standaloneBoards
            ? "No boards yet. Attach a standalone board below."
            : "No boards yet. An admin can attach one."}
        </EmptyNote>
      ) : (
        <ul className="space-y-2">
          {boards.map((board) => (
            <li
              key={board.id}
              className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-2 text-sm"
            >
              <div className="min-w-0 break-words">
                {board.accessible ? (
                  <Link
                    href={`/boards/${board.id}`}
                    className="focus-visible:ring-ring/50 inline-flex min-h-11 items-center rounded-md font-medium break-words outline-none hover:underline focus-visible:ring-[3px] sm:min-h-0"
                  >
                    {board.title}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-2 font-medium">
                    <Lock aria-hidden="true" className="text-muted-foreground size-3.5" />
                    <span className="sr-only">No access: </span>
                    {board.title}
                  </span>
                )}
                <p className="text-muted-foreground text-xs">
                  {cardCountLabel(board.cardCount)}
                  {board.accessible ? "" : " · Members only"}
                </p>
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
                <Badge variant="outline">Requested</Badge>
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
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={boardToAttach}
            onValueChange={(value) => value && setBoardToAttach(value)}
            disabled={isPending || standaloneBoards.length === 0}
          >
            <SelectTrigger className="w-full min-w-0 flex-1" aria-label="Board to attach">
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
            className="w-full sm:w-auto"
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
