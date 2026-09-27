"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/get-current-user";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export type HubActionResult = { error: string } | { success: true };
export type CreateInitiativeResult =
  | { error: string }
  | { success: true; initiative: { id: string; name: string } };
export type CreateProjectResult = { error: string } | { success: true; projectId: string };

const FORBIDDEN = "Forbidden: Admin access required";
const COVER_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_COVER_BYTES = 5 * 1024 * 1024;

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(80, "Name must be 80 characters or fewer");

const quarterSchema = z
  .string()
  .regex(/^\d{4}-Q[1-4]$/, "Quarter must look like 2026-Q3")
  .nullable();

const projectDetailsSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title is too long"),
  description: z.string().trim().max(5000, "Description is too long").nullable(),
  startQuarter: quarterSchema,
  endQuarter: quarterSchema,
});

const createProjectSchema = projectDetailsSchema.extend({
  initiativeId: z.string().uuid("Choose an initiative"),
});

const updateProjectSchema = projectDetailsSchema.extend({
  projectId: z.string().uuid(),
  initiativeId: z.string().uuid().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12, "Use 12 tags or fewer"),
  phases: z.array(nameSchema).max(20, "Use 20 phases or fewer"),
  currentPhaseIndex: z.number().int().min(0).nullable(),
  links: z
    .array(
      z.object({
        label: nameSchema,
        url: z
          .string()
          .trim()
          .url("Links must be full URLs")
          .refine((value) => /^https?:\/\//i.test(value), "Links must start with http(s)://"),
      })
    )
    .max(20, "Use 20 links or fewer"),
});

async function requireAdmin() {
  const currentUser = await getCurrentUser();
  return currentUser?.role === Role.ADMIN ? currentUser : null;
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

type QuarterRange =
  | { ok: false; error: string }
  | { ok: true; startQuarter: string | null; endQuarter: string | null };

function normaliseQuarters(start: string | null, end: string | null): QuarterRange {
  if (!start) {
    return { ok: true, startQuarter: null, endQuarter: null };
  }
  const endQuarter = end ?? start;
  if (endQuarter < start) {
    return { ok: false, error: "End quarter must not be before the start quarter" };
  }
  return { ok: true, startQuarter: start, endQuarter };
}

function revalidateHub(projectId?: string) {
  revalidatePath("/hub");
  if (projectId) {
    revalidatePath(`/hub/projects/${projectId}`);
  }
}

export async function createInitiativeAction(name: string): Promise<CreateInitiativeResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const initiative = await prisma.initiative.create({
      data: { name: parsed.data },
      select: { id: true, name: true },
    });
    revalidateHub();
    return { success: true, initiative };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "An initiative with that name already exists" };
    throw error;
  }
}

export async function renameInitiativeAction(
  initiativeId: string,
  name: string
): Promise<HubActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = z.object({ initiativeId: z.string().uuid(), name: nameSchema }).safeParse({
    initiativeId,
    name,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const result = await prisma.initiative.updateMany({
      where: { id: parsed.data.initiativeId },
      data: { name: parsed.data.name },
    });
    if (result.count === 0) return { error: "Initiative not found" };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "An initiative with that name already exists" };
    throw error;
  }

  revalidateHub();
  return { success: true };
}

export async function deleteInitiativeAction(initiativeId: string): Promise<HubActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = z.string().uuid().safeParse(initiativeId);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await prisma.initiative.deleteMany({ where: { id: parsed.data } });
  if (result.count === 0) return { error: "Initiative not found" };

  revalidateHub();
  return { success: true };
}

export async function createProjectAction(
  values: z.infer<typeof createProjectSchema>
): Promise<CreateProjectResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = createProjectSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const quarters = normaliseQuarters(parsed.data.startQuarter, parsed.data.endQuarter);
  if (!quarters.ok) return { error: quarters.error };

  const initiative = await prisma.initiative.findUnique({
    where: { id: parsed.data.initiativeId },
    select: { id: true },
  });
  if (!initiative) return { error: "Initiative not found" };

  const project = await prisma.project.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      initiativeId: initiative.id,
      startQuarter: quarters.startQuarter,
      endQuarter: quarters.endQuarter,
    },
    select: { id: true },
  });

  revalidateHub(project.id);
  return { success: true, projectId: project.id };
}

