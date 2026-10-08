"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateHomeAddressAction } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function HomeAddressForm({
  initialAddress,
  initialLocated,
}: {
  initialAddress: string | null;
  initialLocated: boolean;
}) {
  const [value, setValue] = useState(initialAddress ?? "");
  const [saved, setSaved] = useState({ address: initialAddress, located: initialLocated });
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateHomeAddressAction(value);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setSaved(result);
      setValue(result.address ?? "");
      toast.success(result.address ? "Home address saved" : "Home address cleared");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="home-address">Home address</Label>
        <Input
          id="home-address"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="123 King St W, Toronto"
          autoComplete="street-address"
        />
        <p className="text-muted-foreground text-xs">
          Visible to the team for hangout carpools. Leave empty to remove it.
        </p>
      </div>
      {saved.address ? (
        <p className="text-sm">
          Saved as: {saved.address}
          {saved.located ? null : (
            <span className="text-muted-foreground">
              {" "}
              · couldn&apos;t locate it on the map, so drive times can&apos;t be computed for it
            </span>
          )}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save address"}
      </Button>
    </form>
  );
}
