"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CheckCircle2, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteProjectAction,
  setProjectFinishedAction,
  updateProjectAction,
} from "@/app/actions/hub";
import { InitiativeSelect } from "@/app/hub/_components/initiative-select";
import { QuarterRangeFields } from "@/app/hub/_components/quarter-range-fields";
import { ProjectCoverEditor } from "@/app/hub/projects/[projectId]/_components/project-cover-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { keepOpenForInlineEdit } from "@/lib/dismiss";
import type { InitiativeOption, ProjectDetail } from "@/lib/hub";

interface ProjectAdminControlsProps {
  project: ProjectDetail;
  initiatives: InitiativeOption[];
  tagOptions: string[];
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function ProjectEditorForm({
  project,
  initiatives,
  tagOptions,
  onDone,
}: ProjectAdminControlsProps & { onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? "");
  const [initiativeId, setInitiativeId] = useState(project.initiativeId);
  const [quarters, setQuarters] = useState({
    start: project.startQuarter,
    end: project.endQuarter,
  });
  const [tags, setTags] = useState(project.tags);
  const [newTag, setNewTag] = useState("");
  const [phases, setPhases] = useState(project.phases);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(project.currentPhaseIndex);
  const [links, setLinks] = useState(project.links);
  const [isPending, startTransition] = useTransition();

  const visibleTags = Array.from(new Set([...tagOptions, ...tags])).sort((left, right) =>
    left.localeCompare(right)
  );

  function toggleTag(tag: string) {
    setTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]
    );
  }

  function addTag() {
    const name = newTag.trim();
    if (!name) return;
    setTags((current) => (current.includes(name) ? current : [...current, name]));
    setNewTag("");
  }

  function movePhase(from: number, to: number) {
    setPhases((current) => moveItem(current, from, to));
    setCurrentPhaseIndex((current) => {
      if (current === from) return to;
      if (current === to) return from;
      return current;
    });
  }

  function removePhase(index: number) {
    setPhases((current) => current.filter((_, position) => position !== index));
    setCurrentPhaseIndex((current) => {
      if (current === null || current === index) return null;
      return current > index ? current - 1 : current;
    });
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateProjectAction({
        projectId: project.id,
        title,
        description: description.trim() || null,
        initiativeId,
        startQuarter: quarters.start,
        endQuarter: quarters.end,
        tags,
        phases: phases.map((phase) => phase.trim()),
        currentPhaseIndex,
        links: links.map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Project updated");
      onDone();
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
        <ProjectCoverEditor
          id={project.id}
          title={project.title}
          coverImageUrl={project.coverImageUrl}
        />

        <div className="space-y-2">
          <Label htmlFor="edit-project-title">Title</Label>
          <Input
            id="edit-project-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-project-initiative">Initiative</Label>
          <InitiativeSelect
            id="edit-project-initiative"
            initiatives={initiatives}
            value={initiativeId}
            onChange={setInitiativeId}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-project-description">Description</Label>
          <Textarea
            id="edit-project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
          />
        </div>

        <QuarterRangeFields
          start={quarters.start}
          end={quarters.end}
          onChange={setQuarters}
          disabled={isPending}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Tags</legend>
          {visibleTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {visibleTags.map((tag) => (
                <Button
                  key={tag}
                  type="button"
                  size="sm"
                  variant={tags.includes(tag) ? "default" : "outline"}
                  aria-pressed={tags.includes(tag)}
                  onClick={() => toggleTag(tag)}
                  className="rounded-full"
                >
                  {tag}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Input
              aria-label="New tag name"
              value={newTag}
              onChange={(event) => setNewTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag();
                }
              }}
              placeholder="New tag"
              maxLength={40}
            />
            <Button type="button" variant="outline" onClick={addTag} disabled={!newTag.trim()}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Phases</legend>
          <p className="text-muted-foreground text-xs">Select the phase the project is in now.</p>
          <ol className="space-y-2">
            {phases.map((phase, index) => (
              <li key={index} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="current-phase"
                  aria-label={`Mark phase ${index + 1} as current`}
                  checked={currentPhaseIndex === index}
                  onChange={() => setCurrentPhaseIndex(index)}
                  className="size-4 shrink-0"
                />
                <Input
                  aria-label={`Phase ${index + 1} name`}
                  value={phase}
                  onChange={(event) =>
                    setPhases((current) =>
                      current.map((item, position) =>
                        position === index ? event.target.value : item
                      )
                    )
                  }
                  maxLength={80}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move phase ${index + 1} up`}
                  onClick={() => movePhase(index, index - 1)}
                  disabled={index === 0}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move phase ${index + 1} down`}
                  onClick={() => movePhase(index, index + 1)}
                  disabled={index === phases.length - 1}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove phase ${index + 1}`}
                  onClick={() => removePhase(index)}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPhases((current) => [...current, ""])}
            >
              <Plus className="size-4" />
              Add phase
            </Button>
            {currentPhaseIndex !== null ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPhaseIndex(null)}
              >
                Clear current phase
              </Button>
            ) : null}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Links</legend>
          <ul className="space-y-2">
            {links.map((link, index) => (
              <li key={index} className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
                <Input
                  aria-label={`Link ${index + 1} label`}
                  value={link.label}
                  placeholder="GitHub"
                  onChange={(event) =>
                    setLinks((current) =>
                      current.map((item, position) =>
                        position === index ? { ...item, label: event.target.value } : item
                      )
                    )
                  }
                  maxLength={80}
                />
                <Input
                  aria-label={`Link ${index + 1} URL`}
                  value={link.url}
                  placeholder="https://"
                  type="url"
                  onChange={(event) =>
                    setLinks((current) =>
                      current.map((item, position) =>
                        position === index ? { ...item, url: event.target.value } : item
                      )
                    )
                  }
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove link ${index + 1}`}
                  onClick={() =>
                    setLinks((current) => current.filter((_, position) => position !== index))
                  }
                  className="self-center"
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLinks((current) => [...current, { label: "", url: "" }])}
          >
            <Plus className="size-4" />
            Add link
          </Button>
        </fieldset>
      </div>

      <SheetFooter className="border-t">
        <Button type="button" onClick={handleSave} disabled={isPending || !title.trim()}>
          {isPending ? "Saving..." : "Save changes"}
        </Button>
      </SheetFooter>
    </>
  );
}

export function ProjectAdminControls(props: ProjectAdminControlsProps) {
  const { project } = props;
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleToggleFinished() {
    startTransition(async () => {
      const result = await setProjectFinishedAction(project.id, !project.finished);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(project.finished ? "Project reopened" : "Project marked finished");
      router.refresh();
    });
  }

  function handleDelete() {
    if (
      !window.confirm(`Delete "${project.title}"? Its boards stay, but become standalone boards.`)
    ) {
      return;
    }

    startTransition(async () => {
      const result = await deleteProjectAction(project.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Project deleted");
      router.push("/hub");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetTrigger asChild>
          <Button type="button" className="gap-2">
            <Pencil className="size-4" />
            Edit project
          </Button>
        </SheetTrigger>
        <SheetContent
          className="flex w-full flex-col sm:max-w-xl"
          onEscapeKeyDown={keepOpenForInlineEdit}
        >
          <SheetHeader>
            <SheetTitle>Edit project</SheetTitle>
            <SheetDescription>Details, tags, phases and links.</SheetDescription>
          </SheetHeader>
          {editorOpen ? <ProjectEditorForm {...props} onDone={() => setEditorOpen(false)} /> : null}
        </SheetContent>
      </Sheet>
      <Button type="button" variant="outline" onClick={handleToggleFinished} disabled={isPending}>
        {project.finished ? <RotateCcw className="size-4" /> : <CheckCircle2 className="size-4" />}
        {project.finished ? "Reopen project" : "Mark finished"}
      </Button>
      <Button type="button" variant="ghost" onClick={handleDelete} disabled={isPending}>
        <Trash2 className="size-4" />
        Delete
      </Button>
    </div>
  );
}
