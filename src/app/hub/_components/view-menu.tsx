"use client";

import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Option {
  value: string;
  label: string;
}

export interface ViewMenuGroup {
  label: string;
  options: ReadonlyArray<Option>;
  value: string;
  onChange: (next: string) => void;
}

/**
 * Phone version of the overview's segmented toggles: one button whose label says what is chosen,
 * opening radio groups for each setting. Choosing applies at once and keeps the menu open.
 */
export function ViewMenu({ groups }: { groups: ViewMenuGroup[] }) {
  const summary = groups
    .map((group) => group.options.find((option) => option.value === group.value)?.label)
    .filter(Boolean)
    .join(" · ");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-w-0 flex-1 justify-between md:hidden"
        >
          <span className="truncate">View: {summary}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="View options"
        className="w-[calc(100vw-2rem)] max-w-sm space-y-4"
      >
        {groups.map((group) => (
          <div key={group.label} role="radiogroup" aria-label={group.label} className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium">{group.label}</p>
            {group.options.map((option) => {
              const selected = group.value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => group.onChange(option.value)}
                  className="hover:bg-muted focus-visible:ring-ring flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
                >
                  {option.label}
                  {selected ? <Check aria-hidden="true" className="size-4" /> : null}
                </button>
              );
            })}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
