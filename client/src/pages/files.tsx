import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Folder,
  FileText,
  File,
  ArrowLeft,
  Trash2,
  Copy,
  Download,
  ChevronRight,
  FolderOpen,
  Pencil,
  Save,
  X,
  Image,
  Code,
  FileJson,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface DirListing {
  path: string;
  items: FileEntry[];
}

interface FileContent {
  path: string;
  content?: string;
  binary?: boolean;
  size: number;
  extension: string;
  lastModified?: string;
}

function getFileIcon(name: string, isDirectory: boolean) {
  if (isDirectory) return <Folder className="w-4 h-4 text-primary/80" />;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["ts", "tsx", "js", "jsx", "py", "sh", "css", "html"].includes(ext))
    return <Code className="w-4 h-4 text-blue-400" />;
  if (["json", "yaml", "yml", "toml"].includes(ext))
    return <FileJson className="w-4 h-4 text-yellow-400" />;
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext))
    return <Image className="w-4 h-4 text-purple-400" />;
  if (["md", "txt", "csv", "log"].includes(ext))
    return <FileText className="w-4 h-4 text-green-400" />;
  return <File className="w-4 h-4 text-muted-foreground" />;
}

function getLanguage(ext: string): string {
  const map: Record<string, string> = {
    ".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".jsx": "jsx",
    ".json": "json", ".css": "css", ".html": "html", ".md": "markdown",
    ".py": "python", ".sh": "bash", ".yaml": "yaml", ".yml": "yaml",
    ".toml": "toml", ".sql": "sql", ".xml": "xml",
  };
  return map[ext] || "plaintext";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPage() {
  const [currentDir, setCurrentDir] = useState(".");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const { toast } = useToast();

  const { data: listing, isLoading: dirLoading } = useQuery<DirListing>({
    queryKey: [`/api/files?path=${encodeURIComponent(currentDir)}`],
  });

  const { data: fileData, isLoading: fileLoading } = useQuery<FileContent>({
    queryKey: [`/api/files/read?path=${encodeURIComponent(selectedFile!)}`],
    enabled: !!selectedFile,
  });

  const deleteMutation = useMutation({
    mutationFn: async (filePath: string) => {
      await apiRequest("DELETE", `/api/files?path=${encodeURIComponent(filePath)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/files?path=${encodeURIComponent(currentDir)}`] });
      setSelectedFile(null);
      toast({ title: "Deleted", description: "File removed successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ filePath, content }: { filePath: string; content: string }) => {
      await apiRequest("PUT", "/api/files", { path: filePath, content });
    },
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: [`/api/files/read?path=${encodeURIComponent(selectedFile!)}`] });
      toast({ title: "Saved", description: "File updated successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function navigateTo(entry: FileEntry) {
    if (entry.isDirectory) {
      setCurrentDir(entry.path);
      setSelectedFile(null);
    } else {
      setSelectedFile(entry.path);
    }
  }

  function goUp() {
    if (currentDir === ".") return;
    const parent = currentDir.includes("/") ? currentDir.substring(0, currentDir.lastIndexOf("/")) : ".";
    setCurrentDir(parent);
    setSelectedFile(null);
  }

  function copyContent() {
    if (fileData?.content) {
      navigator.clipboard.writeText(fileData.content);
      toast({ title: "Copied", description: "File content copied to clipboard." });
    }
  }

  const breadcrumbs = currentDir === "." ? ["workspace"] : ["workspace", ...currentDir.split("/")];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 sm:p-4 border-b flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-5 h-5 text-primary shrink-0" />
          <h1 className="text-lg font-semibold truncate" data-testid="text-files-title">Files</h1>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono overflow-x-auto" data-testid="text-breadcrumbs">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronRight className="w-3 h-3" />}
              <button
                className="hover:text-primary transition-colors"
                onClick={() => {
                  if (i === 0) { setCurrentDir("."); setSelectedFile(null); }
                  else {
                    const target = breadcrumbs.slice(1, i + 1).join("/");
                    setCurrentDir(target);
                    setSelectedFile(null);
                  }
                }}
                data-testid={`button-breadcrumb-${i}`}
              >
                {crumb}
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className={`${selectedFile ? "hidden sm:flex" : "flex"} w-full sm:w-72 md:w-80 border-r flex-col shrink-0`}>
          <ScrollArea className="flex-1">
            <div className="p-2">
              {currentDir !== "." && (
                <button
                  onClick={goUp}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-muted-foreground"
                  data-testid="button-go-up"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>..</span>
                </button>
              )}

              {dirLoading ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : listing?.items.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center" data-testid="text-empty-directory">Empty directory</div>
              ) : (
                listing?.items.map((entry) => (
                  <button
                    key={entry.path}
                    onClick={() => navigateTo(entry)}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-left ${selectedFile === entry.path ? "bg-accent text-accent-foreground" : ""}`}
                    data-testid={`button-file-${entry.name}`}
                  >
                    {getFileIcon(entry.name, entry.isDirectory)}
                    <span className="truncate flex-1">{entry.name}</span>
                    {entry.isDirectory && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div className={`${selectedFile ? "flex" : "hidden sm:flex"} flex-1 flex-col min-w-0`}>
          {selectedFile ? (
            <>
              <div className="flex items-center justify-between p-3 border-b flex-wrap gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="sm:hidden h-8 w-8 shrink-0"
                    onClick={() => setSelectedFile(null)}
                    data-testid="button-back-to-list"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-mono truncate" data-testid="text-file-path">{selectedFile}</span>
                </div>
                <div className="flex items-center gap-1">
                  {fileData && !fileData.binary && (
                    <>
                      <Badge variant="secondary" className="text-xs" data-testid="text-file-size">
                        {formatSize(fileData.size)}
                      </Badge>
                      <Badge variant="secondary" className="text-xs" data-testid="text-file-language">
                        {getLanguage(fileData.extension)}
                      </Badge>
                    </>
                  )}
                  {fileData?.content !== undefined && !fileData?.binary && !editing && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => { setEditContent(fileData.content || ""); setEditing(true); }}
                      data-testid="button-edit-file"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {editing && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-primary"
                        onClick={() => saveMutation.mutate({ filePath: selectedFile, content: editContent })}
                        disabled={saveMutation.isPending}
                        data-testid="button-save-file"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditing(false)}
                        data-testid="button-cancel-edit"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  {fileData?.content && !editing && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyContent} data-testid="button-copy-file">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {fileData && !editing && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = `/api/files/download?path=${encodeURIComponent(selectedFile!)}`;
                        a.download = selectedFile!.split("/").pop() || "file";
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      }}
                      data-testid="button-download-file"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Delete this file?")) deleteMutation.mutate(selectedFile);
                    }}
                    data-testid="button-delete-file"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <ScrollArea className="flex-1">
                {fileLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <Skeleton key={i} className="h-4 w-full" />
                    ))}
                  </div>
                ) : fileData?.binary ? (
                  <div className="flex flex-col items-center justify-center p-8 text-muted-foreground gap-3" data-testid="text-binary-file">
                    <File className="w-12 h-12" />
                    <p className="text-sm">Binary file ({fileData.extension})</p>
                    <p className="text-xs" data-testid="text-binary-size">{formatSize(fileData.size)}</p>
                  </div>
                ) : editing ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-full p-4 text-xs font-mono leading-relaxed bg-background resize-none border-0 outline-none focus:ring-0"
                    spellCheck={false}
                    data-testid="textarea-file-edit"
                  />
                ) : fileData?.content !== undefined ? (
                  <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words" data-testid="text-file-content">
                    {fileData.content}
                  </pre>
                ) : null}
              </ScrollArea>
            </>
          ) : (
            <div className="hidden sm:flex flex-1 items-center justify-center text-muted-foreground" data-testid="text-no-file-selected">
              <div className="text-center">
                <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a file to view its contents</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
