"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Link2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { setProjectCoverUrlAction, uploadProjectCoverAction } from "@/app/actions/hub";
import { ProjectCover } from "@/app/hub/_components/project-cover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ProjectCoverEditorProps {
  projectId: string;
  title: string;
  coverImageUrl: string | null;
}

export function ProjectCoverEditor({ projectId, title, coverImageUrl }: ProjectCoverEditorProps) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [cover, setCover] = useState(coverImageUrl);
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  function applyResult(result: { error: string } | { success: true }, next: string | null) {
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setCover(next);
    toast.success(next ? "Cover updated" : "Cover removed");
    router.refresh();
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("cover", file);

    startTransition(async () => {
      const result = await uploadProjectCoverAction(formData);
      applyResult(result, URL.createObjectURL(file));
      if (fileInput.current) fileInput.current.value = "";
    });
  }

  function handleUseUrl() {
    const next = url.trim();
    if (!next) return;

    startTransition(async () => {
      const result = await setProjectCoverUrlAction(projectId, next);
      applyResult(result, next);
      if (!("error" in result)) setUrl("");
    });
  }

  function handleRemove() {
    startTransition(async () => {
      applyResult(await setProjectCoverUrlAction(projectId, null), null);
    });
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Cover image</legend>
      <div className="flex items-center gap-4">
        <ProjectCover title={title} coverImageUrl={cover} className="size-16 text-lg" />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            aria-label="Upload cover image"
            onChange={(event) => handleFile(event.target.files?.[0])}
            disabled={isPending}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInput.current?.click()}
            disabled={isPending}
          >
            <ImageUp className="size-4" />
            Upload image
          </Button>
          {cover ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={isPending}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          aria-label="Cover image URL"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleUseUrl();
            }
          }}
          placeholder="Or paste an image URL"
          disabled={isPending}
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleUseUrl}
          disabled={isPending || url.trim().length === 0}
        >
          <Link2 className="size-4" />
          Use URL
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        JPEG, PNG, WebP or GIF up to 5 MB. Without a cover, the project shows its initials.
      </p>
    </fieldset>
  );
}
