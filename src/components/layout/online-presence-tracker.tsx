"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { WORKSPACE_ONLINE_CHANNEL, type WorkspacePresencePayload } from "@/lib/online-presence";

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
