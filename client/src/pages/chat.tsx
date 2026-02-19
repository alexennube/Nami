import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Send, Trash2, Zap, User } from "lucide-react";
import type { ChatMessage } from "@shared/schema";

export default function Chat() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const { data: messages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat"],
    refetchInterval: 3000,
  });

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/chat", { message });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send message", description: err.message, variant: "destructive" });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/chat");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
      toast({ title: "Chat cleared" });
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
      <div className="flex items-center justify-between gap-2 p-4 pb-2 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-chat-title">Chat with Nami</h1>
          <p className="text-sm text-muted-foreground">Talk to the orchestrator directly</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => clearMutation.mutate()}
          disabled={clearMutation.isPending || messages.length === 0}
          data-testid="button-clear-chat"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Clear
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-2" ref={scrollRef}>
        {isLoading ? (
          <div className="space-y-4 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-md shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-md bg-primary/10">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-medium" data-testid="text-chat-empty">Start a conversation with Nami</p>
              <p className="text-sm text-muted-foreground mt-1">
                Ask about creating spawns, orchestrating swarms, or running multi-agent workflows
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {sendMutation.isPending && (
              <div className="flex gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary shrink-0">
                  <Zap className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Nami</p>
                  <Card className="p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                      Thinking...
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-4 pt-2 border-t">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            placeholder="Message Nami..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="resize-none min-h-[40px] max-h-[120px]"
            disabled={sendMutation.isPending}
            data-testid="input-chat-message"
          />
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
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`} data-testid={`chat-message-${message.id}`}>
      <div className={`flex items-center justify-center w-8 h-8 rounded-md shrink-0 ${isUser ? "bg-muted" : "bg-primary"}`}>
        {isUser ? (
          <User className="w-4 h-4 text-muted-foreground" />
        ) : (
          <Zap className="w-4 h-4 text-primary-foreground" />
        )}
      </div>
      <div className={`flex-1 pt-1 ${isUser ? "text-right" : ""}`}>
        <p className="text-xs font-medium text-muted-foreground mb-1">
          {isUser ? "You" : message.agentName || "Nami"}
          {!isUser && message.tokensUsed > 0 && (
            <span className="ml-2 font-mono text-[10px]">{message.tokensUsed} tokens</span>
          )}
        </p>
        <Card className={`p-3 inline-block max-w-[85%] text-left ${isUser ? "ml-auto" : ""}`}>
          <p className="text-sm whitespace-pre-wrap" data-testid={`text-message-content-${message.id}`}>{message.content}</p>
        </Card>
      </div>
    </div>
  );
}