export async function updateProjectAction(
  values: z.infer<typeof updateProjectSchema>
): Promise<HubActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = updateProjectSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  const quarters = normaliseQuarters(data.startQuarter, data.endQuarter);
  if (!quarters.ok) return { error: quarters.error };

  if (data.currentPhaseIndex !== null && data.currentPhaseIndex >= data.phases.length) {
    return { error: "Current phase must be one of the project's phases" };
  }

  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
    select: { id: true },
  });
  if (!project) return { error: "Project not found" };

  if (data.initiativeId) {
    const initiative = await prisma.initiative.findUnique({
      where: { id: data.initiativeId },
      select: { id: true },
    });
    if (!initiative) return { error: "Initiative not found" };
  }

  const tags = Array.from(new Set(data.tags));

  await prisma.$transaction(async (tx) => {
    if (tags.length > 0) {
      await tx.tag.createMany({
        data: tags.map((name) => ({ name })),
        skipDuplicates: true,
      });
    }

    await tx.project.update({
      where: { id: project.id },
      data: {
        title: data.title,
        description: data.description || null,
        initiativeId: data.initiativeId,
        currentPhaseIndex: data.currentPhaseIndex,
        tags: { set: tags.map((name) => ({ name })) },
        startQuarter: quarters.startQuarter,
        endQuarter: quarters.endQuarter,
      },
    });

    await tx.projectPhase.deleteMany({ where: { projectId: project.id } });
    if (data.phases.length > 0) {
      await tx.projectPhase.createMany({
        data: data.phases.map((name, position) => ({ projectId: project.id, name, position })),
      });
    }

    await tx.projectLink.deleteMany({ where: { projectId: project.id } });
    if (data.links.length > 0) {
      await tx.projectLink.createMany({
        data: data.links.map((link, position) => ({
          projectId: project.id,
          label: link.label,
          url: link.url,
          position,
        })),
      });
    }
  });

  revalidateHub(project.id);
  return { success: true };
}

export async function setProjectFinishedAction(
  projectId: string,
  finished: boolean
): Promise<HubActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = z.string().uuid().safeParse(projectId);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await prisma.project.updateMany({
    where: { id: parsed.data },
    data: { finishedAt: finished ? new Date() : null },
  });
  if (result.count === 0) return { error: "Project not found" };

  revalidateHub(parsed.data);
  return { success: true };
}

export async function deleteProjectAction(projectId: string): Promise<HubActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = z.string().uuid().safeParse(projectId);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await prisma.project.deleteMany({ where: { id: parsed.data } });
  if (result.count === 0) return { error: "Project not found" };

  revalidateHub();
  revalidatePath("/boards");
  return { success: true };
}

async function saveProjectCover(projectId: string, coverImageUrl: string | null) {
  const result = await prisma.project.updateMany({
    where: { id: projectId },
    data: { coverImageUrl },
  });
  if (result.count === 0) return { error: "Project not found" };

  revalidateHub(projectId);
  return { success: true } as const;
}

export async function setProjectCoverUrlAction(
  projectId: string,
  url: string | null
): Promise<HubActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = z
    .object({
      projectId: z.string().uuid(),
      url: z
        .string()
        .trim()
        .url("Enter a full image URL")
        .refine((value) => /^https?:\/\//i.test(value), "Image URLs must start with http(s)://")
        .nullable(),
    })
    .safeParse({ projectId, url });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  return saveProjectCover(parsed.data.projectId, parsed.data.url);
}

export async function uploadProjectCoverAction(formData: FormData): Promise<HubActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: FORBIDDEN };

  const projectId = z.string().uuid().safeParse(formData.get("projectId"));
  if (!projectId.success) return { error: "Invalid project" };

  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) return { error: "No file provided" };
  if (!COVER_MIME.includes(file.type)) {
    return { error: "Only JPEG, PNG, WebP and GIF images are allowed" };
  }
  if (file.size > MAX_COVER_BYTES) return { error: "File must be smaller than 5 MB" };

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${admin.id}/project-covers/${projectId.data}.${extension}`;
  const supabase = await createClient();
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true });
  if (error) return { error: error.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  return saveProjectCover(projectId.data, `${publicUrl}?v=${Date.now()}`);
}

export async function setBoardProjectAction(
  boardId: string,
  projectId: string | null
): Promise<HubActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = z
    .object({ boardId: z.string().uuid(), projectId: z.string().uuid().nullable() })
    .safeParse({ boardId, projectId });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const board = await prisma.board.findUnique({
    where: { id: parsed.data.boardId },
    select: { projectId: true },
  });
  if (!board) return { error: "Board not found" };

  if (parsed.data.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: parsed.data.projectId },
      select: { id: true },
    });
    if (!project) return { error: "Project not found" };
  }

  await prisma.board.update({
    where: { id: parsed.data.boardId },
    data: { projectId: parsed.data.projectId },
  });

  if (parsed.data.projectId) revalidateHub(parsed.data.projectId);
  if (board.projectId) revalidateHub(board.projectId);
  revalidatePath("/boards");
  return { success: true };
}
