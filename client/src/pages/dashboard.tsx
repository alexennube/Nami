import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { Bot, Network, Zap, Activity, TrendingUp, MessageSquare } from "lucide-react";
import type { SystemStats, Agent, Swarm, NamiEvent } from "@shared/schema";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

function StatCard({ title, value, subtitle, icon: Icon, trend }: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  trend?: string;
}) {
  return (
    <Card data-testid={`stat-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
            <span className="text-2xl font-semibold tracking-tight">{value}</span>
            <span className="text-[11px] text-muted-foreground">{subtitle}</span>
          </div>
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        </div>
        {trend && (
          <div className="flex items-center gap-1 mt-2 text-[11px] text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-3 h-3" />
            <span>{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityFeed({ events }: { events: NamiEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Activity className="w-8 h-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No activity yet</p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">Events will appear here as agents work</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {events.slice(0, 10).map((event) => (
        <div key={event.id} className="flex items-start gap-3 p-2 rounded-md" data-testid={`event-${event.id}`}>
          <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-xs truncate">{event.type.replace(/_/g, " ")}</span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(event.timestamp).toLocaleTimeString()} — {event.source}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<SystemStats>({ queryKey: ["/api/stats"] });
  const { data: agents, isLoading: agentsLoading } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const { data: swarms } = useQuery<Swarm[]>({ queryKey: ["/api/swarms"] });
  const { data: events, isLoading: eventsLoading } = useQuery<NamiEvent[]>({ queryKey: ["/api/events"] });

  const chartData = [
    { time: "1m", tokens: 0 },
    { time: "2m", tokens: 120 },
    { time: "3m", tokens: 340 },
    { time: "4m", tokens: 200 },
    { time: "5m", tokens: 580 },
    { time: "now", tokens: stats?.totalTokensUsed || 0 },
  ];

  if (statsLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Nami orchestration overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Agents"
          value={stats?.activeAgents || 0}
          subtitle={`${stats?.totalAgents || 0} total agents`}
          icon={Bot}
        />
        <StatCard
          title="Active Swarms"
          value={stats?.activeSwarms || 0}
          subtitle={`${stats?.totalSwarms || 0} total swarms`}
          icon={Network}
        />
        <StatCard
          title="Tokens Used"
          value={stats?.totalTokensUsed?.toLocaleString() || "0"}
          subtitle={`${stats?.totalMessagesProcessed || 0} messages`}
          icon={Zap}
        />
        <StatCard
          title="Messages"
          value={stats?.totalMessagesProcessed || 0}
          subtitle="Total processed"
          icon={MessageSquare}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Token Usage</CardTitle>
            <Badge variant="outline" className="text-[10px]">Last 5 min</Badge>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                      fontSize: "11px",
                    }}
                  />
                  <Area type="monotone" dataKey="tokens" stroke="hsl(var(--primary))" fill="url(#tokenGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="flex flex-col gap-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <ActivityFeed events={events || []} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
            <Bot className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {agentsLoading ? (
              <div className="flex flex-col gap-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !agents || agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Bot className="w-8 h-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No agents spawned</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">Create a spawn to get started</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {agents.slice(0, 5).map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30" data-testid={`agent-preview-${agent.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Bot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium truncate">{agent.name}</span>
                    </div>
                    <StatusBadge status={agent.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Active Swarms</CardTitle>
            <Network className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {!swarms || swarms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Network className="w-8 h-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No swarms created</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">Create a swarm to coordinate agents</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {swarms.slice(0, 5).map((swarm) => (
                  <div key={swarm.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30" data-testid={`swarm-preview-${swarm.id}`}>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-medium truncate">{swarm.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate">{swarm.goal}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{swarm.agentIds.length} agents</span>
                      <StatusBadge status={swarm.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
