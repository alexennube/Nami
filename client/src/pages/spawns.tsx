import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Bot, Plus, Play, Pause, Square, Trash2, Zap, MessageSquare } from "lucide-react";
import type { Agent } from "@shared/schema";

const MODELS = [
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { value: "anthropic/claude-3-haiku", label: "Claude 3 Haiku" },
  { value: "google/gemini-pro-1.5", label: "Gemini Pro 1.5" },
  { value: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B" },
  { value: "mistralai/mixtral-8x7b-instruct", label: "Mixtral 8x7B" },
];

function CreateSpawnDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [model, setModel] = useState("openai/gpt-4o");
  const [systemPrompt, setSystemPrompt] = useState("");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agents", {
        name,
        role: "spawn",
        status: "idle",
        model,
        systemPrompt: systemPrompt || `You are ${name}, a Nami spawn agent. Follow instructions precisely and report results.`,
        parentId: null,
        swarmId: null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setOpen(false);
      setName("");
      setModel("openai/gpt-4o");
      setSystemPrompt("");
      toast({ title: "Spawn created", description: `${name} is ready to receive instructions.` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create spawn", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-spawn">
          <Plus className="w-4 h-4 mr-2" />
          Create Spawn
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Spawn</DialogTitle>
          <DialogDescription>Spawns are child agents managed by Nami. Configure the agent's identity and model.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="spawn-name">Name</Label>
            <Input id="spawn-name" placeholder="e.g. Data Extractor" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-spawn-name" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="spawn-model">Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger data-testid="select-spawn-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="spawn-prompt">System Prompt</Label>
            <Textarea
              id="spawn-prompt"
              placeholder="Define this agent's behavior and capabilities..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="resize-none min-h-[100px]"
              data-testid="input-spawn-prompt"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending} data-testid="button-submit-spawn">
            {createMutation.isPending ? "Creating..." : "Create Spawn"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  const { toast } = useToast();

  const actionMutation = useMutation({
    mutationFn: async (action: string) => {
      const res = await apiRequest("POST", `/api/agents/${agent.id}/action`, { action });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/agents/${agent.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Spawn deleted" });
    },
  });

  return (
    <Card data-testid={`card-agent-${agent.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium truncate">{agent.name}</span>
              <span className="text-[11px] text-muted-foreground font-mono truncate">{agent.model}</span>
            </div>
          </div>
          <StatusBadge status={agent.status} />
        </div>

        <p className="text-[11px] text-muted-foreground mt-3 line-clamp-2">{agent.systemPrompt}</p>

        <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            <span>{agent.tokensUsed.toLocaleString()} tokens</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            <span>{agent.messagesProcessed} messages</span>
          </div>
        </div>

        <div className="flex items-center gap-1 mt-3 flex-wrap">
          {agent.status === "idle" && (
            <Button size="sm" variant="outline" onClick={() => actionMutation.mutate("start")} disabled={actionMutation.isPending} data-testid={`button-start-${agent.id}`}>
              <Play className="w-3 h-3 mr-1" /> Start
            </Button>
          )}
          {agent.status === "running" && (
            <Button size="sm" variant="outline" onClick={() => actionMutation.mutate("pause")} disabled={actionMutation.isPending} data-testid={`button-pause-${agent.id}`}>
              <Pause className="w-3 h-3 mr-1" /> Pause
            </Button>
          )}
          {agent.status === "paused" && (
            <Button size="sm" variant="outline" onClick={() => actionMutation.mutate("resume")} disabled={actionMutation.isPending} data-testid={`button-resume-${agent.id}`}>
              <Play className="w-3 h-3 mr-1" /> Resume
            </Button>
          )}
          {(agent.status === "running" || agent.status === "paused") && (
            <Button size="sm" variant="outline" onClick={() => actionMutation.mutate("stop")} disabled={actionMutation.isPending} data-testid={`button-stop-${agent.id}`}>
              <Square className="w-3 h-3 mr-1" /> Stop
            </Button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} data-testid={`button-delete-${agent.id}`}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Spawns() {
  const { data: agents, isLoading } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const spawns = agents?.filter((a) => a.role === "spawn") || [];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-spawns-title">Spawns</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create and manage Nami's child agents</p>
        </div>
        <CreateSpawnDialog />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : spawns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bot className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-sm font-medium mb-1">No spawns yet</h3>
            <p className="text-[11px] text-muted-foreground text-center max-w-xs">
              Spawns are Nami's child agents. Create one to start delegating tasks and building workflows.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {spawns.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
