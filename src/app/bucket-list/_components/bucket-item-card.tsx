"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  Link2,
  Link2Off,
  MoreHorizontal,
  Pencil,
  Sun,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteBucketItemAction,
  linkBucketItemHangoutAction,
  setBucketItemDoneAction,
  setBucketItemPlannedAction,
} from "@/app/actions/bucket-list";
import type { BucketViewer } from "@/app/bucket-list/_components/bucket-list-view";
import { BucketItemDialog } from "@/app/bucket-list/_components/bucket-item-dialog";
import {
  BucketLinkDialog,
  type HangoutOption,
} from "@/app/bucket-list/_components/bucket-link-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canManageItem, seasonLabel, type BucketItemView } from "@/lib/bucket-list-core";
import { projectInitials } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

function shortDate(date: Date) {
  return new Date(date).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "America/Toronto",
  });
}

export function BucketItemCard({
  item,
  viewer,
  hangouts,
}: {
  item: BucketItemView;
  viewer: BucketViewer;
  hangouts: HangoutOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  // the menu item that opens the edit dialog or the delete confirm is gone by the time they close
  const menuButton = useRef<HTMLButtonElement>(null);
  const done = item.status === "DONE";
  const canManage = canManageItem(item, viewer);
  const season = seasonLabel(item.season, item.seasonYear);

  function toggleDone() {
    startTransition(async () => {
      const result = await setBucketItemDoneAction(item.id, !done);
      if ("error" in result) toast.error(result.error);
      else toast.success(done ? "Moved back to the list" : "Marked as done");
    });
  }

  function togglePlanned() {
    const planned = item.status !== "IN_PLAN";
    startTransition(async () => {
      const result = await setBucketItemPlannedAction(item.id, planned);
      if ("error" in result) toast.error(result.error);
      else toast.success(planned ? "Moved to In plan" : "Moved back to To do");
    });
  }

  function unlink() {
    startTransition(async () => {
      const result = await linkBucketItemHangoutAction(item.id, null);
      if ("error" in result) toast.error(result.error);
      else toast.success("Hangout unlinked");
    });
  }

  function handleLinkOpenChange(open: boolean) {
    setLinking(open);
    if (!open) requestAnimationFrame(() => menuButton.current?.focus());
  }

  function handleEditOpenChange(open: boolean) {
    setEditing(open);
    if (!open) requestAnimationFrame(() => menuButton.current?.focus());
  }

  async function handleDelete() {
    const confirmed = await confirm(`"${item.title}" will be deleted. This can't be undone.`, {
      title: "Delete this item?",
      confirmLabel: "Delete",
      destructive: true,
      returnFocusTo: () => menuButton.current,
    });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteBucketItemAction(item.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Item deleted");
    });
  }

  return (
    <article className="border-border/70 bg-background/85 flex items-start gap-1 rounded-3xl border p-3 pr-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-pressed={done}
        aria-label={`Done: ${item.title}`}
        disabled={isPending}
        onClick={toggleDone}
        className="size-11 shrink-0 rounded-2xl sm:size-9"
      >
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-md border-2",
            done ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground"
          )}
        >
          {done ? <Check aria-hidden="true" className="size-3.5" /> : null}
        </span>
      </Button>

      <div className="min-w-0 flex-1 space-y-2 py-1.5">
        <h3 className={cn("font-medium break-words", done && "text-muted-foreground line-through")}>
          {item.title}
        </h3>
        {item.notes ? (
          <p className="text-sm leading-6 break-words whitespace-pre-line">{item.notes}</p>
        ) : null}
        {item.hangoutId ? (
          <Link
            href={`/hub/hangouts/${item.hangoutId}`}
            className="hover:bg-accent focus-visible:ring-ring/50 -ml-2 flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium break-words underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] md:min-h-0 md:py-0.5"
          >
            <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
            <span className="sr-only">Hangout: </span>
            {item.hangoutTitle ?? "Hangout"}
          </Link>
        ) : null}
        {item.status === "IN_PLAN" && item.hangoutEnded ? (
          <div className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 text-sm">
            <span>That hangout has ended.</span>
            <Button type="button" size="sm" disabled={isPending} onClick={toggleDone}>
              Mark as done
            </Button>
          </div>
        ) : null}
        {season || item.tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {season ? (
              <Badge variant="outline">
                <Sun aria-hidden="true" />
                <span className="sr-only">Season: </span>
                {season}
              </Badge>
            ) : null}
            {item.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Avatar className="size-5">
            <AvatarFallback className="text-[9px]">
              {projectInitials(item.suggestedByName ?? "?")}
            </AvatarFallback>
          </Avatar>
          <span>
            {item.suggestedByName ?? "Someone"}
            {done && item.doneAt ? ` · done ${shortDate(item.doneAt)}` : ""}
          </span>
        </p>
      </div>

      {canManage || !done ? (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={menuButton}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${item.title}`}
                disabled={isPending}
                className="size-11 shrink-0 rounded-2xl sm:size-9"
              >
                <MoreHorizontal aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* planning is open to every member; only edit and delete need the suggester or an admin */}
              {!done ? (
                <DropdownMenuItem className="max-md:min-h-11" onSelect={togglePlanned}>
                  {item.status === "IN_PLAN" ? (
                    <Undo2 aria-hidden="true" />
                  ) : (
                    <CalendarPlus aria-hidden="true" />
                  )}
                  {item.status === "IN_PLAN" ? "Back to To do" : "Move to In plan"}
                </DropdownMenuItem>
              ) : null}
              {!done && !item.hangoutId ? (
                <DropdownMenuItem className="max-md:min-h-11" onSelect={() => setLinking(true)}>
                  <Link2 aria-hidden="true" />
                  Link a hangout
                </DropdownMenuItem>
              ) : null}
              {!done && item.hangoutId ? (
                <DropdownMenuItem className="max-md:min-h-11" onSelect={unlink}>
                  <Link2Off aria-hidden="true" />
                  Unlink hangout
                </DropdownMenuItem>
              ) : null}
              {canManage ? (
                <>
                  <DropdownMenuItem className="max-md:min-h-11" onSelect={() => setEditing(true)}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    className="max-md:min-h-11"
                    onSelect={handleDelete}
                  >
                    <Trash2 aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* mounted only while open, so every open starts from the saved item */}
          {editing ? (
            <BucketItemDialog item={item} open onOpenChange={handleEditOpenChange} />
          ) : null}
          {linking ? (
            <BucketLinkDialog
              itemId={item.id}
              itemTitle={item.title}
              hangouts={hangouts}
              onOpenChange={handleLinkOpenChange}
            />
          ) : null}
        </>
      ) : null}
      {confirmDialog}
    </article>
  );
}
