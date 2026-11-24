"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarDays, Check, MoreHorizontal, Pencil, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBucketItemAction, setBucketItemDoneAction } from "@/app/actions/bucket-list";
import type { BucketViewer } from "@/app/bucket-list/_components/bucket-list-view";
import { BucketItemDialog } from "@/app/bucket-list/_components/bucket-item-dialog";
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
  tagNames,
}: {
  item: BucketItemView;
  viewer: BucketViewer;
  tagNames: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
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

      {canManage ? (
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
            </DropdownMenuContent>
          </DropdownMenu>
          {/* mounted only while editing, so every open starts from the saved item */}
          {editing ? (
            <BucketItemDialog
              item={item}
              tagNames={tagNames}
              isAdmin={viewer.role === "ADMIN"}
              open
              onOpenChange={handleEditOpenChange}
            />
          ) : null}
        </>
      ) : null}
      {confirmDialog}
    </article>
  );
}
