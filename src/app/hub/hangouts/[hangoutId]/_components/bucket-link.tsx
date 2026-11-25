"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { toast } from "sonner";
import { linkBucketItemHangoutAction, setBucketItemDoneAction } from "@/app/actions/bucket-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { statusLabel, type BucketStatus } from "@/lib/bucket-list-core";

interface BucketLinkProps {
  hangoutId: string;
  /** The item tied to this hangout, if any. */
  item: { id: string; title: string; status: BucketStatus } | null;
  /** The last stop has finished, so a linked item is offered as "Mark as done?". */
  ended: boolean;
  /** Items that can still be linked; empty when the hangout is cancelled. */
  options: { id: string; title: string; detail: string }[];
}

/** The hangout page's side of the bucket-list link (Q4): shows its item, or lets a member pick one. */
export function BucketLink({ hangoutId, item, ended, options }: BucketLinkProps) {
  const [itemId, setItemId] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!item && options.length === 0) return null;

  function run(task: () => ReturnType<typeof linkBucketItemHangoutAction>, success: string) {
    startTransition(async () => {
      const result = await task();
      if ("error" in result) toast.error(result.error);
      else toast.success(success);
    });
  }

  return (
    <Card
      id="bucket-list"
      className="border-border/70 bg-background/85 gap-4 rounded-3xl shadow-none"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4" aria-hidden="true" />
          Bucket list
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {item ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/bucket-list"
                className="text-sm font-medium break-words underline-offset-4 hover:underline"
              >
                {item.title}
              </Link>
              <Badge variant="secondary">{statusLabel(item.status)}</Badge>
            </div>
            {ended && item.status !== "DONE" ? (
              <div className="bg-muted/50 flex w-full flex-wrap items-center gap-2 rounded-2xl px-3 py-2 text-sm">
                <span>This hangout has ended.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="max-sm:h-11"
                  disabled={isPending}
                  onClick={() =>
                    run(() => setBucketItemDoneAction(item.id, true), "Marked as done")
                  }
                >
                  Mark as done
                </Button>
              </div>
            ) : null}
            {item.status !== "DONE" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-sm:h-11"
                disabled={isPending}
                onClick={() =>
                  run(() => linkBucketItemHangoutAction(item.id, null), "Item unlinked")
                }
              >
                Unlink this item
              </Button>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="bucket-link-item">Link a bucket-list item</Label>
              <Select value={itemId} onValueChange={setItemId}>
                <SelectTrigger id="bucket-link-item" className="w-full max-sm:h-11">
                  <SelectValue placeholder="Pick an item" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.title} · {option.detail}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              className="max-sm:h-11"
              disabled={!itemId || isPending}
              onClick={() =>
                run(() => linkBucketItemHangoutAction(itemId, hangoutId), "Linked to the item")
              }
            >
              Link item
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
