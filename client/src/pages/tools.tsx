import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench, Code, Globe, Database, FileText, Search } from "lucide-react";

const tools = [
  {
    name: "Code Executor",
    description: "Execute code blocks within swarm workflow steps",
    icon: Code,
    status: "available",
  },
  {
    name: "Web Search",
    description: "Search the web for information during agent tasks",
    icon: Search,
    status: "coming soon",
  },
  {
    name: "Web Browser",
    description: "Navigate and extract content from web pages",
    icon: Globe,
    status: "coming soon",
  },
  {
    name: "Data Store",
    description: "Persistent key-value storage for agent data",
    icon: Database,
    status: "coming soon",
  },
  {
    name: "File Manager",
    description: "Read, write, and manage files on the system",
    icon: FileText,
    status: "coming soon",
  },
];

export default function Tools() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-[800px]">
      <div>
        <h1 className="text-lg font-semibold" data-testid="text-tools-title">Tools</h1>
        <p className="text-xs text-muted-foreground">Capabilities available to Nami and spawn agents</p>
      </div>

      <div className="space-y-2">
        {tools.map((tool) => (
          <Card key={tool.name} data-testid={`tool-${tool.name.toLowerCase().replace(/\s/g, "-")}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
                  <tool.icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{tool.name}</span>
                    <Badge variant={tool.status === "available" ? "default" : "secondary"} className="text-[9px]">
                      {tool.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{tool.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
