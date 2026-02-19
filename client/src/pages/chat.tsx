import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Send, ChevronDown, ChevronUp } from "lucide-react";
import type { ChatMessage, EngineStatus } from "@shared/schema";

export default function Chat() {
  const [input, setInput] = useState("");
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto px-6 py-4" ref={scrollRef}>
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
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono shrink-0" data-testid="text-model-indicator">
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
                className="w-full bg-card border border-border rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                data-testid="input-chat-message"
              />
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
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
        <div className="bg-card border border-border rounded-md px-4 py-3 max-w-lg">
          <p className="text-sm whitespace-pre-wrap" data-testid={`text-message-content-${message.id}`}>{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start" data-testid={`chat-message-${message.id}`}>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
        {senderLabel}
      </p>
      <div className={`rounded-md px-4 py-3 max-w-lg ${isSleep ? "bg-card border border-border" : "bg-card border border-border"}`}>
        <p className={`text-sm whitespace-pre-wrap ${isSleep ? "font-mono text-muted-foreground" : ""}`} data-testid={`text-message-content-${message.id}`}>
          {message.content}
        </p>
      </div>
      {message.tokensUsed > 0 && (
        <span className="text-[9px] text-muted-foreground font-mono mt-1">{message.tokensUsed} tokens</span>
      )}
    </div>
  );
}
