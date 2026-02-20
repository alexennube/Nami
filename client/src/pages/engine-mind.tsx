import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Cpu, RefreshCw, Play, Square, Stethoscope, Archive, Loader2 } from "lucide-react";
import { useState } from "react";
import type { EngineMindStatus } from "@shared/schema";

export default function EngineMindPage() {
  const { toast } = useToast();
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);
  const [compactResult, setCompactResult] = useState<{ compacted: boolean; originalCount?: number; newCount?: number } | null>(null);

  const { data: status, isLoading } = useQuery<EngineMindStatus>({
    queryKey: ["/api/engine-mind/status"],
    refetchInterval: 5000,
  });

  const initMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/engine-mind/initialize");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine-mind/status"] });
      toast({ title: data.message });
    },
    onError: (err: any) => {
      toast({ title: "Init failed", description: err.message, variant: "destructive" });
    },
  });

  const shutdownMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/engine-mind/shutdown");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine-mind/status"] });
      toast({ title: "Engine Mind shut down" });
    },
  });

  const reinitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/engine-mind/reinitialize");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine-mind/status"] });
      toast({ title: data.message });
    },
    onError: (err: any) => {
      toast({ title: "Reinit failed", description: err.message, variant: "destructive" });
    },
  });

  const diagnosticMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/engine-mind/diagnostic");
      return res.json();
    },
    onSuccess: (data) => {
      setDiagnosticResult(data.result);
    },
    onError: (err: any) => {
      setDiagnosticResult(`Error: ${err.message}`);
    },
  });

  const compactMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/engine-mind/compact");
      return res.json();
    },
    onSuccess: (data) => {
      setCompactResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/engine-mind/status"] });
    },
    onError: (err: any) => {
      toast({ title: "Compaction failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold" data-testid="text-page-title">Soul</h1>
        </div>
        <Badge variant={status?.initialized ? "default" : "secondary"} data-testid="badge-mind-status">
          {status?.initialized ? "Active" : "Inactive"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Session Status</CardTitle>
          <CardDescription className="text-[11px]">
            Soul session for self-healing, spawn validation, and auto-compaction.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Model</span>
              <span className="font-mono truncate" data-testid="text-mind-model">{status?.model || "N/A"}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Session</span>
              <span data-testid="text-mind-session">{status?.sessionActive ? "Active" : "Inactive"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!status?.initialized ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => initMutation.mutate()}
                disabled={initMutation.isPending}
                data-testid="button-init-mind"
              >
                {initMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                Initialize
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => shutdownMutation.mutate()}
                  disabled={shutdownMutation.isPending}
                  data-testid="button-shutdown-mind"
                >
                  {shutdownMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Square className="w-3 h-3 mr-1" />}
                  Shutdown
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reinitMutation.mutate()}
                  disabled={reinitMutation.isPending}
                  data-testid="button-reinit-mind"
                >
                  {reinitMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                  Reinitialize
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "Prompts", value: status?.totalPrompts || 0 },
              { label: "Tools", value: status?.totalToolExecutions || 0 },
              { label: "Heals", value: status?.totalSelfHeals || 0 },
              { label: "Compactions", value: status?.totalCompactions || 0 },
              { label: "Errors", value: status?.errors?.length || 0 },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1 text-center">
                <span className="text-lg font-bold" data-testid={`text-stat-${s.label.toLowerCase()}`}>{s.value}</span>
                <span className="text-[10px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => diagnosticMutation.mutate()}
              disabled={diagnosticMutation.isPending || !status?.initialized}
              data-testid="button-diagnostic"
            >
              {diagnosticMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Stethoscope className="w-3 h-3 mr-1" />}
              Run Diagnostic
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => compactMutation.mutate()}
              disabled={compactMutation.isPending || !status?.initialized}
              data-testid="button-compact"
            >
              {compactMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Archive className="w-3 h-3 mr-1" />}
              Compact Chat
            </Button>
          </div>

          {diagnosticResult && (
            <div className="rounded-md border p-3 bg-muted/30">
              <span className="text-[10px] text-muted-foreground block mb-1">Diagnostic Result</span>
              <pre className="text-xs whitespace-pre-wrap font-mono" data-testid="text-diagnostic-result">{diagnosticResult}</pre>
            </div>
          )}

          {compactResult && (
            <div className="rounded-md border p-3 bg-muted/30">
              <span className="text-[10px] text-muted-foreground block mb-1">Compaction Result</span>
              <p className="text-xs" data-testid="text-compact-result">
                {compactResult.compacted
                  ? `Compacted: ${compactResult.originalCount} -> ${compactResult.newCount} messages`
                  : "No compaction needed (below threshold)"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
