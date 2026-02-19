import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Brain, Trash2, Lightbulb, Target, Eye, RefreshCw } from "lucide-react";
import type { Thought } from "@shared/schema";

const typeIcons: Record<string, React.ElementType> = {
  reasoning: Lightbulb,
  planning: Target,
  reflection: RefreshCw,
  observation: Eye,
};

const typeColors: Record<string, string> = {
  reasoning: "text-amber-500 dark:text-amber-400",
  planning: "text-blue-500 dark:text-blue-400",
  reflection: "text-purple-500 dark:text-purple-400",
  observation: "text-emerald-500 dark:text-emerald-400",
};

export default function Thoughts() {
  const { data: thoughts = [], isLoading } = useQuery<Thought[]>({
    queryKey: ["/api/thoughts"],
    refetchInterval: 5000,
  });
  const { toast } = useToast();

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/thoughts");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/thoughts"] });
      toast({ title: "Thoughts cleared" });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 p-4 pb-2 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-thoughts-title">Thoughts</h1>
          <p className="text-xs text-muted-foreground">Nami's internal reasoning and observations</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => clearMutation.mutate()}
          disabled={clearMutation.isPending || thoughts.length === 0}
          data-testid="button-clear-thoughts"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          Clear
        </Button>
      </div>

      <ScrollArea className="flex-1 px-4 pb-4">
        {isLoading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : thoughts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Brain className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No thoughts yet</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Thoughts will appear as Nami processes messages and heartbeats</p>
          </div>
        ) : (
          <div className="space-y-2 py-2">
            {thoughts.map((thought) => {
              const Icon = typeIcons[thought.type] || Brain;
              const color = typeColors[thought.type] || "text-muted-foreground";
              return (
                <Card key={thought.id} data-testid={`thought-${thought.id}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline" className="text-[9px]">{thought.type}</Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {new Date(thought.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-foreground/80">{thought.content}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
