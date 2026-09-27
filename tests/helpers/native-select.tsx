import type { ReactNode } from "react";

export function Select({
  children,
  value,
  onValueChange,
  disabled,
}: {
  children: ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
      disabled={disabled}
    >
      <option value="">—</option>
      {children}
    </select>
  );
}

export const SelectTrigger = () => null;
export const SelectValue = () => null;
export const SelectSeparator = () => null;
export const SelectContent = ({ children }: { children: ReactNode }) => <>{children}</>;
export const SelectItem = ({ value, children }: { value: string; children: ReactNode }) => (
  <option value={value}>{children}</option>
);
