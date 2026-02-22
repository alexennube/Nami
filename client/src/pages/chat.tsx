import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";
import { Send, ChevronDown, ChevronUp, Heart, PanelRightOpen, PanelRightClose, Clock, Zap, Moon, AlertTriangle } from "lucide-react";
import type { ChatMessage, EngineStatus, HeartbeatLog } from "@shared/schema";

export default function Chat() {
  const [input, setInput] = useState("");
  const isMobile = useIsMobile();
  const [timelineOpen, setTimelineOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: messages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat"],
    refetchInterval: 3000,
  });

  const { data: engineStatus } = useQuery<EngineStatus>({
    queryKey: ["/api/engine/status"],
  });

  const { data: heartbeatLogs = [] } = useQuery<HeartbeatLog[]>({
    queryKey: ["/api/heartbeat/logs"],
    refetchInterval: 5000,
  });

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/chat", { message });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/thoughts"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send message", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSend() {
    const msg = input.trim();
    if (!msg || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate(msg);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatTime(ts: string): string {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex-1 overflow-auto px-3 md:px-6 py-4" ref={scrollRef}>
          {isLoading ? (
            <div className="space-y-6 py-4 max-w-3xl mx-auto">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-14 w-3/4" />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 gap-3 max-w-md mx-auto">
              <div className="text-muted-foreground/30 text-4xl font-mono">~</div>
              <div>
                <p className="font-medium text-sm" data-testid="text-chat-empty">Start a conversation with Nami</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ask about creating spawns, orchestrating swarms, or running multi-agent workflows
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5 py-2 max-w-3xl mx-auto">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {sendMutation.isPending && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Nami</p>
                  <div className="bg-card border border-border rounded-md p-4 max-w-lg">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t bg-background">
          <div className="max-w-3xl mx-auto px-3 md:px-4 py-2 md:py-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-mono shrink-0 hidden md:inline" data-testid="text-model-indicator">
                {engineStatus?.currentModel || "openai/gpt-4o"}
              </span>
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Message Nami..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sendMutation.isPending}
                  className="w-full bg-card border border-border rounded-md px-3 md:px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                  data-testid="input-chat-message"
                />
              </div>
              <div className="flex items-center gap-1">
                {!isMobile && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setTimelineOpen(!timelineOpen)}
                    data-testid="button-toggle-timeline"
                  >
                    {timelineOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="hidden md:inline-flex"
                  onClick={() => {
                    if (scrollRef.current) scrollRef.current.scrollTop = 0;
                  }}
                  data-testid="button-scroll-up"
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="hidden md:inline-flex"
                  onClick={() => {
                    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                  }}
                  data-testid="button-scroll-down"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!input.trim() || sendMutation.isPending}
                  data-testid="button-send-message"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {timelineOpen && !isMobile && (
        <div className="w-72 border-l flex flex-col h-full bg-sidebar shrink-0">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
            <div className="flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold" data-testid="text-timeline-title">Heartbeat Timeline</span>
            </div>
            <Badge variant="secondary" className="text-[9px]" data-testid="text-timeline-count">
              {heartbeatLogs.length}
            </Badge>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2">
              {heartbeatLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                  <Heart className="w-6 h-6 text-muted-foreground/30" />
                  <p className="text-[11px] text-muted-foreground">No heartbeats yet</p>
                  <p className="text-[10px] text-muted-foreground/60">Enable heartbeat and start the engine</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {heartbeatLogs.map((log) => (
                    <HeartbeatEntry key={log.id} log={log} formatDuration={formatDuration} formatTime={formatTime} />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

function HeartbeatEntry({ log, formatDuration, formatTime }: { log: HeartbeatLog; formatDuration: (ms: number) => string; formatTime: (ts: string) => string }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = log.status === "active" ? (
    <Zap className="w-3 h-3 text-primary" />
  ) : log.status === "sleep" ? (
    <Moon className="w-3 h-3 text-muted-foreground" />
  ) : (
    <AlertTriangle className="w-3 h-3 text-destructive" />
  );

  const statusColor = log.status === "active" ? "text-primary" : log.status === "sleep" ? "text-muted-foreground" : "text-destructive";

  return (
    <div
      role="button"
      tabIndex={0}
      className="rounded-md border border-border/50 bg-background cursor-pointer hover-elevate"
      onClick={() => setExpanded(!expanded)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded(!expanded); }}
      data-testid={`button-heartbeat-log-${log.beatNumber}`}
    >
      <div className="flex items-start gap-2 p-2">
        <div className="mt-0.5 shrink-0">{statusIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <span className={`text-[10px] font-semibold uppercase ${statusColor}`} data-testid={`text-heartbeat-status-${log.beatNumber}`}>
              #{log.beatNumber} {log.status}
            </span>
            <span className="text-[9px] text-muted-foreground font-mono" data-testid={`text-heartbeat-time-${log.beatNumber}`}>
              {formatTime(log.timestamp)}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2" data-testid={`text-heartbeat-summary-${log.beatNumber}`}>
            {log.summary}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {log.attempts > 1 && (
              <span className="text-[9px] text-muted-foreground font-mono" data-testid={`text-heartbeat-attempts-${log.beatNumber}`}>{log.attempts} attempts</span>
            )}
            {log.totalTokens > 0 && (
              <span className="text-[9px] text-muted-foreground font-mono" data-testid={`text-heartbeat-tokens-${log.beatNumber}`}>{log.totalTokens} tok</span>
            )}
            <span className="text-[9px] text-muted-foreground font-mono flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {formatDuration(log.duration)}
            </span>
          </div>
        </div>
      </div>

      {expanded && log.details.length > 0 && (
        <div className="border-t border-border/50 px-2 py-1.5 space-y-1" data-testid={`section-heartbeat-details-${log.beatNumber}`}>
          {log.details.map((d, i) => (
            <div key={i} className="text-[9px] text-muted-foreground" data-testid={`text-heartbeat-detail-${log.beatNumber}-${i}`}>
              <span className="font-mono font-semibold">#{d.attempt}</span>{" "}
              <span className="text-foreground/70">{d.result}</span>
              {d.tokensUsed > 0 && (
                <span className="font-mono ml-1">({d.tokensUsed} tok)</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isAutonomous = message.autonomous;
  const isSleep = message.content === "< SLEEP >";

  const senderLabel = isUser
    ? "YOU"
    : isAutonomous
      ? `${(message.agentName || "NAMI").toUpperCase()} (AUTONOMOUS)`
      : (message.agentName || "NAMI").toUpperCase();

  if (isUser) {
    return (
      <div className="flex flex-col items-end" data-testid={`chat-message-${message.id}`}>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          {senderLabel}
        </p>
        <div className="bg-card border border-border rounded-md px-3 md:px-4 py-3 max-w-[85vw] md:max-w-lg">
          <p className="text-sm whitespace-pre-wrap break-words" data-testid={`text-message-content-${message.id}`}>{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start" data-testid={`chat-message-${message.id}`}>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
        {senderLabel}
      </p>
      <div className={`rounded-md px-3 md:px-4 py-3 max-w-[85vw] md:max-w-lg ${isSleep ? "bg-card border border-border" : "bg-card border border-border"}`}>
        <p className={`text-sm whitespace-pre-wrap break-words ${isSleep ? "font-mono text-muted-foreground" : ""}`} data-testid={`text-message-content-${message.id}`}>
          {message.content}
        </p>
      </div>
      {message.tokensUsed > 0 && (
        <span className="text-[9px] text-muted-foreground font-mono mt-1">{message.tokensUsed} tokens</span>
      )}
    </div>
  );
}
