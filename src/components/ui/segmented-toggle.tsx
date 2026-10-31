"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A one-of-many button group: 44px on phones, with a check mark so the choice is not colour alone. */
export function SegmentedToggle<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="bg-muted inline-flex rounded-xl p-1">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={selected ? "default" : "ghost"}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
          >
            {selected ? <Check aria-hidden="true" className="size-3.5" /> : null}
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
