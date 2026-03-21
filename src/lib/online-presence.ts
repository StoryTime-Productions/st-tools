export const WORKSPACE_ONLINE_CHANNEL = "workspace:online";
export const WORKSPACE_POKE_EVENT = "poke";
export const WORKSPACE_EMOTE_EVENT = "emote";

export type EmoteId = "locked-in" | "burnt-out" | "crashing-out" | "doom-scrolling";

export const EMOTE_CONFIG: Record<EmoteId, { label: string; emoji: string }> = {
  "locked-in": { label: "Locked In", emoji: "🔒" },
  "burnt-out": { label: "Burnt out", emoji: "🔥" },
  "crashing-out": { label: "Crashing out", emoji: "💀" },
  "doom-scrolling": { label: "Doom scrolling", emoji: "📱" },
};

export interface WorkspaceEmoteBroadcastPayload {
  emoteId: EmoteId;
  fromUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  createdAt: string;
}

export function isWorkspaceEmotePayload(
  payload: unknown
): payload is WorkspaceEmoteBroadcastPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as WorkspaceEmoteBroadcastPayload).emoteId === "string" &&
    (payload as WorkspaceEmoteBroadcastPayload).emoteId in EMOTE_CONFIG &&
    typeof (payload as WorkspaceEmoteBroadcastPayload).fromUserId === "string" &&
    typeof (payload as WorkspaceEmoteBroadcastPayload).fromName === "string" &&
    typeof (payload as WorkspaceEmoteBroadcastPayload).createdAt === "string"
  );
}

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
