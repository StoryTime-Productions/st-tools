"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { BoardCardActivityData, BoardCardData, BoardMemberSummary } from "@/app/boards/types";
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
  columnLookup: Record<string, string>;
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
  onAddComment: (values: { cardId: string; content: string }) => Promise<boolean>;
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

const timelineFieldLabels: Record<string, string> = {
  title: "title",
  description: "description",
  dueDate: "due date",
  assigneeId: "assignee",
  labels: "labels",
  checklistItems: "checklist",
};

type TimelineFilterState = {
  columnTransitions: boolean;
  fieldUpdates: boolean;
  comments: boolean;
};

const defaultTimelineFilters: TimelineFilterState = {
  columnTransitions: true,
  fieldUpdates: true,
  comments: true,
};

function isColumnTransitionActivity(activity: BoardCardActivityData): boolean {
  return (
    activity.eventType === "MOVED" &&
    Boolean(activity.details?.fromColumnId) &&
    Boolean(activity.details?.toColumnId) &&
    activity.details?.fromColumnId !== activity.details?.toColumnId
  );
}

function isCommentActivity(activity: BoardCardActivityData): boolean {
  return activity.eventType === "COMMENTED";
}

function matchesTimelineFilters(
  activity: BoardCardActivityData,
  filters: TimelineFilterState
): boolean {
  const columnTransition = isColumnTransitionActivity(activity);
  if (columnTransition) {
    return filters.columnTransitions;
  }

  const comment = isCommentActivity(activity);
  if (comment) {
    return filters.comments;
  }

  return filters.fieldUpdates;
}

function formatActivityTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString();
}

function getActivitySummary(
  activity: BoardCardActivityData,
  columnLookup: Record<string, string>
): string {
  if (activity.eventType === "CREATED") {
    return "Card created";
  }

  if (activity.eventType === "COMMENTED") {
    return "Commented";
  }

  if (activity.eventType === "MOVED") {
    const fromColumnId = activity.details?.fromColumnId;
    const toColumnId = activity.details?.toColumnId;
    const fromPosition = activity.details?.fromPosition;
    const toPosition = activity.details?.toPosition;

    if (fromColumnId && toColumnId && fromColumnId !== toColumnId) {
      const fromLabel = columnLookup[fromColumnId] ?? "another column";
      const toLabel = columnLookup[toColumnId] ?? "another column";
      return `Moved from ${fromLabel} to ${toLabel}`;
    }

    if (
      typeof fromPosition === "number" &&
      typeof toPosition === "number" &&
      fromPosition !== toPosition
    ) {
      return `Reordered in column (${fromPosition + 1} -> ${toPosition + 1})`;
    }

    return "Card moved";
  }

  if (activity.eventType === "UPDATED") {
    const changedFields = activity.details?.changedFields ?? [];
    if (changedFields.length === 0) {
      return "Card updated";
    }

    const labels = changedFields.map((field) => timelineFieldLabels[field] ?? field).slice(0, 4);
    return `Updated ${labels.join(", ")}`;
  }

  return "Card updated";
}

function CardDetailSheetBody({
  card,
  columnLookup,
  members,
  isPending,
  onOpenChange,
  onSave,
  onAddComment,
  onDelete,
}: {
  card: BoardCardData;
  columnLookup: Record<string, string>;
  members: BoardMemberSummary[];
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: CardDetailSheetProps["onSave"];
  onAddComment: CardDetailSheetProps["onAddComment"];
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
  const [commentDraft, setCommentDraft] = useState("");
  const [timelineFilters, setTimelineFilters] =
    useState<TimelineFilterState>(defaultTimelineFilters);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);

  const filteredActivities = card.activities.filter((activity) =>
    matchesTimelineFilters(activity, timelineFilters)
  );

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

  async function handleAddComment() {
    const content = commentDraft.trim();
    if (content.length === 0) {
      return;
    }

    const success = await onAddComment({ cardId: card.id, content });
    if (success) {
      setCommentDraft("");
    }
  }

  function updateTimelineFilter(key: keyof TimelineFilterState, checked: boolean) {
    setTimelineFilters((current) => ({
      ...current,
      [key]: checked,
    }));
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
              {labelPreview.map((label, index) => (
                <Badge key={`${label}-${index}`} variant="outline">
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

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="card-comment">Add comment</Label>
            <Textarea
              id="card-comment"
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder="Write a comment for this task"
              className="min-h-24"
              maxLength={2000}
              disabled={isPending}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  void handleAddComment();
                }}
                disabled={isPending || commentDraft.trim().length === 0}
              >
                Add comment
              </Button>
            </div>
          </div>

          <div>
            <Label>Timeline</Label>
            <p className="text-muted-foreground text-xs">
              Showing {filteredActivities.length} of {card.activities.length} timeline entries
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="hover:bg-muted/40 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={timelineFilters.columnTransitions}
                onChange={(event) =>
                  updateTimelineFilter("columnTransitions", event.target.checked)
                }
                className="h-4 w-4 rounded border"
              />
              <span>Column transitions</span>
            </label>

            <label className="hover:bg-muted/40 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={timelineFilters.fieldUpdates}
                onChange={(event) => updateTimelineFilter("fieldUpdates", event.target.checked)}
                className="h-4 w-4 rounded border"
              />
              <span>Field updates</span>
            </label>

            <label className="hover:bg-muted/40 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={timelineFilters.comments}
                onChange={(event) => updateTimelineFilter("comments", event.target.checked)}
                className="h-4 w-4 rounded border"
              />
              <span>Comments</span>
            </label>
          </div>

          <div className="space-y-2">
            {filteredActivities.length === 0 ? (
              <div className="text-muted-foreground rounded-2xl border border-dashed px-4 py-3 text-sm">
                No timeline entries match the selected filters.
              </div>
            ) : (
              filteredActivities.map((activity) => (
                <div key={activity.id} className="space-y-1 rounded-2xl border px-3 py-3">
                  <p className="text-sm font-medium">
                    {getActivitySummary(activity, columnLookup)}
                  </p>
                  {activity.details?.comment ? (
                    <p className="text-sm whitespace-pre-wrap">{activity.details.comment}</p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    {activity.actor ? (activity.actor.name ?? activity.actor.email) : "System"} ·{" "}
                    {formatActivityTimestamp(activity.createdAt)}
                  </p>
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
  columnLookup,
  members,
  isPending,
  onSave,
  onAddComment,
  onDelete,
}: CardDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{card?.title ?? "Card details"}</SheetTitle>
          <SheetDescription>
            Update task details, labels, assignee, due date, checklist, and comments.
          </SheetDescription>
        </SheetHeader>

        {card ? (
          <CardDetailSheetBody
            key={card.id}
            card={card}
            columnLookup={columnLookup}
            members={members}
            isPending={isPending}
            onOpenChange={onOpenChange}
            onSave={onSave}
            onAddComment={onAddComment}
            onDelete={onDelete}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
