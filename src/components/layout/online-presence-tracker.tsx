"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  WORKSPACE_ONLINE_CHANNEL,
  WORKSPACE_POKE_EVENT,
  isWorkspacePokePayload,
  type WorkspacePresencePayload,
} from "@/lib/online-presence";

interface OnlinePresenceTrackerProps {
  user: WorkspacePresencePayload;
}

export function OnlinePresenceTracker({ user }: OnlinePresenceTrackerProps) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(WORKSPACE_ONLINE_CHANNEL, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel.on("broadcast", { event: WORKSPACE_POKE_EVENT }, ({ payload }) => {
      if (isWorkspacePokePayload(payload) && payload.toUserId === user.id) {
        toast(`${payload.fromName} poked you.`);
      }
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          activeAt: new Date().toISOString(),
        });
      }
    });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [user.id, user.name, user.email, user.avatarUrl]);

  return null;
}
