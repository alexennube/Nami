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
import { Zap, Plus, Trash2, Pencil } from "lucide-react";
import type { Skill } from "@shared/schema";

function AddSkillDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/skills", { name, content, category });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
      setOpen(false);
      setName("");
      setContent("");
      setCategory("general");
      toast({ title: "Skill added" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-add-skill">
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Skill
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Skill</DialogTitle>
          <DialogDescription>Define a skill document for Nami to reference. Use markdown for rich formatting.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Name</Label>
            <Input
              placeholder="e.g. web-scraping, code-review, deployment"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-skill-name"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Category</Label>
            <Input
              placeholder="e.g. tools, workflows, knowledge"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              data-testid="input-skill-category"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Content (Markdown)</Label>
            <Textarea
              placeholder="# Skill Title&#10;&#10;Describe the skill, instructions, and any reference material..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="resize-none min-h-[200px] font-mono text-xs"
              data-testid="input-skill-content"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || !content.trim() || createMutation.isPending} data-testid="button-submit-skill">
            {createMutation.isPending ? "Saving..." : "Save Skill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSkillDialog({ skill }: { skill: Skill }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(skill.name);
  const [content, setContent] = useState(skill.content);
  const [category, setCategory] = useState(skill.category);
  const { toast } = useToast();

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/skills/${skill.id}`, { name, content, category });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
      setOpen(false);
      toast({ title: "Skill updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) { setName(skill.name); setContent(skill.content); setCategory(skill.category); }
    }}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" data-testid={`button-edit-skill-${skill.id}`}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Skill</DialogTitle>
          <DialogDescription>Update the skill document content.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-edit-skill-name" />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} data-testid="input-edit-skill-category" />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Content (Markdown)</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="resize-none min-h-[200px] font-mono text-xs"
              data-testid="input-edit-skill-content"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => updateMutation.mutate()} disabled={!name.trim() || !content.trim() || updateMutation.isPending} data-testid="button-submit-edit-skill">
            {updateMutation.isPending ? "Saving..." : "Update Skill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SkillsPage() {
  const { data: skills = [], isLoading } = useQuery<Skill[]>({
    queryKey: ["/api/skills"],
    refetchInterval: 5000,
  });
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/skills/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
      toast({ title: "Skill deleted" });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 p-4 pb-2 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-skills-title">Skills</h1>
          <p className="text-xs text-muted-foreground">Nami's skill documents and reference material</p>
        </div>
        <AddSkillDialog />
      </div>

      <ScrollArea className="flex-1 px-4 pb-4">
        {isLoading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Zap className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No skills defined</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Add skill documents to teach Nami new capabilities and reference material</p>
          </div>
        ) : (
          <div className="space-y-2 py-2">
            {skills.map((skill) => (
              <Card key={skill.id} data-testid={`skill-${skill.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium" data-testid={`text-skill-name-${skill.id}`}>{skill.name}</span>
                        <Badge variant="outline" className="text-[9px]">{skill.category}</Badge>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(skill.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                        {skill.content.substring(0, 200)}{skill.content.length > 200 ? "..." : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <EditSkillDialog skill={skill} />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteMutation.mutate(skill.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-skill-${skill.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
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
