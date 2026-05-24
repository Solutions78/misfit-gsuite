import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSlackUser } from "@/lib/tauri";
import type { SlackUser } from "@/types";

// Shared module-level cache — survives component unmounts, dedups across Sidebar + SlackView
export const slackUserCache: Map<string, SlackUser> = new Map();

export function useSlackUsers(userIds: string[], enabled: boolean) {
  const queryClient = useQueryClient();
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!enabled || userIds.length === 0) return;
    const missing = userIds.filter((id) => id && !slackUserCache.has(id));
    if (missing.length === 0) return;

    let changed = false;
    Promise.allSettled(
      missing.map((id) =>
        queryClient
          .fetchQuery({
            queryKey: ["slack-user", id],
            queryFn: () => getSlackUser(id),
            staleTime: 300_000,
          })
          .then((u) => { slackUserCache.set(id, u); changed = true; })
          .catch(() => {
            // Store a stub so we don't retry on every render
            slackUserCache.set(id, { id, name: id } as SlackUser);
            changed = true;
          })
      )
    ).then(() => { if (changed) forceUpdate((n) => n + 1); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userIds.join(","), enabled]);

  return (id: string): string => {
    const u = slackUserCache.get(id);
    if (!u) return id;
    return u.profile?.display_name || u.real_name || u.name || id;
  };
}
