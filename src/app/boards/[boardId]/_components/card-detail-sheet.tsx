"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { BoardCardData, BoardMemberSummary } from "@/app/boards/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

interface EditableChecklistItem {
  id: string;
  content: string;
  completed: boolean;
}

interface CardDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: BoardCardData | null;
  members: BoardMemberSummary[];
  isPending: boolean;
  onSave: (values: {
    cardId: string;
    title: string;
    description: string | null;
    labels: string[];
    assigneeId: string | null;
    dueDate: string | null;
    checklistItems: Array<{ content: string; completed: boolean }>;
  }) => void;
  onDelete: (cardId: string) => void;
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((chunk) => chunk[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return email[0]?.toUpperCase() ?? "?";
}

function createDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function CardDetailSheetBody({
  card,
  members,
  isPending,
  onOpenChange,
  onSave,
  onDelete,
}: {
  card: BoardCardData;
  members: BoardMemberSummary[];
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: CardDetailSheetProps["onSave"];
  onDelete: CardDetailSheetProps["onDelete"];
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [labels, setLabels] = useState(card.labels.join(", "));
  const [assigneeId, setAssigneeId] = useState<string | null>(card.assigneeId);
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [checklistItems, setChecklistItems] = useState<EditableChecklistItem[]>(
    card.checklistItems.map((item) => ({
      id: item.id,
      content: item.content,
      completed: item.completed,
    }))
  );
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);

  const selectedAssignee = members.find((member) => member.id === assigneeId) ?? null;
  const labelPreview = labels
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, 6);

  function handleSave() {
    const nextLabels = Array.from(
      new Set(
        labels
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean)
      )
    );

    onSave({
      cardId: card.id,
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      labels: nextLabels,
      assigneeId,
      dueDate: dueDate || null,
      checklistItems: checklistItems
        .map((item) => ({
          content: item.content.trim(),
          completed: item.completed,
        }))
        .filter((item) => item.content.length > 0),
    });
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${card.title}"?`)) {
      return;
    }

    onDelete(card.id);
  }

  return (
    <>
      <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
        <div className="space-y-2">
          <Label htmlFor="card-title">Title</Label>
          <Input
            id="card-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Card title"
            maxLength={160}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="card-description">Description</Label>
          <Textarea
            id="card-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add more detail about the task"
            className="min-h-28"
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Assignee</Label>
            <Popover open={assigneePickerOpen} onOpenChange={setAssigneePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between"
                  disabled={isPending}
                >
                  <span>
                    {selectedAssignee
                      ? (selectedAssignee.name ?? selectedAssignee.email)
                      : "Unassigned"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="start">
                <div className="space-y-1">
                  <button
                    type="button"
                    className="hover:bg-muted flex w-full items-center rounded-xl px-3 py-2 text-left text-sm"
                    onClick={() => {
                      setAssigneeId(null);
                      setAssigneePickerOpen(false);
                    }}
                  >
                    Unassigned
                  </button>
                  {members.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      className="hover:bg-muted flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm"
                      onClick={() => {
                        setAssigneeId(member.id);
                        setAssigneePickerOpen(false);
                      }}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={member.avatarUrl ?? undefined}
                          alt={member.name ?? member.email}
                        />
                        <AvatarFallback>{getInitials(member.name, member.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{member.name ?? member.email}</div>
                        <div className="text-muted-foreground truncate text-xs">{member.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="card-due-date">Due date</Label>
            <Input
              id="card-due-date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="card-labels">Labels</Label>
          <Input
            id="card-labels"
            value={labels}
            onChange={(event) => setLabels(event.target.value)}
            placeholder="design, backend, blocker"
            disabled={isPending}
          />
          {labelPreview.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {labelPreview.map((label) => (
                <Badge key={label} variant="outline">
                  {label}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>Checklist</Label>
              <p className="text-muted-foreground text-xs">
                Track the smaller steps needed to finish this card.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setChecklistItems((current) => [
                  ...current,
                  { id: createDraftId(), content: "", completed: false },
                ])
              }
              disabled={isPending}
            >
              <Plus className="size-4" />
              Add item
            </Button>
          </div>

          <div className="space-y-2">
            {checklistItems.length === 0 ? (
              <div className="text-muted-foreground rounded-2xl border border-dashed px-4 py-3 text-sm">
                No checklist items yet.
              </div>
            ) : (
              checklistItems.map((item, index) => (
                <div key={item.id} className="flex items-start gap-3 rounded-2xl border px-3 py-3">
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={(event) =>
                      setChecklistItems((current) =>
                        current.map((currentItem, currentIndex) =>
                          currentIndex === index
                            ? { ...currentItem, completed: event.target.checked }
                            : currentItem
                        )
                      )
                    }
                    className="mt-1 h-4 w-4 rounded border"
                  />
                  <Input
                    value={item.content}
                    onChange={(event) =>
                      setChecklistItems((current) =>
                        current.map((currentItem, currentIndex) =>
                          currentIndex === index
                            ? { ...currentItem, content: event.target.value }
                            : currentItem
                        )
                      )
                    }
                    placeholder="Checklist item"
                    disabled={isPending}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() =>
                      setChecklistItems((current) =>
                        current.filter((_, currentIndex) => currentIndex !== index)
                      )
                    }
                    disabled={isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <SheetFooter className="border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={handleDelete} disabled={isPending}>
          <Trash2 className="size-4" />
          Delete card
        </Button>
        <div className="flex gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending || title.trim().length === 0}
          >
            {isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}

export function CardDetailSheet({
  open,
  onOpenChange,
  card,
  members,
  isPending,
  onSave,
  onDelete,
}: CardDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{card?.title ?? "Card details"}</SheetTitle>
          <SheetDescription>
            Update task details, labels, assignee, due date, and checklist progress.
          </SheetDescription>
        </SheetHeader>

        {card ? (
          <CardDetailSheetBody
            key={card.id}
            card={card}
            members={members}
            isPending={isPending}
            onOpenChange={onOpenChange}
            onSave={onSave}
            onDelete={onDelete}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
