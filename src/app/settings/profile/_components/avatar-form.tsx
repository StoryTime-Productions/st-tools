"use client";

import { useRef, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateAvatarAction } from "@/app/actions/profile";

interface AvatarFormProps {
  avatarUrl: string | null;
  displayName: string | null;
}

export function AvatarForm({ avatarUrl, displayName }: AvatarFormProps) {
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateAvatarAction(data);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Avatar updated");
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "??";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Label>Avatar</Label>
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt="Avatar"
            width={64}
            height={64}
            className="rounded-full object-cover"
          />
        ) : (
          <div className="bg-muted text-muted-foreground flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold">
            {initials}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Input
            ref={inputRef}
            type="file"
            name="avatar"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="w-64"
          />
          <Button type="submit" variant="outline" size="sm" disabled={isPending}>
            {isPending ? "Uploading…" : "Upload avatar"}
          </Button>
        </div>
      </div>
    </form>
  );
}
