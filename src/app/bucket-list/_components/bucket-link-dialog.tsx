"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { linkBucketItemHangoutAction } from "@/app/actions/bucket-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface HangoutOption {
  id: string;
  title: string;
}

interface BucketLinkDialogProps {
  itemId: string;
  itemTitle: string;
  hangouts: HangoutOption[];
  onOpenChange: (open: boolean) => void;
}

/** Pick a hangout for a bucket-list item; mounted only while open, so each open starts empty. */
export function BucketLinkDialog({
  itemId,
  itemTitle,
  hangouts,
  onOpenChange,
}: BucketLinkDialogProps) {
  const [hangoutId, setHangoutId] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleLink() {
    startTransition(async () => {
      const result = await linkBucketItemHangoutAction(itemId, hangoutId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Linked to the hangout");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link a hangout</DialogTitle>
          <DialogDescription>
            Pick the hangout that makes &ldquo;{itemTitle}&rdquo; happen. It moves to In plan.
          </DialogDescription>
        </DialogHeader>
        {hangouts.length === 0 ? (
          <p className="text-muted-foreground text-sm leading-6">
            Every open hangout already has an item. Create a hangout in the hub first.
          </p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={`link-hangout-${itemId}`}>Hangout</Label>
            <Select value={hangoutId} onValueChange={setHangoutId}>
              <SelectTrigger id={`link-hangout-${itemId}`} className="w-full">
                <SelectValue placeholder="Choose a hangout" />
              </SelectTrigger>
              <SelectContent>
                {hangouts.map((hangout) => (
                  <SelectItem key={hangout.id} value={hangout.id}>
                    {hangout.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!hangoutId || isPending} onClick={handleLink}>
            Link hangout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
