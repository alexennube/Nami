import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/status-badge";
import { ArrowLeft, Crown, Bot, Network, Target, Brain, AlertCircle, CheckCircle2, Zap, MessageSquare } from "lucide-react";
import type { Swarm, Agent, SwarmMessage } from "@shared/schema";
import { useEffect, useRef } from "react";

const TYPE_CONFIG: Record<string, { icon: typeof Crown; color: string; label: string }> = {
  queen_thinking: { icon: Brain, color: "text-purple-400", label: "Queen" },
  spawn_created: { icon: Zap, color: "text-amber-400", label: "Spawn Created" },
  spawn_result: { icon: Bot, color: "text-blue-400", label: "Spawn" },
  queen_review: { icon: Crown, color: "text-pink-400", label: "Review" },
  queen_decision: { icon: Crown, color: "text-purple-400", label: "Decision" },
  system: { icon: Network, color: "text-muted-foreground", label: "System" },
  error: { icon: AlertCircle, color: "text-red-400", label: "Error" },
  completion: { icon: CheckCircle2, color: "text-emerald-400", label: "Complete" },
};

function MessageBubble({ msg }: { msg: SwarmMessage }) {
  const config = TYPE_CONFIG[msg.type] || TYPE_CONFIG.system;
  const Icon = config.icon;
  const isQueen = msg.type === "queen_thinking" || msg.type === "queen_review" || msg.type === "queen_decision";
  const isSystem = msg.type === "system" || msg.type === "completion";
  const isError = msg.type === "error";
  const isSpawn = msg.type === "spawn_result" || msg.type === "spawn_created";

  if (isSystem || isError) {
    return (
      <div className="flex justify-center my-2" data-testid={`swarm-msg-${msg.id}`}>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] ${isError ? "bg-red-500/10 text-red-400" : "bg-muted/50 text-muted-foreground"}`}>
          <Icon className="w-3 h-3 shrink-0" />
          <span>{msg.content}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 mb-3 ${isQueen ? "justify-start" : "justify-start"}`} data-testid={`swarm-msg-${msg.id}`}>
      <div className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-1 ${isQueen ? "bg-purple-500/20" : isSpawn ? "bg-blue-500/20" : "bg-muted/30"}`}>
        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0 max-w-[85%]">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium ${config.color}`}>{msg.agentName}</span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
            {config.label}
          </Badge>
          <span className="text-[9px] text-muted-foreground">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
          isQueen ? "bg-purple-500/10 border border-purple-500/20" :
          isSpawn && msg.type === "spawn_created" ? "bg-amber-500/10 border border-amber-500/20" :
          "bg-blue-500/10 border border-blue-500/20"
        }`}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}

export default function SwarmDetail() {
  const params = useParams<{ id: string }>();
  const swarmId = params.id;
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: swarm, isLoading: swarmLoading } = useQuery<Swarm>({
    queryKey: [`/api/swarms/${swarmId}`],
    refetchInterval: 5000,
  });

  const { data: messages, isLoading: msgsLoading } = useQuery<SwarmMessage[]>({
    queryKey: [`/api/swarms/${swarmId}/messages`],
    refetchInterval: 3000,
  });

  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const swarmAgents = agents?.filter((a) => a.swarmId === swarmId) || [];
  const queen = agents?.find((a) => a.id === swarm?.queenId);
  const spawns = swarmAgents.filter((a) => a.role === "spawn");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  if (swarmLoading) {
    return (
      <div className="flex flex-col h-full p-6 max-w-4xl mx-auto gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!swarm) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <Network className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-sm font-medium mb-2">Swarm not found</h3>
        <Link href="/swarms">
          <Button variant="outline" size="sm" data-testid="button-back-swarms">
            <ArrowLeft className="w-3 h-3 mr-1" /> Back to Swarms
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto">
      <div className="flex items-center gap-3 p-4 border-b shrink-0">
        <Link href="/swarms">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Network className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="font-medium text-sm truncate" data-testid="text-swarm-name">{swarm.name}</span>
          <StatusBadge status={swarm.status} />
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
          <span>{swarm.progress}%</span>
          <Progress value={swarm.progress} className="h-1.5 w-16" />
        </div>
      </div>

      <div className="flex items-start gap-4 p-4 border-b shrink-0 bg-muted/20">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Goal</span>
          </div>
          <p className="text-xs" data-testid="text-swarm-goal">{swarm.goal}</p>
          {swarm.objective && swarm.objective !== swarm.goal && (
            <p className="text-[11px] text-muted-foreground mt-1" data-testid="text-swarm-objective">{swarm.objective}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 shrink-0">
          {queen && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <Crown className="w-3 h-3 text-purple-500" />
              <span className="text-purple-400 font-medium">{queen.name}</span>
              <StatusBadge status={queen.status} />
            </div>
          )}
          {spawns.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <Bot className="w-3 h-3 text-blue-400" />
              <span className="text-muted-foreground">{spawns.length} spawn{spawns.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {msgsLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-2">
                <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <MessageSquare className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No activity yet</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              {swarm.status === "pending" ? "Activate this swarm to start the SwarmQueen" : "Messages will appear here as agents work"}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full" ref={scrollRef}>
            <div className="p-4 space-y-1">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {spawns.length > 0 && (
        <div className="border-t p-3 shrink-0 bg-muted/10">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Agents</span>
          <div className="flex flex-wrap gap-1.5">
            {spawns.map((s) => (
              <Badge key={s.id} variant="outline" className="text-[10px] gap-1" data-testid={`badge-spawn-${s.id}`}>
                <Bot className="w-2.5 h-2.5" />
                {s.name}
                <span className={`w-1.5 h-1.5 rounded-full ${s.status === "completed" ? "bg-emerald-400" : s.status === "running" ? "bg-blue-400 animate-pulse" : "bg-muted-foreground/40"}`} />
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
