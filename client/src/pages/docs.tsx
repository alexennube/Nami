import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Plus, Pencil, Trash2, ArrowLeft, Clock, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { DocPage } from "@shared/schema";

export default function DocsPage() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const { data: docs, isLoading } = useQuery<DocPage[]>({
    queryKey: ["/api/docs"],
  });

  const { data: selectedDoc } = useQuery<DocPage>({
    queryKey: ["/api/docs", selectedSlug],
    enabled: !!selectedSlug,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { slug: string; title: string; content: string }) => {
      await apiRequest("POST", "/api/docs", { ...data, lastEditedBy: "user" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/docs"] });
      setCreateOpen(false);
      setNewSlug("");
      setNewTitle("");
      setNewContent("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { slug: string; title: string; content: string }) => {
      await apiRequest("PUT", `/api/docs/${data.slug}`, { ...data, lastEditedBy: "user" });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/docs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/docs", variables.slug] });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      await apiRequest("DELETE", `/api/docs/${slug}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/docs"] });
      setSelectedSlug(null);
    },
  });

  function startEdit() {
    if (!selectedDoc) return;
    setEditTitle(selectedDoc.title);
    setEditContent(selectedDoc.content);
    setEditing(true);
  }

  function saveEdit() {
    if (!selectedSlug) return;
    updateMutation.mutate({ slug: selectedSlug, title: editTitle, content: editContent });
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (selectedSlug && selectedDoc) {
    return (
      <div className="p-3 md:p-6 max-w-4xl mx-auto" data-testid="page-doc-detail">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedSlug(null); setEditing(false); }} data-testid="button-back-docs">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex-1" />
          {!editing && (
            <>
              <Button variant="outline" size="sm" onClick={startEdit} data-testid="button-edit-doc">
                <Pencil className="w-3 h-3 mr-1" />
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate(selectedSlug)} disabled={deleteMutation.isPending} data-testid="button-delete-doc">
                <Trash2 className="w-3 h-3 mr-1" />
                Delete
              </Button>
            </>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Page title" data-testid="input-edit-title" />
            <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} placeholder="Markdown content..." className="min-h-[400px] font-mono text-sm" data-testid="input-edit-content" />
            <div className="flex gap-2">
              <Button onClick={saveEdit} disabled={updateMutation.isPending} data-testid="button-save-doc">
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)} data-testid="button-cancel-edit">Cancel</Button>
            </div>
          </div>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg" data-testid="text-doc-title">{selectedDoc.title}</CardTitle>
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                {selectedDoc.createdBy && <span>Created by: {selectedDoc.createdBy}</span>}
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Created: {new Date(selectedDoc.createdAt).toLocaleDateString()}</span>
                <span className="flex items-center gap-1"><User className="w-3 h-3" /> Modified by: {selectedDoc.lastModifiedBy || selectedDoc.lastEditedBy}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Modified: {new Date(selectedDoc.updatedAt).toLocaleString()}</span>
                <Badge variant="secondary" className="text-[10px]">{selectedDoc.slug}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="content-doc-body">
                <ReactMarkdown>{selectedDoc.content}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4 md:space-y-6" data-testid="page-docs">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/20 border border-primary/30">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-base md:text-lg font-bold tracking-tight" data-testid="text-docs-title">Documentation</h1>
          <Badge variant="secondary" className="text-[10px]">{docs?.length || 0} pages</Badge>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-new-doc">
              <Plus className="w-3 h-3 mr-1" />
              New Page
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[calc(100vw-2rem)] md:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Documentation Page</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Input value={newSlug} onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="page-slug" data-testid="input-new-slug" />
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Page Title" data-testid="input-new-title" />
              </div>
              <Textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="Write your documentation in markdown..." className="min-h-[300px] font-mono text-sm" data-testid="input-new-content" />
              <Button onClick={() => createMutation.mutate({ slug: newSlug, title: newTitle, content: newContent })} disabled={!newSlug || !newTitle || createMutation.isPending} data-testid="button-create-doc">
                {createMutation.isPending ? "Creating..." : "Create Page"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!docs || docs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-docs">No documentation pages yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Create one manually or let agents write docs using the docs_write tool.</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="max-h-[calc(100vh-200px)]">
          <div className="space-y-2">
            {docs.map((doc) => (
              <Card key={doc.slug} className="cursor-pointer transition-colors" onClick={() => setSelectedSlug(doc.slug)} data-testid={`card-doc-${doc.slug}`}>
                <CardContent className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
                  <FileText className="w-5 h-5 text-muted-foreground shrink-0 hidden md:block" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <div className="flex items-center gap-2 md:gap-3 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">{doc.slug}</Badge>
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{doc.lastEditedBy}</span>
                      <span className="flex items-center gap-1 hidden md:flex"><Clock className="w-3 h-3" />{new Date(doc.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-[40%] truncate hidden md:block">{doc.content.substring(0, 100)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
