"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addAllowedEmailAction, removeAllowedEmailAction } from "@/app/actions/allowed-emails";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AccessEntry {
  email: string;
  joined: boolean;
}

export function AccessList({ entries }: { entries: AccessEntry[] }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const input = useRef<HTMLInputElement>(null);

  function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addAllowedEmailAction(value);
      if ("error" in result) {
        setError(result.error);
        input.current?.focus();
        return;
      }
      toast.success(`${value.trim().toLowerCase()} can now sign up`);
      setValue("");
      input.current?.focus();
    });
  }

  async function handleRemove(entry: AccessEntry) {
    const ok = await confirm(`${entry.email} will no longer be able to create an account.`, {
      title: "Remove from the list",
      confirmLabel: "Remove",
      destructive: true,
      // the row that asked can be gone by the time the dialog closes
      returnFocusTo: () => input.current,
    });
    if (!ok) return;
    const result = await removeAllowedEmailAction(entry.email);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Removed from the list");
    // the dialog hands focus back to a row that is about to disappear; keep the keyboard user in the form
    input.current?.focus();
  }

  return (
    <div className="space-y-5 p-6">
      <form onSubmit={handleAdd} className="space-y-2" noValidate>
        <Label htmlFor="allowed-email">Add an email</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="allowed-email"
            ref={input}
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="name@example.com"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "allowed-email-error" : undefined}
            className="sm:max-w-sm"
          />
          <Button type="submit" disabled={isPending || value.trim() === ""} className="max-sm:h-11">
            {isPending ? "Adding..." : "Add email"}
          </Button>
        </div>
        {error ? (
          <p
            id="allowed-email-error"
            role="alert"
            className="text-destructive flex items-start gap-2 text-sm"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </form>

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No emails yet. Nobody new can create an account until you add one.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.email} className="flex items-center gap-3 rounded-xl border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-all">{entry.email}</p>
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  {entry.joined ? (
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Clock className="size-3.5" aria-hidden="true" />
                  )}
                  {entry.joined ? "Joined" : "Not joined yet"}
                </p>
              </div>
              {entry.joined ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${entry.email}`}
                  onClick={() => void handleRemove(entry)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </div>
  );
}
