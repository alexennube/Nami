import { useEffect } from "react";
import { namiWs } from "@/lib/websocket";
import { queryClient } from "@/lib/queryClient";
import type { NamiEvent } from "@shared/schema";

export function useNamiEvents() {
  useEffect(() => {
    namiWs.connect();

    const unsubscribeReconnect = namiWs.onReconnect(() => {
      queryClient.invalidateQueries();
    });

    const unsubscribe = namiWs.subscribe((event: NamiEvent) => {
      switch (event.type) {
        case "agent_created":
        case "agent_status_changed":
          queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
          queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/engine/status"] });
          break;
        case "swarm_created":
        case "swarm_completed":
        case "step_completed":
          queryClient.invalidateQueries({ queryKey: ["/api/swarms"] });
          queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
          break;
        case "message_sent":
          queryClient.invalidateQueries({ queryKey: ["/api/events"] });
          queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
          queryClient.invalidateQueries({ queryKey: ["/api/thoughts"] });
          break;
        case "heartbeat":
          queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
          queryClient.invalidateQueries({ queryKey: ["/api/engine/status"] });
          queryClient.invalidateQueries({ queryKey: ["/api/heartbeat"] });
          queryClient.invalidateQueries({ queryKey: ["/api/heartbeat/logs"] });
          queryClient.invalidateQueries({ queryKey: ["/api/thoughts"] });
          break;
        case "thought":
          queryClient.invalidateQueries({ queryKey: ["/api/thoughts"] });
          break;
        default:
          queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/events"] });
          queryClient.invalidateQueries({ queryKey: ["/api/engine/status"] });
      }
    });

    return () => {
      unsubscribe();
      unsubscribeReconnect();
      namiWs.disconnect();
    };
  }, []);
}
