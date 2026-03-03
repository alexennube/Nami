import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";
import { Send, ChevronDown, ChevronUp, Heart, PanelRightClose, Clock, Zap, Moon, AlertTriangle, Plus, MessageSquare, MoreHorizontal, Pencil, Trash2, Check } from "lucide-react";
import type { ChatMessage, ChatSession, EngineStatus, HeartbeatLog } from "@shared/schema";

export default function Chat() {
  const [input, setInput] = useState("");
  const isMobile = useIsMobile();
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: sessions = [] } = useQuery<ChatSession[]>({
    queryKey: ["/api/chat/sessions"],
  });

  const { data: activeSessionData } = useQuery<{ sessionId: string }>({
    queryKey: ["/api/chat/sessions/active"],
  });

  const activeSessionId = activeSessionData?.sessionId || "default";
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const { data: messages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat", activeSessionId],
    queryFn: async () => {
      const res = await fetch(`/api/chat?sessionId=${activeSessionId}`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
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
      const res = await apiRequest("POST", "/api/chat", { message, sessionId: activeSessionId });
      return res.json();
    },
    onMutate: async (message: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/chat", activeSessionId] });
      const previous = queryClient.getQueryData<ChatMessage[]>(["/api/chat", activeSessionId]);
      const optimisticMsg: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        sessionId: activeSessionId,
        role: "user",
        content: message,
        agentId: null,
        agentName: null,
        tokensUsed: 0,
        autonomous: false,
        timestamp: new Date().toISOString(),
      };
      queryClient.setQueryData<ChatMessage[]>(["/api/chat", activeSessionId], (old = []) => [...old, optimisticMsg]);
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat", activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/thoughts"] });
    },
    onError: (err: Error, _msg, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/chat", activeSessionId], context.previous);
      }
      toast({ title: "Failed to send message", description: err.message, variant: "destructive" });
    },
  });

  const createSessionMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/chat/sessions", { name });
      return res.json();
    },
    onSuccess: (session: ChatSession) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions/active"] });
      setNewSessionDialogOpen(false);
      setNewSessionName("");
      toast({ title: "Chat created", description: `Switched to "${session.name}"` });
    },
  });

  const activateSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/chat/sessions/${id}/activate`);
      return res.json();
    },
    onSuccess: (_data, newId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat", newId] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat", activeSessionId] });
    },
  });

  const renameSessionMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/chat/sessions/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      setRenameSessionId(null);
      setRenameValue("");
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/chat/sessions/${id}`);
    },
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions/active"] });
      queryClient.removeQueries({ queryKey: ["/api/chat", deletedId] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat", "default"] });
      toast({ title: "Chat deleted" });
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
        <div className="flex items-center gap-2 px-3 md:px-6 py-2 border-b bg-background shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs font-medium max-w-[200px] md:max-w-[300px]" data-testid="button-session-picker">
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{activeSession?.name || "Main Chat"}</span>
                <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {sessions.map((session) => (
                <DropdownMenuItem
                  key={session.id}
                  className="flex items-center justify-between gap-2"
                  onClick={() => {
                    if (session.id !== activeSessionId) {
                      activateSessionMutation.mutate(session.id);
                    }
                  }}
                  data-testid={`menu-session-${session.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {session.id === activeSessionId && <Check className="w-3 h-3 text-primary shrink-0" />}
                    <span className="truncate text-xs">{session.name}</span>
                  </div>
                  {session.id !== "default" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0">
                          <MoreHorizontal className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          setRenameSessionId(session.id);
                          setRenameValue(session.name);
                        }}>
                          <Pencil className="w-3 h-3 mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSessionMutation.mutate(session.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setNewSessionDialogOpen(true)} data-testid="button-new-session">
                <Plus className="w-3 h-3 mr-2" /> New Chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-[10px] text-muted-foreground font-mono hidden md:inline">
            {messages.length} messages
          </span>
        </div>

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

      {!isMobile && (
        timelineOpen ? (
          <div className="w-72 border-l flex flex-col h-full bg-sidebar shrink-0">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
              <div className="flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold" data-testid="text-timeline-title">Heartbeat Timeline</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="secondary" className="text-[9px]" data-testid="text-timeline-count">
                  {heartbeatLogs.length}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => setTimelineOpen(false)}
                  data-testid="button-collapse-timeline"
                >
                  <PanelRightClose className="w-3.5 h-3.5" />
                </Button>
              </div>
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
        ) : (
          <div className="w-12 border-l flex flex-col items-center bg-sidebar shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className="mt-2 h-8 w-8 rounded-full"
              onClick={() => setTimelineOpen(true)}
              data-testid="button-expand-timeline"
            >
              <Heart className="w-4 h-4 text-primary" />
            </Button>
          </div>
        )
      )}

      <Dialog open={newSessionDialogOpen} onOpenChange={setNewSessionDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Chat</DialogTitle>
            <DialogDescription>Create a new conversation with Nami</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Chat name..."
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSessionName.trim()) {
                createSessionMutation.mutate(newSessionName.trim());
              }
            }}
            data-testid="input-new-session-name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSessionDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createSessionMutation.mutate(newSessionName.trim())}
              disabled={!newSessionName.trim() || createSessionMutation.isPending}
              data-testid="button-create-session"
            >
              {createSessionMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameSessionId} onOpenChange={(open) => { if (!open) setRenameSessionId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
            <DialogDescription>Give this conversation a new name</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Chat name..."
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameValue.trim() && renameSessionId) {
                renameSessionMutation.mutate({ id: renameSessionId, name: renameValue.trim() });
              }
            }}
            data-testid="input-rename-session"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameSessionId(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (renameSessionId && renameValue.trim()) {
                  renameSessionMutation.mutate({ id: renameSessionId, name: renameValue.trim() });
                }
              }}
              disabled={!renameValue.trim() || renameSessionMutation.isPending}
              data-testid="button-rename-session"
            >
              {renameSessionMutation.isPending ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
