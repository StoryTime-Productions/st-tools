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
  startQuarter: string | null;
  endQuarter: string | null;
  quarterLabel: string | null;
  currentPhase: string | null;
  finished: boolean;
  linkUrls: string[];
  participants: ProjectParticipant[];
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
      links: { select: { url: true }, orderBy: { position: "asc" } },
      boards: {
        select: {
          members: {
            select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
          },
        },
      },
    },
  });

  return projects.map((project) => ({
    id: project.id,
    title: project.title,
    coverImageUrl: project.coverImageUrl,
    initiativeName: project.initiative?.name ?? null,
    startQuarter: project.startQuarter,
    endQuarter: project.endQuarter,
    quarterLabel: formatQuarterRange(project.startQuarter, project.endQuarter),
    currentPhase:
      project.currentPhaseIndex === null
        ? null
        : (project.phases[project.currentPhaseIndex]?.name ?? null),
    finished: project.finishedAt !== null,
    linkUrls: project.links.map((link) => link.url),
    participants: uniqueParticipants(
      project.boards.flatMap((board) => board.members.map((member) => member.user))
    ),
  }));
}

function uniqueParticipants(
  users: Array<{ id: string; name: string | null; email: string; avatarUrl: string | null }>
): ProjectParticipant[] {
  const byId = new Map<string, ProjectParticipant>();
  for (const user of users) {
    byId.set(user.id, {
      id: user.id,
      name: user.name?.trim() || user.email,
      avatarUrl: user.avatarUrl,
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
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

export interface ProjectBoard {
  id: string;
  title: string;
  cardCount: number;
  accessible: boolean;
  requested: boolean;
}

export interface BoardAccessRequestItem {
  id: string;
  boardTitle: string;
  userName: string;
}

export interface ProjectParticipant {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface AvailableTask {
  id: string;
  title: string;
  boardId: string;
  boardTitle: string;
  dueDate: Date | null;
}

export interface ProjectWork {
  boards: ProjectBoard[];
  participants: ProjectParticipant[];
  availableTasks: AvailableTask[];
  accessRequests: BoardAccessRequestItem[];
}

export async function getProjectWork(
  projectId: string,
  viewer: { id: string; role: string }
): Promise<ProjectWork> {
  const boards = await prisma.board.findMany({
    where: { projectId },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      members: {
        select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      },
      accessRequests: {
        select: { id: true, userId: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
      columns: {
        select: {
          cards: {
            select: { id: true, title: true, dueDate: true, assigneeId: true },
            orderBy: { position: "asc" },
          },
        },
        orderBy: { position: "asc" },
      },
    },
  });

  const isAdmin = viewer.role === "ADMIN";
  const accessRequests: BoardAccessRequestItem[] = [];
  const availableTasks: AvailableTask[] = [];
  const projectBoards = boards.map((board) => {
    const accessible = isAdmin || board.members.some(({ user }) => user.id === viewer.id);
    const cards = board.columns.flatMap((column) => column.cards);

    if (accessible) {
      for (const card of cards) {
        if (card.assigneeId) continue;
        availableTasks.push({
          id: card.id,
          title: card.title,
          boardId: board.id,
          boardTitle: board.title,
          dueDate: card.dueDate,
        });
      }
    }

    if (isAdmin) {
      for (const request of board.accessRequests) {
        accessRequests.push({
          id: request.id,
          boardTitle: board.title,
          userName: request.user.name?.trim() || request.user.email,
        });
      }
    }

    return {
      id: board.id,
      title: board.title,
      cardCount: cards.length,
      accessible,
      requested: board.accessRequests.some((request) => request.userId === viewer.id),
    };
  });

  availableTasks.sort(
    (a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity)
  );

  return {
    boards: projectBoards,
    participants: uniqueParticipants(
      boards.flatMap((board) => board.members.map((member) => member.user))
    ),
    availableTasks,
    accessRequests,
  };
}

export async function getStandaloneBoardOptions(): Promise<Array<{ id: string; title: string }>> {
  return prisma.board.findMany({
    where: { projectId: null },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}
