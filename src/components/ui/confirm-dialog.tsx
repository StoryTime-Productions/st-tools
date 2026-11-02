"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive, for deletes. */
  destructive?: boolean;
  /** Where focus goes on close when the element that asked is gone (e.g. a menu item). */
  returnFocusTo?: () => HTMLElement | null;
}

interface Pending extends ConfirmOptions {
  message: string;
  resolve: (confirmed: boolean) => void;
}

/**
 * A themed replacement for `window.confirm`: `await confirm("Delete it?")` resolves to whether the
 * user confirmed. Render the returned `dialog` once next to the buttons that ask.
 */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  // the dialog has no trigger, so remember who asked and give focus back when it closes
  const asker = useRef<HTMLElement | null>(null);
  const returnFocusTo = useRef<ConfirmOptions["returnFocusTo"]>(undefined);

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    asker.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    returnFocusTo.current = options.returnFocusTo;
    return new Promise<boolean>((resolve) => setPending({ message, resolve, ...options }));
  }, []);

  function settle(confirmed: boolean) {
    pending?.resolve(confirmed);
    setPending(null);
  }

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(open) => (open ? undefined : settle(false))}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-sm"
        onCloseAutoFocus={(event) => {
          const target = asker.current?.isConnected ? asker.current : returnFocusTo.current?.();
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{pending?.title ?? "Are you sure?"}</DialogTitle>
          <DialogDescription>{pending?.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="max-sm:flex-col-reverse">
          <Button variant="outline" className="max-sm:h-11" onClick={() => settle(false)}>
            {pending?.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={pending?.destructive ? "destructive" : "default"}
            className="max-sm:h-11"
            onClick={() => settle(true)}
          >
            {pending?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return [confirm, dialog] as const;
}
