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
    <ProjectCover
      title={title}
      coverImageUrl={coverImageUrl}
      className="ring-border size-20 rounded-3xl text-xl shadow-sm ring-1"
    />
  );
  if (!canEdit) return cover;

  return (
    <Dialog>
      <DialogTrigger
        aria-label="Edit cover"
        className="focus-visible:ring-ring group relative shrink-0 cursor-pointer rounded-3xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {cover}
        {/* Sits inside the corner so it never clips; visible without hover for touch. */}
        <span
          aria-hidden="true"
          className="absolute right-1.5 bottom-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/25 backdrop-blur-sm transition group-hover:scale-110 group-hover:bg-black/80"
        >
          <Pencil className="size-3.5" />
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
