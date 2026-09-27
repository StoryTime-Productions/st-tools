"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatQuarter, quarterOptions } from "@/lib/hub-format";

const NONE = "none";

interface QuarterRangeFieldsProps {
  start: string | null;
  end: string | null;
  onChange: (range: { start: string | null; end: string | null }) => void;
  disabled?: boolean;
}

function QuarterSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string | null;
  options: string[];
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? NONE}
        onValueChange={(next) => onChange(next === NONE ? null : next)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not set</SelectItem>
          {options.map((quarter) => (
            <SelectItem key={quarter} value={quarter}>
              {formatQuarter(quarter)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function QuarterRangeFields({ start, end, onChange, disabled }: QuarterRangeFieldsProps) {
  const options = Array.from(
    new Set([...quarterOptions(), start, end].filter(Boolean))
  ).sort() as string[];

  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="sr-only">Quarters worked on</legend>
      <QuarterSelect
        id="project-start-quarter"
        label="From quarter"
        value={start}
        options={options}
        onChange={(next) => onChange({ start: next, end: next && end && end < next ? next : end })}
        disabled={disabled}
      />
      <QuarterSelect
        id="project-end-quarter"
        label="To quarter"
        value={end}
        options={start ? options.filter((quarter) => quarter >= start) : options}
        onChange={(next) => onChange({ start, end: next })}
        disabled={disabled || !start}
      />
    </fieldset>
  );
}
