"use client";

import { Pencil } from "lucide-react";
import { ProjectCover } from "@/app/hub/_components/project-cover";
import { ProjectCoverEditor } from "@/app/hub/projects/[projectId]/_components/project-cover-editor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function HangoutCover({
  id,
  title,
  coverImageUrl,
  canEdit,
}: {
  id: string;
  title: string;
  coverImageUrl: string | null;
  canEdit: boolean;
}) {
  const cover = (
    <ProjectCover title={title} coverImageUrl={coverImageUrl} className="size-16 text-lg" />
  );
  if (!canEdit) return cover;

  return (
    <Dialog>
      <DialogTrigger
        aria-label="Edit cover"
        className="focus-visible:ring-ring relative shrink-0 cursor-pointer rounded-2xl focus-visible:ring-2 focus-visible:outline-none"
      >
        {cover}
        <span
          aria-hidden="true"
          className="bg-background absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-full border shadow-sm"
        >
          <Pencil className="size-3" />
        </span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cover image</DialogTitle>
          <DialogDescription>Shown next to the title and in Discord.</DialogDescription>
        </DialogHeader>
        <ProjectCoverEditor id={id} title={title} coverImageUrl={coverImageUrl} kind="hangout" />
      </DialogContent>
    </Dialog>
  );
}
