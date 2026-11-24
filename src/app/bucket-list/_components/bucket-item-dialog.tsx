"use client";

import { useId, useRef, useState, useTransition } from "react";
import { AlertCircle, Plus, X } from "lucide-react";
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

const NO_SEASON = "none";
const SEASON_OPTIONS: ReadonlyArray<{ value: BucketSeason; label: string }> = [
  { value: "SPRING", label: "Spring" },
  { value: "SUMMER", label: "Summer" },
  { value: "FALL", label: "Fall" },
  { value: "WINTER", label: "Winter" },
];

/** The list with one more tag typed by a member; blank and same-name-in-any-case tags are ignored. */
function withTag(tags: string[], raw: string) {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name === "" || tags.some((tag) => tag.toLowerCase() === name.toLowerCase())) return tags;
  return [...tags, name];
}

interface BucketItemDialogProps {
  /** Present when editing; absent for the "Add an item" button, which brings its own trigger. */
  item?: BucketItemView;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function BucketItemDialog({
  item,
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
  const tagInput = useRef<HTMLInputElement>(null);

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

  function removeTag(name: string) {
    setTags((current) => current.filter((tag) => tag !== name));
    // the chip that had focus is gone, so keep focus inside the form
    tagInput.current?.focus();
  }

  function addTag() {
    setTags(withTag(tags, newTag));
    setNewTag("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const hasSeason = season !== NO_SEASON;
    // a tag typed but not yet added still counts
    const finalTags = withTag(tags, newTag);

    startTransition(async () => {
      const result = await saveBucketItemAction({
        id: item?.id,
        title,
        notes,
        season: hasSeason ? season : null,
        seasonYear: hasSeason && year.trim() !== "" ? Number(year) : null,
        tags: finalTags,
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
            <div className="flex gap-2">
              <Input
                ref={tagInput}
                aria-label="New tag"
                value={newTag}
                onChange={(event) => setNewTag(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Type a tag, press Enter"
                maxLength={40}
                autoComplete="off"
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Add tag
              </Button>
            </div>
            {tags.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label="Tags on this item">
                {tags.map((name) => (
                  <li key={name}>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      aria-label={`Remove tag ${name}`}
                      onClick={() => removeTag(name)}
                      className="rounded-full"
                    >
                      {name}
                      <X aria-hidden="true" className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
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
