"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { sendPokeAction } from "@/app/actions/pokes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  WORKSPACE_ONLINE_CHANNEL,
  WORKSPACE_POKE_EVENT,
  type WorkspacePresencePayload,
  type WorkspacePokeBroadcastPayload,
} from "@/lib/online-presence";
import { createClient } from "@/lib/supabase/client";

interface PresenceMeta extends Partial<WorkspacePresencePayload> {
  activeAt?: string;
}

type OnlinePresenceUser = WorkspacePresencePayload & {
  sessionCount: number;
};

interface OnlinePresenceSnapshot {
  users: OnlinePresenceUser[];
  clientCount: number;
}

interface OnlineUsersCardProps {
  currentUser: WorkspacePresencePayload;
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((chunk) => chunk[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return email[0]?.toUpperCase() ?? "?";
}

function getDisplayName(user: WorkspacePresencePayload): string {
  return user.name?.trim() ? user.name : user.email;
}

function sortOnlineUsers<T extends WorkspacePresencePayload>(users: T[]): T[] {
  return [...users].sort((left, right) =>
    getDisplayName(left).localeCompare(getDisplayName(right), undefined, { sensitivity: "base" })
  );
}

function extractOnlineUsers(state: Record<string, PresenceMeta[]>): OnlinePresenceSnapshot {
  const userMap = new Map<string, OnlinePresenceUser>();
  let clientCount = 0;

  Object.values(state).forEach((entries) => {
    entries.forEach((entry) => {
      if (typeof entry.id !== "string") {
        return;
      }

      if (typeof entry.email !== "string") {
        return;
      }

      clientCount += 1;

      const existing = userMap.get(entry.id);
      if (existing) {
        existing.sessionCount += 1;

        if (!existing.name && typeof entry.name === "string") {
          existing.name = entry.name;
        }

        if (!existing.avatarUrl && typeof entry.avatarUrl === "string") {
          existing.avatarUrl = entry.avatarUrl;
        }

        return;
      }

      userMap.set(entry.id, {
        id: entry.id,
        name: typeof entry.name === "string" ? entry.name : null,
        email: entry.email,
        avatarUrl: typeof entry.avatarUrl === "string" ? entry.avatarUrl : null,
        sessionCount: 1,
      });
    });
  });

  return {
    users: sortOnlineUsers(Array.from(userMap.values())),
    clientCount,
  };
}

function isWorkspacePokePayload(payload: unknown): payload is WorkspacePokeBroadcastPayload {
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

export function OnlineUsersCard({ currentUser }: OnlineUsersCardProps) {
  const [onlineUsers, setOnlineUsers] = useState<OnlinePresenceUser[]>([]);
  const [onlineClientCount, setOnlineClientCount] = useState(0);
  const [pendingPokeUserIds, setPendingPokeUserIds] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  async function handlePoke(target: WorkspacePresencePayload) {
    if (target.id === currentUser.id) {
      return;
    }

    setPendingPokeUserIds((previous) =>
      previous.includes(target.id) ? previous : [...previous, target.id]
    );

    try {
      const result = await sendPokeAction({ targetUserId: target.id });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      const channel = channelRef.current;
      if (channel) {
        const status = await channel.send({
          type: "broadcast",
          event: WORKSPACE_POKE_EVENT,
          payload: result.payload,
        });

        if (status !== "ok") {
          toast.error("Poke was saved, but realtime delivery failed.");
        }
      }

      toast.success(`Poked ${getDisplayName(target)}.`);
    } catch {
      toast.error("Failed to send poke. Please try again.");
    } finally {
      setPendingPokeUserIds((previous) => previous.filter((id) => id !== target.id));
    }
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(WORKSPACE_ONLINE_CHANNEL, {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });
    channelRef.current = channel;

    const syncPresence = () => {
      const state = channel.presenceState<PresenceMeta>();
      const snapshot = extractOnlineUsers(state);
      setOnlineUsers(snapshot.users);
      setOnlineClientCount(snapshot.clientCount);
    };

    channel.on("presence", { event: "sync" }, syncPresence);
    channel.on("broadcast", { event: WORKSPACE_POKE_EVENT }, ({ payload }) => {
      if (!isWorkspacePokePayload(payload)) {
        return;
      }

      if (payload.toUserId !== currentUser.id) {
        return;
      }

      toast(`${payload.fromName} poked you.`);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track({
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          avatarUrl: currentUser.avatarUrl,
          activeAt: new Date().toISOString(),
        });
        syncPresence();
      }
    });

    return () => {
      void channel.untrack();
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [currentUser.avatarUrl, currentUser.email, currentUser.id, currentUser.name]);

  const fallbackUser: OnlinePresenceUser[] = [{ ...currentUser, sessionCount: 1 }];
  const users = onlineUsers.length > 0 ? onlineUsers : fallbackUser;
  const displayedClientCount = onlineClientCount > 0 ? onlineClientCount : 1;

  return (
    <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
      <CardHeader className="border-border/60 flex flex-row items-center justify-between border-b">
        <CardTitle className="text-base">Online now</CardTitle>
        <Badge variant="secondary">{displayedClientCount}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {users.map((member) => {
          const isCurrentUser = member.id === currentUser.id;
          const isPokePending = pendingPokeUserIds.includes(member.id);

          return (
            <div key={member.id} className="flex items-center gap-3 rounded-xl border px-3 py-2">
              <div className="relative h-9 w-9 shrink-0 overflow-visible">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={member.avatarUrl ?? undefined} alt={getDisplayName(member)} />
                  <AvatarFallback>{getInitials(member.name, member.email)}</AvatarFallback>
                </Avatar>
                <span className="ring-background absolute right-0 bottom-0 z-10 block size-2.5 translate-x-1/4 translate-y-1/4 rounded-full bg-emerald-500 ring-2" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {getDisplayName(member)}
                  {isCurrentUser ? " (You)" : ""}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {member.email}
                  {member.sessionCount > 1 ? ` · ${member.sessionCount} clients` : ""}
                </p>
              </div>

              {isCurrentUser ? null : (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="rounded-full"
                  disabled={isPokePending}
                  onClick={() => {
                    void handlePoke(member);
                  }}
                >
                  {isPokePending ? "Poking..." : "Poke"}
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
