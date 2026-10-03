"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AttendanceStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import {
  addCostAction,
  deleteCostAction,
  updateCostAction,
  type CostActionResult,
} from "@/app/actions/costs";
import {
  confirmPaymentAction,
  markRefundedAction,
  markSentAction,
  revertConfirmationAction,
  undoSentAction,
  type PaymentActionResult,
} from "@/app/actions/payments";
import { Badge } from "@/components/ui/badge";
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
import { estimateCents, shareBalance } from "@/lib/costs";
import type { HangoutCostItem } from "@/lib/hangouts";

type Result = CostActionResult | PaymentActionResult;

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  SENT: "Sent",
  CONFIRMED: "Confirmed",
  REFUNDED: "Refunded",
};
const METHOD_LABEL: Record<PaymentMethod, string> = { E_TRANSFER: "e-Transfer", CASH: "cash" };

export interface CostViewer {
  id: string;
  isAdmin: boolean;
  status: AttendanceStatus | null;
}

function useRun() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<Result>, done: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      after?.();
      router.refresh();
    });
  }
  return [isPending, run] as const;
}

export function Costs({
  hangoutId,
  items,
  viewer,
  members,
  scheduled,
  headcount,
  canEdit,
}: {
  hangoutId: string;
  items: HangoutCostItem[];
  viewer: CostViewer;
  members: { id: string; name: string }[];
  scheduled: boolean;
  /** People an item is split across: Going once scheduled, else those who answered. */
  headcount: number;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4 text-sm">
      {items.length === 0 ? <p className="text-muted-foreground">No costs yet.</p> : null}
      {!scheduled && items.length > 0 ? (
        <p className="text-muted-foreground">
          {headcount > 0
            ? `Estimates split ${headcount} ${headcount === 1 ? "person" : "people"} who filled in availability. Shares start once the hangout is scheduled.`
            : "Estimates appear once someone has filled in availability."}
        </p>
      ) : null}
      <ul className="space-y-3">
        {items.map((item) => (
          <CostRow
            key={item.id}
            item={item}
            viewer={viewer}
            members={members}
            scheduled={scheduled}
            headcount={headcount}
            canEdit={canEdit}
          />
        ))}
      </ul>
      {canEdit ? <CostDialog hangoutId={hangoutId} members={members} /> : null}
    </div>
  );
}

