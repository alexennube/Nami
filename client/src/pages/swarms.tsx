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
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Network, Plus, Crown, Bot, Play, Pause, Trash2, Target, Code, MessageSquare, ChevronDown, ChevronRight, Zap, CheckCircle2, XCircle } from "lucide-react";
import type { Swarm, Agent, SwarmStep } from "@shared/schema";

type NewStep = { name: string; type: "prompt" | "code"; instruction: string };

function CreateSwarmDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [objective, setObjective] = useState("");
  const [steps, setSteps] = useState<NewStep[]>([]);
  const [showSteps, setShowSteps] = useState(false);
  const { toast } = useToast();

  function addStep() {
    setSteps([...steps, { name: "", type: "prompt", instruction: "" }]);
    setShowSteps(true);
  }

  function updateStep(i: number, updates: Partial<NewStep>) {
    const updated = [...steps];
    updated[i] = { ...updated[i], ...updates };
    setSteps(updated);
  }

  function removeStep(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i));
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { name, goal, objective, status: "pending" };
      if (steps.length > 0) {
        payload.steps = steps.filter((s) => s.name && s.instruction);
      }
      const res = await apiRequest("POST", "/api/swarms", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swarms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setOpen(false);
      setName("");
      setGoal("");
      setObjective("");
      setSteps([]);
      toast({ title: "Swarm created", description: `${name} swarm with SwarmQueen is ready.` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create swarm", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-swarm">
          <Plus className="w-4 h-4 mr-2" />
          Create Swarm
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Swarm</DialogTitle>
          <DialogDescription>A swarm coordinates agents toward a goal. Define prompt-based or code-based workflow steps, or leave empty and let Nami manage it.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="swarm-name">Swarm Name</Label>
            <Input id="swarm-name" placeholder="e.g. Data Extraction Pipeline" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-swarm-name" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="swarm-goal">Goal</Label>
            <Input id="swarm-goal" placeholder="e.g. Extract 10 years of financial data" value={goal} onChange={(e) => setGoal(e.target.value)} data-testid="input-swarm-goal" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="swarm-objective">Objective</Label>
            <Textarea
              id="swarm-objective"
              placeholder="Describe the specific outcome the swarm should achieve..."
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="resize-none min-h-[80px]"
              data-testid="input-swarm-objective"
            />
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-sm">Workflow Steps (optional)</Label>
              <Button variant="outline" size="sm" onClick={addStep} data-testid="button-add-step">
                <Plus className="w-3 h-3 mr-1" /> Add Step
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Define the execution steps as prompts or code blocks</p>

            {steps.length > 0 && (
              <div className="flex flex-col gap-3 mt-3">
                {steps.map((step, i) => (
                  <Card key={i} className="p-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">Step {i + 1}</span>
                        <Input
                          placeholder="Step name"
                          value={step.name}
                          onChange={(e) => updateStep(i, { name: e.target.value })}
                          className="flex-1"
                          data-testid={`input-step-name-${i}`}
                        />
                        <Select value={step.type} onValueChange={(v) => updateStep(i, { type: v as "prompt" | "code" })}>
                          <SelectTrigger className="w-[100px]" data-testid={`select-step-type-${i}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="prompt">Prompt</SelectItem>
                            <SelectItem value="code">Code</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="icon" variant="ghost" onClick={() => removeStep(i)} data-testid={`button-remove-step-${i}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <Textarea
                        placeholder={step.type === "prompt" ? "Enter the prompt instruction..." : "Enter executable code..."}
                        value={step.instruction}
                        onChange={(e) => updateStep(i, { instruction: e.target.value })}
                        className={`resize-none min-h-[60px] ${step.type === "code" ? "font-mono text-xs" : ""}`}
                        data-testid={`input-step-instruction-${i}`}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!name || !goal || createMutation.isPending} data-testid="button-submit-swarm">
            {createMutation.isPending ? "Creating..." : "Create Swarm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepsList({ steps }: { steps: SwarmStep[] }) {
  const [expanded, setExpanded] = useState(false);

  if (steps.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hover-elevate rounded-md px-1 py-0.5"
        data-testid="button-toggle-steps"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {steps.length} workflow step{steps.length !== 1 ? "s" : ""}
      </button>
      {expanded && (
        <div className="flex flex-col gap-1 mt-2">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-2 p-1.5 rounded-md bg-muted/30" data-testid={`step-${step.id}`}>
              <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-4 text-right">{i + 1}</span>
              {step.type === "prompt" ? (
                <MessageSquare className="w-3 h-3 text-blue-500 shrink-0" />
              ) : (
                <Code className="w-3 h-3 text-emerald-500 shrink-0" />
              )}
              <span className="text-xs truncate flex-1">{step.name}</span>
              <StatusBadge status={step.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SwarmCard({ swarm }: { swarm: Swarm }) {
  const { toast } = useToast();
  const { data: agents } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const swarmAgents = agents?.filter((a) => a.swarmId === swarm.id) || [];
  const queen = agents?.find((a) => a.id === swarm.queenId);

  const actionMutation = useMutation({
    mutationFn: async (action: string) => {
      const res = await apiRequest("POST", `/api/swarms/${swarm.id}/action`, { action });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swarms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/swarms/${swarm.id}/run`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swarms"] });
      toast({ title: "Swarm execution started" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to run", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/swarms/${swarm.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swarms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Swarm disbanded" });
    },
  });

  return (
    <Card data-testid={`card-swarm-${swarm.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-amber-500/10 shrink-0">
              <Network className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium truncate">{swarm.name}</span>
              <span className="text-[11px] text-muted-foreground truncate">{swarm.agentIds.length} agents</span>
            </div>
          </div>
          <StatusBadge status={swarm.status} />
        </div>

        <div className="mt-3 p-2 rounded-md bg-muted/30">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Goal</span>
          </div>
          <p className="text-xs">{swarm.goal}</p>
        </div>

        {queen && (
          <div className="flex items-center gap-2 mt-3 p-2 rounded-md bg-purple-500/5 border border-purple-500/10">
            <Crown className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
            <div className="flex flex-col gap-0 min-w-0">
              <span className="text-[11px] font-medium truncate">{queen.name}</span>
              <span className="text-[10px] text-muted-foreground">SwarmQueen</span>
            </div>
            <StatusBadge status={queen.status} />
          </div>
        )}

        <StepsList steps={swarm.steps || []} />

        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] text-muted-foreground">Progress</span>
            <span className="text-[10px] font-mono text-muted-foreground">{swarm.progress}%</span>
          </div>
          <Progress value={swarm.progress} className="h-1.5" />
        </div>

        {swarmAgents.length > 0 && (
          <div className="mt-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Agents</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {swarmAgents.filter(a => a.role !== "swarm_queen").map((a) => (
                <Badge key={a.id} variant="outline" className="text-[10px]">
                  <Bot className="w-2.5 h-2.5 mr-1" />
                  {a.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 mt-3 flex-wrap">
          {swarm.status === "pending" && (
            <>
              <Button size="sm" variant="outline" onClick={() => actionMutation.mutate("activate")} disabled={actionMutation.isPending} data-testid={`button-activate-swarm-${swarm.id}`}>
                <Play className="w-3 h-3 mr-1" /> Activate
              </Button>
              {swarm.steps && swarm.steps.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => runMutation.mutate()} disabled={runMutation.isPending} data-testid={`button-run-swarm-${swarm.id}`}>
                  <Play className="w-3 h-3 mr-1" /> Run Steps
                </Button>
              )}
            </>
          )}
          {swarm.status === "active" && (
            <Button size="sm" variant="outline" onClick={() => actionMutation.mutate("pause")} disabled={actionMutation.isPending} data-testid={`button-pause-swarm-${swarm.id}`}>
              <Pause className="w-3 h-3 mr-1" /> Pause
            </Button>
          )}
          {swarm.status === "paused" && (
            <Button size="sm" variant="outline" onClick={() => actionMutation.mutate("resume")} disabled={actionMutation.isPending} data-testid={`button-resume-swarm-${swarm.id}`}>
              <Play className="w-3 h-3 mr-1" /> Resume
            </Button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} data-testid={`button-delete-swarm-${swarm.id}`}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type FilterTab = "active" | "completed" | "cancelled";

const ACTIVE_STATUSES = ["active", "pending", "paused"];
const COMPLETED_STATUSES = ["completed"];
const CANCELLED_STATUSES = ["cancelled", "failed"];

function filterSwarms(swarms: Swarm[], tab: FilterTab): Swarm[] {
  switch (tab) {
    case "active":
      return swarms.filter((s) => ACTIVE_STATUSES.includes(s.status));
    case "completed":
      return swarms.filter((s) => COMPLETED_STATUSES.includes(s.status));
    case "cancelled":
      return swarms.filter((s) => CANCELLED_STATUSES.includes(s.status));
    default:
      return swarms;
  }
}

function countByFilter(swarms: Swarm[]): Record<FilterTab, number> {
  return {
    active: swarms.filter((s) => ACTIVE_STATUSES.includes(s.status)).length,
    completed: swarms.filter((s) => COMPLETED_STATUSES.includes(s.status)).length,
    cancelled: swarms.filter((s) => CANCELLED_STATUSES.includes(s.status)).length,
  };
}

export default function Swarms() {
  const [filter, setFilter] = useState<FilterTab>("active");
  const { data: swarms, isLoading } = useQuery<Swarm[]>({ queryKey: ["/api/swarms"] });

  const counts = swarms ? countByFilter(swarms) : { active: 0, completed: 0, cancelled: 0 };
  const filtered = swarms ? filterSwarms(swarms, filter) : [];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-swarms-title">Swarms</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Coordinate agents with embedded workflow steps</p>
        </div>
        <CreateSwarmDialog />
      </div>

      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={(v) => { if (v) setFilter(v as FilterTab); }}
        className="justify-start"
        data-testid="toggle-swarm-filter"
      >
        <ToggleGroupItem value="active" aria-label="Active swarms" className="gap-1.5 text-xs" data-testid="toggle-filter-active">
          <Zap className="w-3.5 h-3.5" />
          Active
          {counts.active > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4 min-w-4 justify-center">{counts.active}</Badge>
          )}
        </ToggleGroupItem>
        <ToggleGroupItem value="completed" aria-label="Completed swarms" className="gap-1.5 text-xs" data-testid="toggle-filter-completed">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Completed
          {counts.completed > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4 min-w-4 justify-center">{counts.completed}</Badge>
          )}
        </ToggleGroupItem>
        <ToggleGroupItem value="cancelled" aria-label="Cancelled and failed swarms" className="gap-1.5 text-xs" data-testid="toggle-filter-cancelled">
          <XCircle className="w-3.5 h-3.5" />
          Cancelled / Failed
          {counts.cancelled > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4 min-w-4 justify-center">{counts.cancelled}</Badge>
          )}
        </ToggleGroupItem>
      </ToggleGroup>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Network className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-sm font-medium mb-1">
              {filter === "active" ? "No active swarms" : filter === "completed" ? "No completed swarms" : "No cancelled or failed swarms"}
            </h3>
            <p className="text-[11px] text-muted-foreground text-center max-w-xs">
              {filter === "active"
                ? "Create a new swarm to coordinate agents toward a goal. Each swarm has a SwarmQueen for autonomous QA."
                : filter === "completed"
                  ? "Completed swarms will appear here once they finish their objectives."
                  : "Cancelled or failed swarms will appear here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((swarm) => (
            <SwarmCard key={swarm.id} swarm={swarm} />
          ))}
        </div>
      )}
    </div>
  );
}
