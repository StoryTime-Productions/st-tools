import type { CardActivityEvent, Role } from "@prisma/client";

export interface BoardMemberSummary {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: Role;
  isOwner?: boolean;
}

export interface BoardChecklistItemData {
  id: string;
  content: string;
  completed: boolean;
  position: number;
}

export interface BoardCardActivityData {
  id: string;
  eventType: CardActivityEvent;
  createdAt: string;
  actor: BoardMemberSummary | null;
  details: {
    changedFields?: string[];
    fromColumnId?: string;
    toColumnId?: string;
    fromPosition?: number;
    toPosition?: number;
    comment?: string;
  } | null;
}

export interface BoardCardData {
  id: string;
  title: string;
  description: string | null;
  position: number;
  dueDate: string | null;
  labels: string[];
  assigneeId: string | null;
  assignee: BoardMemberSummary | null;
  checklistItems: BoardChecklistItemData[];
  activities: BoardCardActivityData[];
}

export interface BoardColumnData {
  id: string;
  title: string;
  position: number;
  cards: BoardCardData[];
}

export interface BoardDetailsData {
  id: string;
  title: string;
  isPersonal: boolean;
  isOpenToWorkspace: boolean;
  ownerId: string;
  canManage: boolean;
  columns: BoardColumnData[];
  activeMembers: BoardMemberSummary[];
  allMembers: BoardMemberSummary[];
}