function CostRow({
  item,
  viewer,
  members,
  scheduled,
  headcount,
  canEdit,
}: {
  item: HangoutCostItem;
  viewer: CostViewer;
  members: { id: string; name: string }[];
  scheduled: boolean;
  headcount: number;
  canEdit: boolean;
}) {
  const [isPending, run] = useRun();
  const estimate = estimateCents(item.amountCents, headcount);
  const isCollector = viewer.id === item.collector.userId;

  return (
    <li className="space-y-2 rounded-2xl border px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium">
            {item.title} · {usd(item.amountCents)}
          </p>
          <p className="text-muted-foreground text-xs">
            Collected by {item.collector.name}
            {estimate !== null && !scheduled ? ` · about ${usd(estimate)} each` : ""}
          </p>
        </div>
        {canEdit ? (
          <div className="flex gap-1">
            <CostDialog hangoutId="" item={item} members={members} />
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Delete ${item.title}`}
              disabled={isPending}
              onClick={() => {
                if (window.confirm(`Delete "${item.title}" and its shares?`))
                  run(() => deleteCostAction(item.id), "Cost deleted");
              }}
            >
              <Trash2 />
            </Button>
          </div>
        ) : null}
      </div>
      {item.notes ? <p className="whitespace-pre-line">{item.notes}</p> : null}
      {viewer.status === "MAYBE" && estimate !== null ? (
        <p className="text-muted-foreground">Would owe about {usd(estimate)} if Going.</p>
      ) : null}
      {scheduled && item.shares.length > 0 ? (
        <ul className="divide-y">
          {item.shares.map((share) => {
            const balance = shareBalance(share);
            const mine = share.userId === viewer.id;
            return (
              <li
                key={share.userId}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="space-y-0.5">
                  <p>
                    {share.name}
                    {mine ? " (you)" : ""} · {usd(share.amountCents)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    <Badge variant="outline" className="mr-2">
                      {STATUS_LABEL[share.status]}
                    </Badge>
                    {share.status === "SENT" && share.method
                      ? `via ${METHOD_LABEL[share.method]}`
                      : ""}
                    {balance.kind === "owes" && share.paidCents > 0
                      ? ` owes ${usd(balance.cents)} more`
                      : ""}
                    {balance.kind === "owed" ? ` refund due ${usd(balance.cents)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {mine && share.status === "UNPAID" && share.amountCents > share.paidCents
                    ? (["E_TRANSFER", "CASH"] as const).map((method) => (
                        <Button
                          key={method}
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => run(() => markSentAction(item.id, method), "Marked sent")}
                        >
                          Sent by {METHOD_LABEL[method]}
                        </Button>
                      ))
                    : null}
                  {mine && share.status === "SENT" && share.amountCents > 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => run(() => undoSentAction(item.id), "Sent undone")}
                    >
                      Undo sent
                    </Button>
                  ) : null}
                  {isCollector && share.status === "SENT" ? (
                    <Button
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        run(() => confirmPaymentAction(item.id, share.userId), "Payment confirmed")
                      }
                    >
                      Confirm
                    </Button>
                  ) : null}
                  {isCollector && share.status === "CONFIRMED" && !mine ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() =>
                        run(() => revertConfirmationAction(item.id, share.userId), "Back to sent")
                      }
                    >
                      Revert
                    </Button>
                  ) : null}
                  {isCollector && share.paidCents > share.amountCents ? (
                    <Button
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        run(() => markRefundedAction(item.id, share.userId), "Marked refunded")
                      }
                    >
                      Mark refunded
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function CostDialog({
  hangoutId,
  item,
  members,
}: {
  hangoutId: string;
  item?: HangoutCostItem;
  members: { id: string; name: string }[];
}) {
  const initial = () => ({
    title: item?.title ?? "",
    amount: item ? (item.amountCents / 100).toFixed(2) : "",
    collectorId: item?.collector.userId ?? "",
    notes: item?.notes ?? "",
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [isPending, run] = useRun();
  const set =
    (key: keyof ReturnType<typeof initial>) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: event.target.value });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = {
      title: form.title,
      amountCents: Math.round(Number(form.amount) * 100),
      collectorId: form.collectorId,
      notes: form.notes,
    };
    run(
      () => (item ? updateCostAction(item.id, values) : addCostAction(hangoutId, values)),
      item ? "Cost updated" : "Cost added",
      () => {
        setOpen(false);
        if (!item) setForm(initial());
      }
    );
  }

  const id = (field: string) => `cost-${item?.id ?? "new"}-${field}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(initial());
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {item ? (
          <Button size="icon" variant="ghost" aria-label={`Edit ${item.title}`}>
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline" className="gap-2">
            <Plus className="size-4" />
            Add cost
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Edit cost" : "Add a cost"}</DialogTitle>
          <DialogDescription>
            The amount is the group total, split evenly across everyone Going.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-2">
              <Label htmlFor={id("title")}>Item</Label>
              <Input id={id("title")} value={form.title} onChange={set("title")} maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={id("amount")}>Total ($)</Label>
              <Input
                id={id("amount")}
                type="number"
                min={0}
                step={0.01}
                value={form.amount}
                onChange={set("amount")}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Collector</Label>
            <Select
              value={form.collectorId}
              onValueChange={(collectorId) => setForm({ ...form, collectorId })}
            >
              <SelectTrigger aria-label="Collector" className="w-full">
                <SelectValue placeholder="Who collects?" />
              </SelectTrigger>
              <SelectContent>
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("notes")}>Notes (optional)</Label>
            <Textarea id={id("notes")} value={form.notes} onChange={set("notes")} rows={3} />
          </div>
          <DialogFooter showCloseButton>
            <Button
              type="submit"
              disabled={
                isPending ||
                form.title.trim().length === 0 ||
                !form.collectorId ||
                !(Number(form.amount) > 0)
              }
            >
              {isPending ? "Saving..." : item ? "Save cost" : "Add cost"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
