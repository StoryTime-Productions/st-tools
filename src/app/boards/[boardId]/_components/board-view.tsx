"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { Github, GripVertical, Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import {
  addBoardMemberAction,
  addCardCommentAction,
  setCardGithubIssueAction,
  createCardAction,
  createColumnAction,
  deleteBoardAction,
  deleteCardAction,
  deleteColumnAction,
  moveCardsAction,
  removeBoardMemberAction,
  renameColumnAction,
  reorderColumnsAction,
  updateCardAction,
} from "@/app/actions/boards";
import { CardDetailSheet } from "@/app/boards/[boardId]/_components/card-detail-sheet";
import type { BoardCardData, BoardColumnData, BoardDetailsData } from "@/app/boards/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatDueLabel } from "@/lib/hub-format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface BoardViewProps {
  board: BoardDetailsData;
  initialCardId?: string;
}

function getBoardQueryKey(boardId: string) {
  return ["board", boardId] as const;
}

async function invalidateBoardQuery(queryClient: QueryClient, boardId: string) {
  await queryClient.invalidateQueries({ queryKey: getBoardQueryKey(boardId) });
}

async function fetchBoardDetails(boardId: string): Promise<BoardDetailsData> {
  const response = await fetch(`/api/boards/${boardId}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    let message = "Unable to load board";

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Ignore JSON parse failures and surface the default error.
    }

    throw new Error(message);
  }

  return (await response.json()) as BoardDetailsData;
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

function reindexColumns(columns: BoardColumnData[]): BoardColumnData[] {
  return columns.map((column, index) => ({
    ...column,
    position: index,
    cards: column.cards.map((card, cardIndex) => ({
      ...card,
      position: cardIndex,
    })),
  }));
}

function createOptimisticId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function updateBoardColumns(
  board: BoardDetailsData,
  updater: (columns: BoardColumnData[]) => BoardColumnData[]
): BoardDetailsData {
  return {
    ...board,
    columns: reindexColumns(updater(board.columns)),
  };
}

function createOptimisticColumn(position: number): BoardColumnData {
  return {
    id: createOptimisticId("column"),
    title: "New column",
    position,
    cards: [],
  };
}

function createOptimisticCard(title: string, position: number): BoardCardData {
  return {
    id: createOptimisticId("card"),
    title,
    description: null,
    position,
    dueDate: null,
    labels: [],
    githubIssue: null,
    assigneeId: null,
    assignee: null,
    checklistItems: [],
    activities: [],
  };
}

function buildOptimisticCard(
  card: BoardCardData,
  values: {
    title: string;
    description: string | null;
    labels: string[];
    assigneeId: string | null;
    dueDate: string | null;
    checklistItems: Array<{ content: string; completed: boolean }>;
  },
  members: BoardDetailsData["allMembers"]
): BoardCardData {
  const labels = Array.from(new Set(values.labels.map((label) => label.trim()).filter(Boolean)));

  return {
    ...card,
    title: values.title.trim(),
    description: values.description?.trim() ? values.description.trim() : null,
    labels,
    assigneeId: values.assigneeId,
    assignee: values.assigneeId
      ? (members.find((member) => member.id === values.assigneeId) ?? null)
      : null,
    dueDate: values.dueDate || null,
    checklistItems: values.checklistItems
      .map((item, index) => ({
        id: card.checklistItems[index]?.id ?? createOptimisticId("checklist"),
        content: item.content.trim(),
        completed: item.completed,
        position: index,
      }))
      .filter((item) => item.content.length > 0),
    activities: card.activities,
  };
}

function findCardLocation(columns: BoardColumnData[], cardId: string) {
  for (const column of columns) {
    const cardIndex = column.cards.findIndex((card) => card.id === cardId);
    if (cardIndex >= 0) {
      return {
        columnId: column.id,
        cardIndex,
        card: column.cards[cardIndex],
      };
    }
  }

  return null;
}

function findCardById(columns: BoardColumnData[], cardId: string): BoardCardData | null {
  return findCardLocation(columns, cardId)?.card ?? null;
}

function replaceCard(columns: BoardColumnData[], updatedCard: BoardCardData): BoardColumnData[] {
  return columns.map((column) => ({
    ...column,
    cards: column.cards.map((card) => (card.id === updatedCard.id ? updatedCard : card)),
  }));
}

function removeCard(columns: BoardColumnData[], cardId: string): BoardColumnData[] {
  return reindexColumns(
    columns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => card.id !== cardId),
    }))
  );
}

function moveCardBetweenColumns(
  columns: BoardColumnData[],
  activeCardId: string,
  overId: string,
  activeColumnId: string,
  overColumnId: string,
  overKind: "card" | "column"
): BoardColumnData[] {
  const nextColumns = columns.map((column) => ({
    ...column,
    cards: [...column.cards],
  }));

  const sourceColumn = nextColumns.find((column) => column.id === activeColumnId);
  const destinationColumn = nextColumns.find((column) => column.id === overColumnId);

  if (!sourceColumn || !destinationColumn) {
    return columns;
  }

  const sourceIndex = sourceColumn.cards.findIndex((card) => card.id === activeCardId);
  if (sourceIndex < 0) {
    return columns;
  }

  const [movedCard] = sourceColumn.cards.splice(sourceIndex, 1);

  let destinationIndex = destinationColumn.cards.length;
  if (overKind === "card") {
    destinationIndex = destinationColumn.cards.findIndex((card) => card.id === overId);
    if (destinationIndex < 0) {
      destinationIndex = destinationColumn.cards.length;
    }
  }

  if (sourceColumn.id === destinationColumn.id && sourceIndex < destinationIndex) {
    destinationIndex -= 1;
  }

  destinationColumn.cards.splice(destinationIndex, 0, movedCard);

  return reindexColumns(nextColumns);
}

function CardItem({
  card,
  columnId,
  onOpen,
}: {
  card: BoardCardData;
  columnId: string;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: {
      kind: "card",
      columnId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-border/70 bg-background rounded-2xl border p-3 shadow-sm transition-shadow",
        isDragging && "opacity-70 shadow-lg"
      )}
    >
      <div className="flex items-start gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 space-y-3 text-left">
          <div className="space-y-2">
            <p className="line-clamp-2 text-sm leading-5 font-medium">{card.title}</p>
            {card.description ? (
              <p className="text-muted-foreground line-clamp-2 text-xs leading-5">
                {card.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {card.labels.slice(0, 3).map((label, index) => (
              <Badge key={`${label}-${index}`} variant="outline">
                {label}
              </Badge>
            ))}
            {card.dueDate ? (
              <Badge variant="secondary">{formatDueLabel(card.dueDate)}</Badge>
            ) : null}
            {card.githubIssue ? (
              <Badge variant="outline" className="gap-1">
                <Github className="size-3" aria-hidden="true" />
                {card.githubIssue.label}
                {card.githubIssue.state ? ` · ${card.githubIssue.state}` : ""}
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-muted-foreground text-xs">
              {card.checklistItems.length > 0
                ? `${card.checklistItems.filter((item) => item.completed).length}/${card.checklistItems.length} checklist done`
                : null}
            </div>
            {card.assignee ? (
              <Avatar className="h-7 w-7">
                <AvatarImage
                  src={card.assignee.avatarUrl ?? undefined}
                  alt={card.assignee.name ?? card.assignee.email}
                />
                <AvatarFallback>
                  {getInitials(card.assignee.name, card.assignee.email)}
                </AvatarFallback>
              </Avatar>
            ) : null}
          </div>
        </button>

        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex touch-none items-center justify-center rounded-md max-md:size-11 md:mt-0.5 md:p-1"
          aria-label="Drag card"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </div>
    </div>
  );
}

function ColumnContainer({
  column,
  isPending,
  onRename,
  onDelete,
  onCreateCard,
  onOpenCard,
}: {
  column: BoardColumnData;
  isPending: boolean;
  onRename: (columnId: string, title: string) => void;
  onDelete: (columnId: string) => void;
  onCreateCard: (columnId: string, title: string) => void;
  onOpenCard: (cardId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: {
      kind: "column",
      columnId: column.id,
    },
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(column.title);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [draftCardTitle, setDraftCardTitle] = useState("");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function commitTitle() {
    const nextTitle = draftTitle.trim();
    if (nextTitle.length === 0) {
      setDraftTitle(column.title);
      setIsEditingTitle(false);
      return;
    }

    if (nextTitle !== column.title) {
      onRename(column.id, nextTitle);
    }

    setIsEditingTitle(false);
  }

  function submitCard() {
    const nextTitle = draftCardTitle.trim();
    if (nextTitle.length === 0) {
      return;
    }

    onCreateCard(column.id, nextTitle);
    setDraftCardTitle("");
    setIsAddingCard(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-border/70 bg-background/95 flex h-full w-[320px] shrink-0 flex-col rounded-3xl border p-4 shadow-sm",
        isDragging && "opacity-80 shadow-lg"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <Input
              aria-label={`Column title for ${column.title}`}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTitle();
                }
                if (event.key === "Escape") {
                  setDraftTitle(column.title);
                  setIsEditingTitle(false);
                }
              }}
              maxLength={80}
              autoFocus
              disabled={isPending}
            />
          ) : (
            <button
              type="button"
              className="group focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-md text-left outline-none focus-visible:ring-[3px] max-md:min-h-11"
              aria-label={`Rename column ${column.title}`}
              onClick={() => setIsEditingTitle(true)}
              disabled={isPending}
            >
              <span className="truncate text-sm font-semibold group-hover:underline">
                {column.title}
              </span>
              <Pencil
                aria-hidden="true"
                className="text-muted-foreground size-3 shrink-0 opacity-60 group-hover:opacity-100"
              />
            </button>
          )}
          <p className="text-muted-foreground mt-1 text-xs">
            {column.cards.length} {column.cards.length === 1 ? "card" : "cards"}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex touch-none items-center justify-center rounded-md max-md:size-11 md:p-1"
            aria-label="Drag column"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => onDelete(column.id)}
            disabled={isPending}
            aria-label="Delete column"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
        <SortableContext
          items={column.cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.cards.length === 0 ? (
            <div className="text-muted-foreground flex min-h-24 items-center justify-center rounded-2xl border border-dashed text-sm">
              No cards yet
            </div>
          ) : (
            column.cards.map((card) => (
              <CardItem
                key={card.id}
                card={card}
                columnId={column.id}
                onOpen={() => onOpenCard(card.id)}
              />
            ))
          )}
        </SortableContext>
      </div>

      <div className="mt-4 space-y-2 border-t pt-4">
        {isAddingCard ? (
          <div className="space-y-2">
            <Input
              value={draftCardTitle}
              onChange={(event) => setDraftCardTitle(event.target.value)}
              placeholder="Card title"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitCard();
                }
                if (event.key === "Escape") {
                  setDraftCardTitle("");
                  setIsAddingCard(false);
                }
              }}
              autoFocus
              disabled={isPending}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={submitCard}
                disabled={isPending || draftCardTitle.trim().length === 0}
              >
                Add card
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraftCardTitle("");
                  setIsAddingCard(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start"
            onClick={() => setIsAddingCard(true)}
          >
            <Plus className="size-4" />
            Add card
          </Button>
        )}
      </div>
    </div>
  );
}

const dragAnnouncements = {
  onDragStart: () => "Picked up. Use the arrow keys to move, space to drop.",
  onDragOver: () => undefined,
  onDragEnd: ({ over }: { over: { id: string | number } | null }) =>
    over ? "Dropped in its new place." : "Dropped. Nothing changed.",
  onDragCancel: () => "Move cancelled.",
};

export function BoardView({ board, initialCardId }: BoardViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const boardQueryKey = getBoardQueryKey(board.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [selectedCardId, setSelectedCardId] = useState<string | null>(initialCardId ?? null);
  const [inviteMemberId, setInviteMemberId] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  const boardQuery = useQuery({
    queryKey: boardQueryKey,
    queryFn: () => fetchBoardDetails(board.id),
    initialData: board,
    staleTime: 0,
  });

  const boardState = boardQuery.data ?? board;
  const columns = boardState.columns;
  const columnLookup = Object.fromEntries(columns.map((column) => [column.id, column.title]));
  const showInviteControls = board.canManage;

  const selectedCard = selectedCardId ? findCardById(columns, selectedCardId) : null;
  const inviteableMembers = boardState.allMembers.filter(
    (member) => !boardState.activeMembers.some((activeMember) => activeMember.id === member.id)
  );

  function updateBoardCache(updater: (current: BoardDetailsData) => BoardDetailsData) {
    queryClient.setQueryData<BoardDetailsData>(boardQueryKey, (current) => {
      if (!current) {
        return current;
      }

      return updater(current);
    });
  }

  function restoreBoardCache(snapshot?: BoardDetailsData) {
    if (snapshot) {
      queryClient.setQueryData(boardQueryKey, snapshot);
      return;
    }

    void invalidateBoardQuery(queryClient, board.id);
  }

  useEffect(() => {
    queryClient.setQueryData(getBoardQueryKey(board.id), board);
  }, [board, board.id, queryClient]);

  useEffect(() => {
    const supabase = createClient();

    function invalidateIfRelevant(payload: {
      table?: string;
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) {
      const currentBoard = queryClient.getQueryData<BoardDetailsData>(getBoardQueryKey(board.id));
      if (!currentBoard) {
        return;
      }

      if (payload.table === "columns") {
        const nextBoardId =
          typeof payload.new.boardId === "string"
            ? payload.new.boardId
            : typeof payload.old.boardId === "string"
              ? payload.old.boardId
              : null;

        if (nextBoardId === board.id) {
          void invalidateBoardQuery(queryClient, board.id);
        }

        return;
      }

      if (payload.table === "card_activities") {
        const nextBoardId =
          typeof payload.new.boardId === "string"
            ? payload.new.boardId
            : typeof payload.old.boardId === "string"
              ? payload.old.boardId
              : null;

        if (nextBoardId === board.id) {
          void invalidateBoardQuery(queryClient, board.id);
        }

        return;
      }

      const currentColumnIds = new Set(currentBoard.columns.map((column) => column.id));
      const nextColumnId =
        typeof payload.new.columnId === "string"
          ? payload.new.columnId
          : typeof payload.old.columnId === "string"
            ? payload.old.columnId
            : null;

      if (nextColumnId && currentColumnIds.has(nextColumnId)) {
        void invalidateBoardQuery(queryClient, board.id);
      }
    }

    const channel = supabase
      .channel(`board:${board.id}:realtime`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "columns",
        },
        (payload) => invalidateIfRelevant(payload)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cards",
        },
        (payload) => invalidateIfRelevant(payload)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "card_activities",
        },
        (payload) => invalidateIfRelevant(payload)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [board.id, queryClient]);

  function handleAddColumn() {
    const optimisticColumn = createOptimisticColumn(columns.length);
    const previousBoard = queryClient.getQueryData<BoardDetailsData>(boardQueryKey);

    updateBoardCache((current) =>
      updateBoardColumns(current, (currentColumns) => [...currentColumns, optimisticColumn])
    );

    startTransition(async () => {
      const result = await createColumnAction(board.id);
      if ("error" in result || !result.column) {
        toast.error("error" in result ? result.error : "Unable to create column");
        restoreBoardCache(previousBoard);
        return;
      }

      updateBoardCache((current) =>
        updateBoardColumns(current, (currentColumns) =>
          currentColumns.map((column) =>
            column.id === optimisticColumn.id ? result.column! : column
          )
        )
      );
      toast.success("Column added");
      void invalidateBoardQuery(queryClient, board.id);
    });
  }

  function handleRenameColumn(columnId: string, title: string) {
    const previousBoard = queryClient.getQueryData<BoardDetailsData>(boardQueryKey);

    updateBoardCache((current) =>
      updateBoardColumns(current, (currentColumns) =>
        currentColumns.map((column) => (column.id === columnId ? { ...column, title } : column))
      )
    );

    startTransition(async () => {
      const result = await renameColumnAction(columnId, title);
      if ("error" in result) {
        toast.error(result.error);
        restoreBoardCache(previousBoard);
        return;
      }

      void invalidateBoardQuery(queryClient, board.id);
    });
  }

  async function handleDeleteColumn(columnId: string) {
    const column = columns.find((item) => item.id === columnId);
    if (!column) {
      return;
    }

    const confirmed = await confirm(
      column.cards.length > 0
        ? `This removes the column and its ${column.cards.length} ${column.cards.length === 1 ? "card" : "cards"}.`
        : "This removes the empty column.",
      { title: `Delete ${column.title}?`, confirmLabel: "Delete column", destructive: true }
    );
    if (!confirmed) {
      return;
    }

    const previousBoard = queryClient.getQueryData<BoardDetailsData>(boardQueryKey);

    updateBoardCache((current) =>
      updateBoardColumns(current, (currentColumns) =>
        currentColumns.filter((item) => item.id !== columnId)
      )
    );

    startTransition(async () => {
      const result = await deleteColumnAction(columnId);
      if ("error" in result) {
        toast.error(result.error);
        restoreBoardCache(previousBoard);
        return;
      }

      toast.success("Column deleted");
      void invalidateBoardQuery(queryClient, board.id);
    });
  }

  function handleCreateCard(columnId: string, title: string) {
    const targetColumn = columns.find((column) => column.id === columnId);
    const optimisticCard = createOptimisticCard(title.trim(), targetColumn?.cards.length ?? 0);
    const previousBoard = queryClient.getQueryData<BoardDetailsData>(boardQueryKey);

    updateBoardCache((current) =>
      updateBoardColumns(current, (currentColumns) =>
        currentColumns.map((column) =>
          column.id === columnId ? { ...column, cards: [...column.cards, optimisticCard] } : column
        )
      )
    );

    startTransition(async () => {
      const result = await createCardAction(columnId, title);
      if ("error" in result || !result.card) {
        toast.error("error" in result ? result.error : "Unable to create card");
        restoreBoardCache(previousBoard);
        return;
      }

      updateBoardCache((current) =>
        updateBoardColumns(current, (currentColumns) =>
          currentColumns.map((column) =>
            column.id === columnId
              ? {
                  ...column,
                  cards: column.cards.map((card) =>
                    card.id === optimisticCard.id ? result.card! : card
                  ),
                }
              : column
          )
        )
      );
      toast.success("Card added");
      void invalidateBoardQuery(queryClient, board.id);
    });
  }

  function handleSaveCard(values: {
    cardId: string;
    title: string;
    description: string | null;
    labels: string[];
    assigneeId: string | null;
    dueDate: string | null;
    checklistItems: Array<{ content: string; completed: boolean }>;
  }) {
    const previousBoard = queryClient.getQueryData<BoardDetailsData>(boardQueryKey);
    const previousCard = previousBoard
      ? findCardById(previousBoard.columns, values.cardId)
      : findCardById(columns, values.cardId);

    if (previousCard) {
      const optimisticCard = buildOptimisticCard(previousCard, values, boardState.allMembers);
      updateBoardCache((current) => ({
        ...current,
        columns: replaceCard(current.columns, optimisticCard),
      }));
    }

    startTransition(async () => {
      const result = await updateCardAction(values);
      if ("error" in result || !result.card) {
        toast.error("error" in result ? result.error : "Unable to save card");
        restoreBoardCache(previousBoard);
        return;
      }

      updateBoardCache((current) => ({
        ...current,
        columns: replaceCard(current.columns, result.card!),
      }));
      toast.success("Card updated");
      void invalidateBoardQuery(queryClient, board.id);
    });
  }

  function handleAddComment(values: { cardId: string; content: string }): Promise<boolean> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await addCardCommentAction(values.cardId, values.content);
        if ("error" in result || !result.card) {
          toast.error("error" in result ? result.error : "Unable to add comment");
          void invalidateBoardQuery(queryClient, board.id);
          resolve(false);
          return;
        }

        updateBoardCache((current) => ({
          ...current,
          columns: replaceCard(current.columns, result.card!),
        }));

        toast.success("Comment added");
        void invalidateBoardQuery(queryClient, board.id);
        resolve(true);
      });
    });
  }

  function handleSetGithubIssue(cardId: string, url: string | null): Promise<boolean> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await setCardGithubIssueAction(cardId, url);
        if ("error" in result || !result.card) {
          toast.error("error" in result ? result.error : "Unable to update the GitHub issue");
          resolve(false);
          return;
        }

        updateBoardCache((current) => ({
          ...current,
          columns: replaceCard(current.columns, result.card!),
        }));
        toast.success(url ? "GitHub issue linked" : "GitHub issue unlinked");
        void invalidateBoardQuery(queryClient, board.id);
        resolve(true);
      });
    });
  }

  function handleDeleteCard(cardId: string) {
    const previousBoard = queryClient.getQueryData<BoardDetailsData>(boardQueryKey);

    updateBoardCache((current) => ({
      ...current,
      columns: removeCard(current.columns, cardId),
    }));

    startTransition(async () => {
      const result = await deleteCardAction(cardId);
      if ("error" in result) {
        toast.error(result.error);
        restoreBoardCache(previousBoard);
        return;
      }

      setSelectedCardId(null);
      toast.success("Card deleted");
      void invalidateBoardQuery(queryClient, board.id);
    });
  }

  function handleInviteMember() {
    if (!inviteMemberId) {
      return;
    }

    startTransition(async () => {
      const result = await addBoardMemberAction(board.id, inviteMemberId);
      if ("error" in result) {
        toast.error(result.error);
        void invalidateBoardQuery(queryClient, board.id);
        return;
      }

      setInviteMemberId(undefined);
      toast.success("Teammate invited");
      await invalidateBoardQuery(queryClient, board.id);
    });
  }

  function handleRemoveMember(userId: string) {
    startTransition(async () => {
      const result = await removeBoardMemberAction(board.id, userId);
      if ("error" in result) {
        toast.error(result.error);
        void invalidateBoardQuery(queryClient, board.id);
        return;
      }

      toast.success("Member removed");
      await invalidateBoardQuery(queryClient, board.id);
    });
  }

  async function handleDeleteBoard() {
    const confirmed = await confirm(
      "This removes the whole board and every column and card inside it.",
      {
        title: `Delete ${board.title}?`,
        confirmLabel: "Delete board",
        destructive: true,
      }
    );
    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await deleteBoardAction(board.id);
      if ("error" in result) {
        toast.error(result.error);
        void invalidateBoardQuery(queryClient, board.id);
        return;
      }

      toast.success("Board deleted");
      queryClient.removeQueries({ queryKey: boardQueryKey });
      router.push("/boards");
      router.refresh();
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const activeData = active.data.current as
      | { kind?: "column" | "card"; columnId?: string }
      | undefined;
    const overData = over.data.current as
      | { kind?: "column" | "card"; columnId?: string }
      | undefined;

    if (!activeData?.kind || !overData?.kind) {
      return;
    }

    if (activeData.kind === "column" && overData.kind === "column") {
      const oldIndex = columns.findIndex((column) => column.id === active.id);
      const newIndex = columns.findIndex((column) => column.id === over.id);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        return;
      }

      const previousBoard = queryClient.getQueryData<BoardDetailsData>(boardQueryKey);
      const nextColumns = reindexColumns(arrayMove(columns, oldIndex, newIndex));
      updateBoardCache((current) => ({
        ...current,
        columns: nextColumns,
      }));

      startTransition(async () => {
        const result = await reorderColumnsAction(
          board.id,
          nextColumns.map((column) => column.id)
        );
        if ("error" in result) {
          toast.error(result.error);
          restoreBoardCache(previousBoard);
          return;
        }

        void invalidateBoardQuery(queryClient, board.id);
      });

      return;
    }

    if (activeData.kind === "card" && activeData.columnId && overData.columnId) {
      applyCardMove(
        String(active.id),
        String(over.id),
        activeData.columnId,
        overData.columnId,
        overData.kind
      );
    }
  }

  function applyCardMove(
    cardId: string,
    overId: string,
    fromColumnId: string,
    toColumnId: string,
    overKind: "card" | "column"
  ) {
    const previousBoard = queryClient.getQueryData<BoardDetailsData>(boardQueryKey);
    const nextColumns = moveCardBetweenColumns(
      columns,
      cardId,
      overId,
      fromColumnId,
      toColumnId,
      overKind
    );

    const before = JSON.stringify(
      columns.map((column) => ({ id: column.id, cards: column.cards.map((card) => card.id) }))
    );
    const after = JSON.stringify(
      nextColumns.map((column) => ({ id: column.id, cards: column.cards.map((card) => card.id) }))
    );
    if (before === after) {
      return;
    }

    updateBoardCache((current) => ({
      ...current,
      columns: nextColumns,
    }));

    startTransition(async () => {
      const result = await moveCardsAction(
        board.id,
        nextColumns.map((column) => ({
          columnId: column.id,
          cardIds: column.cards.map((card) => card.id),
        }))
      );
      if ("error" in result) {
        toast.error(result.error);
        restoreBoardCache(previousBoard);
        return;
      }

      void invalidateBoardQuery(queryClient, board.id);
    });
  }

  function handleMoveToColumn(cardId: string, columnId: string) {
    const fromColumn = columns.find((column) => column.cards.some((card) => card.id === cardId));
    if (!fromColumn || fromColumn.id === columnId) {
      return;
    }
    applyCardMove(cardId, columnId, fromColumn.id, columnId, "column");
  }

  const memberCount = board.activeMembers.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{board.title}</h2>

        <div className="flex flex-wrap items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="outline">
                <Users className="size-4" />
                Members ({memberCount})
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full overflow-y-auto sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Members</SheetTitle>
                <SheetDescription>
                  {showInviteControls
                    ? "People with access to this board. Invite a teammate or remove someone."
                    : "People with access to this board."}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 px-4 pb-4">
                {showInviteControls ? (
                  <div className="space-y-2 rounded-2xl border px-4 py-4">
                    <Label htmlFor="invite-member">Invite teammate</Label>
                    <Select value={inviteMemberId} onValueChange={setInviteMemberId}>
                      <SelectTrigger
                        id="invite-member"
                        className="w-full"
                        aria-label="Choose someone to add"
                      >
                        <SelectValue placeholder="Choose someone to add" />
                      </SelectTrigger>
                      <SelectContent>
                        {inviteableMembers.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            Everyone already has access
                          </SelectItem>
                        ) : (
                          inviteableMembers.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name ?? member.email}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      className="w-full"
                      onClick={handleInviteMember}
                      disabled={!inviteMemberId || isPending}
                    >
                      <UserPlus className="size-4" />
                      Invite
                    </Button>
                    {!inviteMemberId ? (
                      <p className="text-muted-foreground text-xs">
                        Pick a teammate to enable Invite.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <ul className="space-y-2">
                  {board.activeMembers.map((member) => (
                    <li
                      key={member.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
                          <AvatarFallback>{getInitials(member.name, member.email)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {member.name ?? member.email}
                          </p>
                          <p className="text-muted-foreground truncate text-xs">{member.email}</p>
                        </div>
                      </div>
                      {member.isOwner ? (
                        <Badge variant="secondary">Owner</Badge>
                      ) : board.canManage ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${member.name ?? member.email}`}
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </SheetContent>
          </Sheet>

          <Button type="button" onClick={handleAddColumn} disabled={isPending}>
            <Plus className="size-4" />
            Add column
          </Button>

          {board.canManage ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleDeleteBoard}
              disabled={isPending}
            >
              <Trash2 className="size-4" />
              Delete board
            </Button>
          ) : null}
        </div>
      </div>

      <ScrollArea className="w-full rounded-3xl">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
          accessibility={{ announcements: dragAnnouncements }}
        >
          <SortableContext
            items={columns.map((column) => column.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex min-h-120 w-max min-w-full snap-x gap-4 pb-4">
              {columns.map((column) => (
                <ColumnContainer
                  key={`${column.id}:${column.title}`}
                  column={column}
                  isPending={isPending}
                  onRename={handleRenameColumn}
                  onDelete={handleDeleteColumn}
                  onCreateCard={handleCreateCard}
                  onOpenCard={setSelectedCardId}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </ScrollArea>

      <CardDetailSheet
        open={Boolean(selectedCard)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCardId(null);
          }
        }}
        card={selectedCard}
        columnLookup={columnLookup}
        currentColumnId={
          selectedCard
            ? (columns.find((column) => column.cards.some((card) => card.id === selectedCard.id))
                ?.id ?? null)
            : null
        }
        onMoveToColumn={handleMoveToColumn}
        members={board.activeMembers}
        tagOptions={boardState.tagOptions}
        canCreateTags={boardState.canCreateTags}
        isPending={isPending}
        onSave={handleSaveCard}
        onAddComment={handleAddComment}
        onSetGithubIssue={handleSetGithubIssue}
        onDelete={handleDeleteCard}
      />
      {confirmDialog}
    </div>
  );
}
