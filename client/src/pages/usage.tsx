import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Coins, Zap, Network, Bot, Heart, MessageSquare, Trash2 } from "lucide-react";
import type { UsageSummary } from "@shared/schema";

function formatCost(cost: number): string {
  if (cost < 0.001) return `$${cost.toFixed(6)}`;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

const sourceIcons: Record<string, React.ElementType> = {
  heartbeat: Heart,
  chat: MessageSquare,
  agent: Bot,
  swarm: Network,
};

const sourceLabels: Record<string, string> = {
  heartbeat: "Heartbeat",
  chat: "Chat",
  agent: "Spawn Agent",
  swarm: "Swarm Queen",
};

export default function UsagePage() {
  const { data: summary, isLoading } = useQuery<UsageSummary>({
    queryKey: ["/api/usage/summary"],
    refetchInterval: 15000,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/usage");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/usage/summary"] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-3 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const s = summary || { totalCost: 0, totalTokens: 0, totalCalls: 0, bySource: {}, byModel: {}, bySwarm: {} };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-5xl mx-auto" data-testid="page-usage">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/20 border border-primary/30">
            <DollarSign className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-base md:text-lg font-bold tracking-tight" data-testid="text-usage-title">Usage & Costs</h1>
        </div>
        {s.totalCalls > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
            data-testid="button-clear-usage"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="card-total-cost">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/10">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold tracking-tight" data-testid="text-total-cost">{formatCost(s.totalCost)}</p>
              <p className="text-xs text-muted-foreground">Total Cost</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-total-tokens">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500/10">
              <Coins className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold tracking-tight" data-testid="text-total-tokens">{formatTokens(s.totalTokens)}</p>
              <p className="text-xs text-muted-foreground">Total Tokens</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-total-calls">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-500/10">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold tracking-tight" data-testid="text-total-calls">{s.totalCalls}</p>
              <p className="text-xs text-muted-foreground">API Calls</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="source" className="space-y-4">
        <TabsList data-testid="tabs-usage-breakdown">
          <TabsTrigger value="source" data-testid="tab-by-source">By Source</TabsTrigger>
          <TabsTrigger value="model" data-testid="tab-by-model">By Model</TabsTrigger>
          <TabsTrigger value="swarm" data-testid="tab-by-swarm">By Swarm</TabsTrigger>
        </TabsList>

        <TabsContent value="source">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Cost by Source</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(s.bySource).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-source-data">No usage data yet</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(s.bySource)
                    .sort((a, b) => b[1].cost - a[1].cost)
                    .map(([source, data]) => {
                      const Icon = sourceIcons[source] || Zap;
                      const pct = s.totalCost > 0 ? (data.cost / s.totalCost) * 100 : 0;
                      return (
                        <div key={source} className="flex items-center gap-3" data-testid={`row-source-${source}`}>
                          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{sourceLabels[source] || source}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px]">{data.count} calls</Badge>
                                <span className="text-sm font-semibold tabular-nums">{formatCost(data.cost)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{formatTokens(data.tokens)} tokens</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="model">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Cost by Model</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[400px]">
                {Object.keys(s.byModel).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-model-data">No usage data yet</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(s.byModel)
                      .sort((a, b) => b[1].cost - a[1].cost)
                      .map(([model, data]) => {
                        const pct = s.totalCost > 0 ? (data.cost / s.totalCost) * 100 : 0;
                        return (
                          <div key={model} data-testid={`row-model-${model}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-mono text-muted-foreground truncate max-w-[60%]">{model}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px]">{data.count} calls</Badge>
                                <span className="text-sm font-semibold tabular-nums">{formatCost(data.cost)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{formatTokens(data.tokens)} tokens</p>
                          </div>
                        );
                      })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="swarm">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Cost by Swarm</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(s.bySwarm).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-swarm-data">No swarm usage data yet</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(s.bySwarm)
                    .sort((a, b) => b[1].cost - a[1].cost)
                    .map(([swarmId, data]) => {
                      const pct = s.totalCost > 0 ? (data.cost / s.totalCost) * 100 : 0;
                      return (
                        <div key={swarmId} data-testid={`row-swarm-${swarmId}`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <Network className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium truncate">{data.name || swarmId.slice(0, 8)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px]">{data.count} calls</Badge>
                              <span className="text-sm font-semibold tabular-nums">{formatCost(data.cost)}</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{formatTokens(data.tokens)} tokens</p>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
