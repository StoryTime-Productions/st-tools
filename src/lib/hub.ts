import { formatQuarterRange } from "@/lib/hub-format";
import { prisma } from "@/lib/prisma";

export interface InitiativeOption {
  id: string;
  name: string;
}

export interface ProjectSummary {
  id: string;
  title: string;
  coverImageUrl: string | null;
  initiativeName: string | null;
  quarterLabel: string | null;
  currentPhase: string | null;
  finished: boolean;
}

export interface ProjectDetail {
  id: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  initiativeId: string | null;
  initiativeName: string | null;
  startQuarter: string | null;
  endQuarter: string | null;
  phases: string[];
  currentPhaseIndex: number | null;
  links: Array<{ label: string; url: string }>;
  tags: string[];
  finished: boolean;
}

export async function getInitiativeOptions(): Promise<InitiativeOption[]> {
  return prisma.initiative.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getProjectSummaries(): Promise<ProjectSummary[]> {
  const projects = await prisma.project.findMany({
    orderBy: [{ finishedAt: { sort: "asc", nulls: "first" } }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      coverImageUrl: true,
      startQuarter: true,
      endQuarter: true,
      currentPhaseIndex: true,
      finishedAt: true,
      initiative: { select: { name: true } },
      phases: { select: { name: true }, orderBy: { position: "asc" } },
    },
  });

  return projects.map((project) => ({
    id: project.id,
    title: project.title,
    coverImageUrl: project.coverImageUrl,
    initiativeName: project.initiative?.name ?? null,
    quarterLabel: formatQuarterRange(project.startQuarter, project.endQuarter),
    currentPhase:
      project.currentPhaseIndex === null
        ? null
        : (project.phases[project.currentPhaseIndex]?.name ?? null),
    finished: project.finishedAt !== null,
  }));
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      description: true,
      coverImageUrl: true,
      initiativeId: true,
      startQuarter: true,
      endQuarter: true,
      currentPhaseIndex: true,
      finishedAt: true,
      initiative: { select: { name: true } },
      phases: { select: { name: true }, orderBy: { position: "asc" } },
      links: { select: { label: true, url: true }, orderBy: { position: "asc" } },
      tags: { select: { name: true }, orderBy: { name: "asc" } },
    },
  });

  if (!project) return null;

  return {
    id: project.id,
    title: project.title,
    description: project.description,
    coverImageUrl: project.coverImageUrl,
    initiativeId: project.initiativeId,
    initiativeName: project.initiative?.name ?? null,
    startQuarter: project.startQuarter,
    endQuarter: project.endQuarter,
    phases: project.phases.map((phase) => phase.name),
    currentPhaseIndex: project.currentPhaseIndex,
    links: project.links,
    tags: project.tags.map((tag) => tag.name),
    finished: project.finishedAt !== null,
  };
}
