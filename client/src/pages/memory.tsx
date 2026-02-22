import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BookOpen, Plus, Trash2, Star } from "lucide-react";
import type { Memory } from "@shared/schema";

function AddMemoryDialog() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [importance, setImportance] = useState(5);
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/memories", { content, category, importance });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memories"] });
      setOpen(false);
      setContent("");
      setCategory("general");
      setImportance(5);
      toast({ title: "Memory added" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-add-memory">
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Memory
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] md:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Memory</DialogTitle>
          <DialogDescription>Store important context for Nami to reference.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Content</Label>
            <Textarea
              placeholder="What should Nami remember..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="resize-none min-h-[80px]"
              data-testid="input-memory-content"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Category</Label>
            <Input
              placeholder="e.g. agents, swarms, preferences"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              data-testid="input-memory-category"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Importance (0-10)</Label>
            <Input
              type="number"
              min={0}
              max={10}
              value={importance}
              onChange={(e) => setImportance(Number(e.target.value))}
              data-testid="input-memory-importance"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!content.trim() || createMutation.isPending} data-testid="button-submit-memory">
            {createMutation.isPending ? "Saving..." : "Save Memory"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MemoryPage() {
  const { data: memories = [], isLoading } = useQuery<Memory[]>({
    queryKey: ["/api/memories"],
    refetchInterval: 5000,
  });
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/memories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memories"] });
      toast({ title: "Memory deleted" });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 p-3 md:p-4 pb-2 flex-wrap">
        <div>
          <h1 className="text-base md:text-lg font-semibold" data-testid="text-memory-title">Memory</h1>
          <p className="text-xs text-muted-foreground">Nami's stored context and knowledge</p>
        </div>
        <AddMemoryDialog />
      </div>

      <ScrollArea className="flex-1 px-3 md:px-4 pb-4">
        {isLoading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No memories stored</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Memories are created as Nami works, or you can add them manually</p>
          </div>
        ) : (
          <div className="space-y-2 py-2">
            {memories.map((memory) => (
              <Card key={memory.id} data-testid={`memory-${memory.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-[9px]">{memory.category}</Badge>
                        <div className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 text-amber-400" />
                          <span className="text-[10px] text-muted-foreground">{memory.importance}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(memory.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/80">{memory.content}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-destructive"
                      onClick={() => deleteMutation.mutate(memory.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-memory-${memory.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
