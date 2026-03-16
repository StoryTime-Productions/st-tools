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
