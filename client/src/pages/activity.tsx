import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity as ActivityIcon, Bot, Network, ListChecks, AlertTriangle, MessageSquare, Zap, Settings2 } from "lucide-react";
import type { NamiEvent } from "@shared/schema";

const eventIcons: Record<string, React.ElementType> = {
  agent_created: Bot,
  agent_status_changed: Zap,
  swarm_created: Network,
  swarm_completed: Network,
  step_completed: ListChecks,
  message_sent: MessageSquare,
  error: AlertTriangle,
  system: Settings2,
};

const eventColors: Record<string, string> = {
  agent_created: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  agent_status_changed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  swarm_created: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  swarm_completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  step_completed: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  message_sent: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  error: "bg-red-500/10 text-red-600 dark:text-red-400",
  system: "bg-muted text-muted-foreground",
};

function formatEventDescription(event: NamiEvent): string {
  const p = event.payload;
  switch (event.type) {
    case "agent_created":
      return `Agent "${p.name || "unknown"}" created with role ${p.role || "spawn"}`;
    case "agent_status_changed":
      return `Agent "${p.name || p.agentId || "unknown"}" changed to ${p.newStatus || p.status || "unknown"}`;
    case "swarm_created":
      return `Swarm "${p.name || "unknown"}" created with goal: ${p.goal || "unspecified"}`;
    case "swarm_completed":
      return `Swarm "${p.name || "unknown"}" completed successfully`;
    case "step_completed":
      return `Step "${p.stepName || "unknown"}" completed in swarm`;
    case "message_sent":
      return `Message from ${p.from || "agent"}: ${(p.content || "").substring(0, 80)}${(p.content || "").length > 80 ? "..." : ""}`;
    case "error":
      return p.message || p.error || "An error occurred";
    case "system":
      return p.message || "System event";
    default:
      return JSON.stringify(p).substring(0, 100);
  }
}

export default function Activity() {
  const { data: events, isLoading } = useQuery<NamiEvent[]>({ queryKey: ["/api/events"] });

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1000px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-activity-title">Activity Log</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Real-time event stream from all agents and swarms</p>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : !events || events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ActivityIcon className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-sm font-medium mb-1">No activity yet</h3>
            <p className="text-[11px] text-muted-foreground text-center max-w-xs">
              Events from agent operations, swarm coordination, and workflow execution will appear here in real-time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />
          <div className="flex flex-col gap-1">
            {events.map((event) => {
              const Icon = eventIcons[event.type] || ActivityIcon;
              const colorClass = eventColors[event.type] || "bg-muted text-muted-foreground";
              return (
                <div key={event.id} className="flex items-start gap-3 pl-1 relative" data-testid={`event-row-${event.id}`}>
                  <div className={`flex items-center justify-center w-[22px] h-[22px] rounded-full shrink-0 z-10 ${colorClass}`}>
                    <Icon className="w-3 h-3" />
                  </div>
                  <Card className="flex-1">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-xs font-medium">{event.type.replace(/_/g, " ")}</span>
                          <span className="text-[11px] text-muted-foreground">{formatEventDescription(event)}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-[9px]">{event.source}</Badge>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
