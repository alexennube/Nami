import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Heart, Save, Activity } from "lucide-react";
import type { HeartbeatConfig } from "@shared/schema";

export default function Heartbeat() {
  const { data: config, isLoading } = useQuery<HeartbeatConfig>({
    queryKey: ["/api/heartbeat"],
  });
  const { toast } = useToast();

  const [enabled, setEnabled] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [instruction, setInstruction] = useState("");
  const [maxBeats, setMaxBeats] = useState(0);

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setIntervalSeconds(config.intervalSeconds);
      setInstruction(config.instruction);
      setMaxBeats(config.maxBeats);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/heartbeat", {
        enabled,
        intervalSeconds,
        instruction,
        maxBeats,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/heartbeat"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engine/status"] });
      toast({ title: "Heartbeat configuration saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6 p-3 md:p-6 max-w-[700px]">
        <Skeleton className="h-8 w-48" />
        <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-3 md:p-6 max-w-[700px]">
      <div>
        <h1 className="text-base md:text-lg font-semibold" data-testid="text-heartbeat-title">Heartbeat</h1>
        <p className="text-xs text-muted-foreground">Configure Nami's autonomous heartbeat loop</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm">Heartbeat Configuration</CardTitle>
          </div>
          <CardDescription className="text-[11px]">
            The heartbeat periodically pings Nami with instructions. When enabled and the engine is running, Nami will autonomously check on agents and swarms at the specified interval.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-xs">Enable Heartbeat</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">Toggle the autonomous heartbeat loop</p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid="switch-heartbeat-enabled"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Interval (seconds)</Label>
            <Input
              type="number"
              min={5}
              max={3600}
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(Number(e.target.value))}
              data-testid="input-heartbeat-interval"
            />
            <span className="text-[10px] text-muted-foreground">How often to ping Nami (minimum 5 seconds)</span>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Max Beats (0 = unlimited)</Label>
            <Input
              type="number"
              min={0}
              value={maxBeats}
              onChange={(e) => setMaxBeats(Number(e.target.value))}
              data-testid="input-heartbeat-max"
            />
            <span className="text-[10px] text-muted-foreground">Limit the number of heartbeat cycles (0 for unlimited)</span>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Heartbeat Instruction</Label>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              className="resize-none min-h-[120px] font-mono text-xs"
              placeholder="Instructions sent to Nami on each heartbeat..."
              data-testid="input-heartbeat-instruction"
            />
            <span className="text-[10px] text-muted-foreground">This message is sent to Nami on each heartbeat cycle</span>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Activity className="w-3.5 h-3.5" />
              <span>Total beats: {config?.totalBeats || 0}</span>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-heartbeat">
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
