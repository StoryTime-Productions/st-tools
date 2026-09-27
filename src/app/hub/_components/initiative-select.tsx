"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createInitiativeAction } from "@/app/actions/hub";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InitiativeOption } from "@/lib/hub";

const NEW_INITIATIVE = "__new__";

interface InitiativeSelectProps {
  id: string;
  initiatives: InitiativeOption[];
  value: string | null;
  onChange: (initiativeId: string) => void;
  disabled?: boolean;
}

export function InitiativeSelect({
  id,
  initiatives,
  value,
  onChange,
  disabled,
}: InitiativeSelectProps) {
  const [options, setOptions] = useState(initiatives);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  const trimmed = draft.trim();
  const duplicate = options.some((option) => option.name.toLowerCase() === trimmed.toLowerCase());

  function handleValueChange(next: string) {
    if (!next) return;
    if (next === NEW_INITIATIVE) {
      setCreating(true);
      return;
    }
    onChange(next);
  }

  function handleCreate() {
    if (trimmed.length === 0 || duplicate) return;

    startTransition(async () => {
      const result = await createInitiativeAction(trimmed);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      setOptions((current) =>
        [...current, result.initiative].sort((left, right) => left.name.localeCompare(right.name))
      );
      onChange(result.initiative.id);
      setDraft("");
      setCreating(false);
    });
  }

  return (
    <div className="space-y-2">
      <Select value={value ?? ""} onValueChange={handleValueChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Choose an initiative" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
          {options.length > 0 ? <SelectSeparator /> : null}
          <SelectItem value={NEW_INITIATIVE}>New initiative…</SelectItem>
        </SelectContent>
      </Select>

      {creating ? (
        <div className="flex gap-2">
          <Input
            aria-label="New initiative name"
            data-inline-edit
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleCreate();
              }
              if (event.key === "Escape") {
                setCreating(false);
              }
            }}
            placeholder="e.g. Internal Tools"
            maxLength={80}
            autoFocus
            disabled={isPending}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleCreate}
            disabled={isPending || trimmed.length === 0 || duplicate}
          >
            <Plus className="size-4" />
            Create
          </Button>
        </div>
      ) : null}
      {creating && duplicate ? (
        <p className="text-muted-foreground text-xs">That initiative already exists.</p>
      ) : null}
    </div>
  );
}
