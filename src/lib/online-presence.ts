export const WORKSPACE_ONLINE_CHANNEL = "workspace:online";
export const WORKSPACE_POKE_EVENT = "poke";

export interface WorkspacePresencePayload {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

export interface WorkspacePokeBroadcastPayload {
  pokeId: string;
  fromUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  toUserId: string;
  createdAt: string;
}

export function isWorkspacePokePayload(payload: unknown): payload is WorkspacePokeBroadcastPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  return (
    typeof candidate.pokeId === "string" &&
    typeof candidate.fromUserId === "string" &&
    typeof candidate.fromName === "string" &&
    typeof candidate.toUserId === "string" &&
    typeof candidate.createdAt === "string" &&
    (typeof candidate.fromAvatarUrl === "string" || candidate.fromAvatarUrl === null)
  );
}
