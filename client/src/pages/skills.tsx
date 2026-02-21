import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Zap, Save } from "lucide-react";

interface SkillsFile {
  content: string;
  updatedAt: string | null;
}

export default function SkillsPage() {
  const { toast } = useToast();
  const [editContent, setEditContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading } = useQuery<SkillsFile>({
    queryKey: ["/api/skills/file"],
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (data && !hasChanges) {
      setEditContent(data.content);
    }
  }, [data, hasChanges]);

  const saveMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("PUT", "/api/skills/file", { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skills/file"] });
      setHasChanges(false);
      toast({ title: "Skills.md saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const handleChange = (value: string) => {
    setEditContent(value);
    setHasChanges(true);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 p-4 pb-2 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2" data-testid="text-skills-title">
            <Zap className="w-4 h-4" />
            Skills.md
          </h1>
          <p className="text-xs text-muted-foreground">
            {data?.updatedAt
              ? `Last saved ${new Date(data.updatedAt).toLocaleString()}`
              : "No file yet — start writing to create Skills.md"}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate(editContent)}
          disabled={!hasChanges || saveMutation.isPending}
          data-testid="button-save-skills"
        >
          <Save className="w-3.5 h-3.5 mr-1" />
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="flex-1 px-4 pb-4 min-h-0">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <Card className="h-full">
            <CardContent className="p-0 h-full">
              <Textarea
                value={editContent}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="# Skills&#10;&#10;Write Nami's skill documents, instructions, and reference material here in Markdown format..."
                className="resize-none h-full w-full border-0 rounded-lg font-mono text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
                data-testid="textarea-skills-content"
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
