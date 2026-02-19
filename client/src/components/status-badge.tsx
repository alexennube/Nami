import { Badge } from "@/components/ui/badge";
import type { AgentStatus, SwarmStatus } from "@shared/schema";

const statusConfig: Record<string, { label: string; className: string }> = {
  idle: { label: "Idle", className: "bg-muted text-muted-foreground" },
  running: { label: "Running", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  paused: { label: "Paused", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  completed: { label: "Completed", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  failed: { label: "Failed", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
  terminated: { label: "Terminated", className: "bg-muted text-muted-foreground" },
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  active: { label: "Active", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
};

interface StatusBadgeProps {
  status: AgentStatus | SwarmStatus | string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, className: "bg-muted text-muted-foreground" };

  return (
    <Badge variant="outline" className={`${config.className} border-transparent text-[11px] font-medium`} data-testid={`status-${status}`}>
      <span className="relative flex h-1.5 w-1.5 mr-1.5">
        {status === "running" || status === "active" ? (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
          </>
        ) : (
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current opacity-50" />
        )}
      </span>
      {config.label}
    </Badge>
  );
}
