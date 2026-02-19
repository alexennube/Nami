import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { GitBranch, Plus, Play, CheckCircle2, XCircle, Clock, ArrowRight, Trash2 } from "lucide-react";
import type { Workflow, WorkflowStep } from "@shared/schema";

const stepStatusIcons: Record<string, React.ElementType> = {
  pending: Clock,
  running: Play,
  completed: CheckCircle2,
  failed: XCircle,
  skipped: ArrowRight,
};

function CreateWorkflowDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stepsText, setStepsText] = useState("");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const stepNames = stepsText.split("\n").filter((s) => s.trim());
      const steps: Omit<WorkflowStep, "id">[] = stepNames.map((s, i) => ({
        name: s.trim(),
        description: "",
        status: "pending" as const,
        agentId: null,
        input: null,
        output: null,
        order: i,
      }));
      const res = await apiRequest("POST", "/api/workflows", {
        name,
        description,
        steps,
        swarmId: null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setOpen(false);
      setName("");
      setDescription("");
      setStepsText("");
      toast({ title: "Workflow created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create workflow", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-workflow">
          <Plus className="w-4 h-4 mr-2" />
          Create Workflow
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Workflow</DialogTitle>
          <DialogDescription>Define a multi-step workflow for agents to execute sequentially.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="wf-name">Name</Label>
            <Input id="wf-name" placeholder="e.g. Financial Data Pipeline" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-workflow-name" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="wf-desc">Description</Label>
            <Input id="wf-desc" placeholder="Describe the workflow purpose..." value={description} onChange={(e) => setDescription(e.target.value)} data-testid="input-workflow-desc" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="wf-steps">Steps (one per line)</Label>
            <Textarea
              id="wf-steps"
              placeholder={"Fetch raw data\nClean and normalize\nAnalyze patterns\nGenerate report"}
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              className="resize-none min-h-[120px] font-mono text-xs"
              data-testid="input-workflow-steps"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!name || !stepsText.trim() || createMutation.isPending} data-testid="button-submit-workflow">
            {createMutation.isPending ? "Creating..." : "Create Workflow"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const { toast } = useToast();
  const completedSteps = workflow.steps.filter((s) => s.status === "completed").length;

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/workflows/${workflow.id}/run`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow started" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to run workflow", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/workflows/${workflow.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Workflow deleted" });
    },
  });

  return (
    <Card data-testid={`card-workflow-${workflow.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-emerald-500/10 shrink-0">
              <GitBranch className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium truncate">{workflow.name}</span>
              <span className="text-[11px] text-muted-foreground">{completedSteps}/{workflow.steps.length} steps</span>
            </div>
          </div>
          <StatusBadge status={workflow.status} />
        </div>

        {workflow.description && (
          <p className="text-[11px] text-muted-foreground mt-3">{workflow.description}</p>
        )}

        <div className="mt-3 flex flex-col gap-1">
          {workflow.steps.map((step, i) => {
            const Icon = stepStatusIcons[step.status] || Clock;
            return (
              <div key={step.id} className="flex items-center gap-2 p-1.5 rounded text-xs" data-testid={`step-${step.id}`}>
                <Icon className={`w-3.5 h-3.5 shrink-0 ${step.status === "completed" ? "text-emerald-500" : step.status === "running" ? "text-primary" : step.status === "failed" ? "text-red-500" : "text-muted-foreground"}`} />
                <span className={`truncate ${step.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{step.name}</span>
                {i < workflow.steps.length - 1 && step.status !== "pending" && (
                  <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/40 ml-auto shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-1 mt-3 flex-wrap">
          {workflow.status === "pending" && (
            <Button size="sm" variant="outline" onClick={() => runMutation.mutate()} disabled={runMutation.isPending} data-testid={`button-run-workflow-${workflow.id}`}>
              <Play className="w-3 h-3 mr-1" /> Run
            </Button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} data-testid={`button-delete-workflow-${workflow.id}`}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Workflows() {
  const { data: workflows, isLoading } = useQuery<Workflow[]>({ queryKey: ["/api/workflows"] });

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-workflows-title">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Multi-step orchestration pipelines</p>
        </div>
        <CreateWorkflowDialog />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : !workflows || workflows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <GitBranch className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-sm font-medium mb-1">No workflows yet</h3>
            <p className="text-[11px] text-muted-foreground text-center max-w-xs">
              Workflows define multi-step pipelines that agents execute sequentially. Create one to orchestrate complex tasks.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {workflows.map((wf) => (
            <WorkflowCard key={wf.id} workflow={wf} />
          ))}
        </div>
      )}
    </div>
  );
}
