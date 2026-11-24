"use client";

import { useId, useState, useTransition } from "react";
import { AlertCircle, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { saveBucketItemAction } from "@/app/actions/bucket-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_BUCKET_NOTES,
  MAX_BUCKET_TITLE,
  MAX_SEASON_YEAR,
  MIN_SEASON_YEAR,
  type BucketItemView,
  type BucketSeason,
} from "@/lib/bucket-list-core";
import { cn } from "@/lib/utils";

const NO_SEASON = "none";
const SEASON_OPTIONS: ReadonlyArray<{ value: BucketSeason; label: string }> = [
  { value: "SPRING", label: "Spring" },
  { value: "SUMMER", label: "Summer" },
  { value: "FALL", label: "Fall" },
  { value: "WINTER", label: "Winter" },
];

interface BucketItemDialogProps {
  /** Present when editing; absent for the "Add an item" button, which brings its own trigger. */
  item?: BucketItemView;
  tagNames: string[];
  isAdmin: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function BucketItemDialog({
  item,
  tagNames,
  isAdmin,
  open: controlledOpen,
  onOpenChange,
}: BucketItemDialogProps) {
  const ids = useId();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const [title, setTitle] = useState(item?.title ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [season, setSeason] = useState<string>(item?.season ?? NO_SEASON);
  const [year, setYear] = useState(item?.seasonYear ? String(item.seasonYear) : "");
  const [tags, setTags] = useState<string[]>(item?.tags ?? []);
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // tags already on the item stay selectable even if the shared list changed under it
  const choices = Array.from(new Set([...tagNames, ...tags])).sort((a, b) => a.localeCompare(b));

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (next) {
      setTitle(item?.title ?? "");
      setNotes(item?.notes ?? "");
      setSeason(item?.season ?? NO_SEASON);
      setYear(item?.seasonYear ? String(item.seasonYear) : "");
      setTags(item?.tags ?? []);
      setNewTag("");
      setError(null);
    }
    setInnerOpen(next);
    onOpenChange?.(next);
  }

  function toggleTag(name: string) {
    setTags((current) =>
      current.includes(name) ? current.filter((tag) => tag !== name) : [...current, name]
    );
  }

  function addNewTag() {
    const name = newTag.trim();
    if (name === "") return;
    setTags((current) => (current.includes(name) ? current : [...current, name]));
    setNewTag("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const hasSeason = season !== NO_SEASON;

    startTransition(async () => {
      const result = await saveBucketItemAction({
        id: item?.id,
        title,
        notes,
        season: hasSeason ? season : null,
        seasonYear: hasSeason && year.trim() !== "" ? Number(year) : null,
        tags,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(item ? "Item updated" : "Item added");
      setInnerOpen(false);
      onOpenChange?.(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {item ? null : (
        <DialogTrigger asChild>
          <Button type="button" className="gap-2">
            <Plus aria-hidden="true" className="size-4" />
            Add an item
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? "Edit item" : "Add to the bucket list"}</DialogTitle>
          <DialogDescription>
            {item
              ? "Only you and admins can change this item."
              : "Anyone in the group can add one. Link a hangout later to move it to In plan."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor={`${ids}-title`}>Title</Label>
            <Input
              id={`${ids}-title`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Overnight camping at Mont-Tremblant"
              maxLength={MAX_BUCKET_TITLE}
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${ids}-notes`}>Notes (optional)</Label>
            <Textarea
              id={`${ids}-notes`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={MAX_BUCKET_NOTES}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={`${ids}-season`}>Season (optional)</Label>
              <Select
                value={season}
                onValueChange={(next) => {
                  setSeason(next);
                  if (next === NO_SEASON) setYear("");
                }}
              >
                <SelectTrigger id={`${ids}-season`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SEASON}>No season</SelectItem>
                  {SEASON_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${ids}-year`}>Year (optional)</Label>
              <Input
                id={`${ids}-year`}
                type="number"
                inputMode="numeric"
                min={MIN_SEASON_YEAR}
                max={MAX_SEASON_YEAR}
                value={year}
                onChange={(event) => setYear(event.target.value)}
                disabled={season === NO_SEASON}
                placeholder={season === NO_SEASON ? "Pick a season" : "2027"}
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm leading-none font-medium">Tags (optional)</legend>
            {choices.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {isAdmin ? "No tags yet. Add one below." : "No shared tags exist yet."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {choices.map((name) => {
                  const selected = tags.includes(name);
                  return (
                    <Button
                      key={name}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      aria-pressed={selected}
                      onClick={() => toggleTag(name)}
                      className={cn("rounded-full", selected && "pl-2")}
                    >
                      {selected ? <Check aria-hidden="true" className="size-3.5" /> : null}
                      {name}
                    </Button>
                  );
                })}
              </div>
            )}
            {isAdmin ? (
              <div className="flex gap-2 pt-1">
                <Input
                  aria-label="New tag"
                  value={newTag}
                  onChange={(event) => setNewTag(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addNewTag();
                    }
                  }}
                  placeholder="New tag"
                  maxLength={40}
                />
                <Button type="button" variant="outline" onClick={addNewTag}>
                  Add tag
                </Button>
              </div>
            ) : null}
          </fieldset>

          {error ? (
            <p role="alert" className="text-destructive flex items-start gap-2 text-sm">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <DialogFooter showCloseButton>
            <Button type="submit" disabled={isPending || title.trim().length === 0}>
              {isPending ? "Saving..." : item ? "Save changes" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
