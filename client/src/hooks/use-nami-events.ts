import { useEffect } from "react";
import { namiWs } from "@/lib/websocket";
import { queryClient } from "@/lib/queryClient";
import type { NamiEvent } from "@shared/schema";

export function useNamiEvents() {
  useEffect(() => {
    namiWs.connect();

    const unsubscribe = namiWs.subscribe((event: NamiEvent) => {
      switch (event.type) {
        case "agent_created":
        case "agent_status_changed":
          queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
          queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
          break;
        case "swarm_created":
        case "swarm_completed":
          queryClient.invalidateQueries({ queryKey: ["/api/swarms"] });
          queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
          break;
        case "workflow_step_completed":
          queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
          break;
        case "message_sent":
          queryClient.invalidateQueries({ queryKey: ["/api/events"] });
          break;
        default:
          queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      }
    });

    return () => {
      unsubscribe();
      namiWs.disconnect();
    };
  }, []);
}
