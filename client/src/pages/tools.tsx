import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FileText, FolderOpen, Terminal, Eye, PenTool } from "lucide-react";

interface ToolInfo {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  parameters: any;
}

const iconMap: Record<string, any> = {
  file_read: FileText,
  file_write: PenTool,
  file_list: FolderOpen,
  shell_exec: Terminal,
  self_inspect: Eye,
};

const categoryLabels: Record<string, string> = {
  filesystem: "Filesystem",
  execution: "Execution",
  system: "System",
};

export default function Tools() {
  const { toast } = useToast();

  const { data: tools = [], isLoading } = useQuery<ToolInfo[]>({
    queryKey: ["/api/tools"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/tools/${name}/toggle`, { enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tools"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to toggle tool", description: err.message, variant: "destructive" });
    },
  });

  const grouped = tools.reduce<Record<string, ToolInfo[]>>((acc, tool) => {
    const cat = tool.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(tool);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[800px] overflow-auto h-full">
      <div>
        <h1 className="text-lg font-semibold" data-testid="text-tools-title">Tools</h1>
        <p className="text-xs text-muted-foreground">Workspace tools available to Nami during chat and heartbeat cycles</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        Object.entries(grouped).map(([category, categoryTools]) => (
          <div key={category} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {categoryLabels[category] || category}
              </span>
              <Badge variant="secondary" className="text-[9px]" data-testid={`text-tool-category-count-${category}`}>
                {categoryTools.filter((t) => t.enabled).length}/{categoryTools.length}
              </Badge>
            </div>

            {categoryTools.map((tool) => {
              const Icon = iconMap[tool.name] || FileText;
              const paramNames = Object.keys(tool.parameters?.properties || {});

              return (
                <Card key={tool.name} data-testid={`card-tool-${tool.name}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium font-mono" data-testid={`text-tool-name-${tool.name}`}>
                            {tool.name}
                          </span>
                          <Badge
                            variant={tool.enabled ? "default" : "secondary"}
                            className="text-[9px]"
                            data-testid={`text-tool-status-${tool.name}`}
                          >
                            {tool.enabled ? "enabled" : "disabled"}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5" data-testid={`text-tool-desc-${tool.name}`}>
                          {tool.description}
                        </p>
                        {paramNames.length > 0 && (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {paramNames.map((p) => (
                              <span
                                key={p}
                                className="text-[9px] font-mono bg-muted px-1.5 py-0.5 rounded"
                                data-testid={`text-tool-param-${tool.name}-${p}`}
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Switch
                        checked={tool.enabled}
                        onCheckedChange={(checked) => toggleMutation.mutate({ name: tool.name, enabled: checked })}
                        disabled={toggleMutation.isPending}
                        data-testid={`switch-tool-${tool.name}`}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
