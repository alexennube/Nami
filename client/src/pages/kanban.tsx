import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, GripVertical, Trash2, Pencil, X, MoreHorizontal, Columns3, MessageSquare, Send, Crown, Bot, User } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { KanbanColumn, KanbanCard, KanbanBoard, KanbanComment } from "@shared/schema";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  high: "bg-red-500/20 text-red-400 border-red-500/30",
};

const AUTHOR_ICONS: Record<string, typeof User> = {
  user: User,
  agent: Bot,
  queen: Crown,
};

const AUTHOR_COLORS: Record<string, string> = {
  user: "text-emerald-400",
  agent: "text-blue-400",
  queen: "text-purple-400",
};

function CardDetailDialog({ card, open, onClose }: { card: KanbanCard | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [newComment, setNewComment] = useState("");
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const { data: comments = [], isLoading: commentsLoading } = useQuery<KanbanComment[]>({
    queryKey: ["/api/kanban/cards", card?.id, "comments"],
    queryFn: async () => {
      if (!card) return [];
      const res = await fetch(`/api/kanban/cards/${card.id}/comments`);
      return res.json();
    },
    enabled: !!card && open,
    refetchInterval: open ? 5000 : false,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/kanban/cards/${card!.id}/comments`, {
        author: "You",
        authorType: "user",
        content,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban/cards", card?.id, "comments"] });
      setNewComment("");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await apiRequest("DELETE", `/api/kanban/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban/cards", card?.id, "comments"] });
      toast({ title: "Comment deleted" });
    },
  });

  useEffect(() => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [comments.length]);

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    addCommentMutation.mutate(newComment.trim());
  };

  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            {card.title}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {card.description || "No description"}
            {card.priority && (
              <Badge variant="outline" className={`ml-2 text-[10px] px-1.5 py-0 h-4 ${PRIORITY_COLORS[card.priority] || ""}`}>
                {card.priority}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col border rounded-md bg-muted/20">
          <div className="px-3 py-2 border-b flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Discussion</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 h-4">{comments.length}</Badge>
          </div>

          <ScrollArea className="flex-1 max-h-[40vh]">
            <div className="p-3 space-y-3">
              {commentsLoading ? (
                <p className="text-xs text-muted-foreground text-center py-4">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No comments yet. Start the discussion or agents will post updates here.
                </p>
              ) : (
                comments.map((comment) => {
                  const AuthorIcon = AUTHOR_ICONS[comment.authorType] || User;
                  const authorColor = AUTHOR_COLORS[comment.authorType] || "text-muted-foreground";
                  return (
                    <div key={comment.id} className="group flex gap-2" data-testid={`comment-${comment.id}`}>
                      <div className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 mt-0.5 ${
                        comment.authorType === "queen" ? "bg-purple-500/20" :
                        comment.authorType === "agent" ? "bg-blue-500/20" :
                        "bg-emerald-500/20"
                      }`}>
                        <AuthorIcon className={`w-3 h-3 ${authorColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-medium ${authorColor}`}>{comment.author}</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{comment.authorType}</Badge>
                          <span className="text-[9px] text-muted-foreground">
                            {new Date(comment.createdAt).toLocaleString()}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0"
                            onClick={() => deleteCommentMutation.mutate(comment.id)}
                            data-testid={`comment-delete-${comment.id}`}
                          >
                            <Trash2 className="w-2.5 h-2.5 text-muted-foreground hover:text-red-400" />
                          </Button>
                        </div>
                        <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={commentsEndRef} />
            </div>
          </ScrollArea>

          <div className="p-2 border-t flex items-end gap-2">
            <textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              className="flex-1 min-h-[36px] max-h-[100px] px-2.5 py-1.5 text-xs bg-background border border-border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="comment-input"
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleSubmit}
              disabled={!newComment.trim() || addCommentMutation.isPending}
              data-testid="comment-send-btn"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CardItem({ card, onEdit, onDelete, onOpenDetail }: { card: KanbanCard; onEdit: (card: KanbanCard) => void; onDelete: (id: string) => void; onOpenDetail: (card: KanbanCard) => void }) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("cardId", card.id);
        e.dataTransfer.setData("sourceColumnId", card.columnId);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={() => onOpenDetail(card)}
      className={`bg-background border border-border rounded-md p-3 cursor-grab active:cursor-grabbing transition-opacity ${dragging ? "opacity-40" : "opacity-100"}`}
      data-testid={`card-${card.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate" data-testid={`card-title-${card.id}`}>{card.title}</p>
          {card.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{card.description}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => e.stopPropagation()} data-testid={`card-menu-${card.id}`}>
              <MoreHorizontal className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(card); }} data-testid={`card-edit-${card.id}`}>
              <Pencil className="w-3 h-3 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenDetail(card); }} data-testid={`card-comments-${card.id}`}>
              <MessageSquare className="w-3 h-3 mr-2" /> Comments
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-400" onClick={(e) => { e.stopPropagation(); onDelete(card.id); }} data-testid={`card-delete-${card.id}`}>
              <Trash2 className="w-3 h-3 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {card.priority && (
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${PRIORITY_COLORS[card.priority] || ""}`} data-testid={`card-priority-${card.id}`}>
            {card.priority}
          </Badge>
        )}
        {card.labels?.map((label) => (
          <Badge key={label} variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20">
            {label}
          </Badge>
        ))}
        <div className="ml-auto flex items-center gap-0.5 text-muted-foreground">
          <MessageSquare className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}

function ColumnComponent({
  column,
  cards,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onMoveCard,
  onEditColumn,
  onDeleteColumn,
  onOpenDetail,
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
  onAddCard: (columnId: string) => void;
  onEditCard: (card: KanbanCard) => void;
  onDeleteCard: (id: string) => void;
  onMoveCard: (cardId: string, targetColumnId: string, order: number) => void;
  onEditColumn: (column: KanbanColumn) => void;
  onDeleteColumn: (id: string) => void;
  onOpenDetail: (card: KanbanCard) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`flex flex-col bg-card/50 border rounded-lg min-w-[280px] max-w-[320px] w-[300px] shrink-0 transition-colors ${dragOver ? "border-primary/50 bg-primary/5" : "border-border"}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const cardId = e.dataTransfer.getData("cardId");
        if (cardId) onMoveCard(cardId, column.id, cards.length);
      }}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground" data-testid={`column-title-${column.id}`}>{column.title}</h3>
          <Badge variant="secondary" className="text-[10px] px-1.5 h-4">{cards.length}</Badge>
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onAddCard(column.id)} data-testid={`column-add-${column.id}`}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`column-menu-${column.id}`}>
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditColumn(column)}>
                <Pencil className="w-3 h-3 mr-2" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-400" onClick={() => onDeleteColumn(column.id)}>
                <Trash2 className="w-3 h-3 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ScrollArea className="flex-1 max-h-[calc(100vh-220px)]">
        <div className="p-2 space-y-2">
          {cards.sort((a, b) => a.order - b.order).map((card) => (
            <CardItem key={card.id} card={card} onEdit={onEditCard} onDelete={onDeleteCard} onOpenDetail={onOpenDetail} />
          ))}
          {cards.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground">
              Drop cards here or click + to add
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function KanbanPage() {
  const { toast } = useToast();
  const [cardDialog, setCardDialog] = useState<{ open: boolean; card?: KanbanCard; columnId?: string }>({ open: false });
  const [columnDialog, setColumnDialog] = useState<{ open: boolean; column?: KanbanColumn }>({ open: false });
  const [cardTitle, setCardTitle] = useState("");
  const [cardDesc, setCardDesc] = useState("");
  const [cardPriority, setCardPriority] = useState<string>("medium");
  const [cardLabels, setCardLabels] = useState("");
  const [columnTitle, setColumnTitle] = useState("");
  const [detailCard, setDetailCard] = useState<KanbanCard | null>(null);

  const { data: board, isLoading } = useQuery<KanbanBoard>({
    queryKey: ["/api/kanban"],
  });

  const createCardMutation = useMutation({
    mutationFn: async (data: { columnId: string; title: string; description?: string; priority?: string; labels?: string[] }) => {
      const res = await apiRequest("POST", "/api/kanban/cards", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban"] });
      setCardDialog({ open: false });
      toast({ title: "Card created" });
    },
  });

  const updateCardMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; title?: string; description?: string; priority?: string; labels?: string[] }) => {
      const res = await apiRequest("PATCH", `/api/kanban/cards/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban"] });
      setCardDialog({ open: false });
      toast({ title: "Card updated" });
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/kanban/cards/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban"] });
      toast({ title: "Card deleted" });
    },
  });

  const moveCardMutation = useMutation({
    mutationFn: async ({ cardId, columnId, order }: { cardId: string; columnId: string; order: number }) => {
      await apiRequest("PUT", `/api/kanban/cards/${cardId}/move`, { columnId, order });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban"] });
    },
  });

  const createColumnMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", "/api/kanban/columns", { title });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban"] });
      setColumnDialog({ open: false });
      toast({ title: "Column created" });
    },
  });

  const updateColumnMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await apiRequest("PATCH", `/api/kanban/columns/${id}`, { title });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban"] });
      setColumnDialog({ open: false });
      toast({ title: "Column renamed" });
    },
  });

  const deleteColumnMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/kanban/columns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban"] });
      toast({ title: "Column deleted" });
    },
  });

  const openAddCard = (columnId: string) => {
    setCardTitle("");
    setCardDesc("");
    setCardPriority("medium");
    setCardLabels("");
    setCardDialog({ open: true, columnId });
  };

  const openEditCard = (card: KanbanCard) => {
    setCardTitle(card.title);
    setCardDesc(card.description || "");
    setCardPriority(card.priority || "medium");
    setCardLabels((card.labels || []).join(", "));
    setCardDialog({ open: true, card });
  };

  const handleSaveCard = () => {
    if (!cardTitle.trim()) return;
    const labels = cardLabels.split(",").map(l => l.trim()).filter(Boolean);
    if (cardDialog.card) {
      updateCardMutation.mutate({ id: cardDialog.card.id, title: cardTitle, description: cardDesc, priority: cardPriority, labels });
    } else if (cardDialog.columnId) {
      createCardMutation.mutate({ columnId: cardDialog.columnId, title: cardTitle, description: cardDesc, priority: cardPriority, labels });
    }
  };

  const openEditColumn = (column: KanbanColumn) => {
    setColumnTitle(column.title);
    setColumnDialog({ open: true, column });
  };

  const openAddColumn = () => {
    setColumnTitle("");
    setColumnDialog({ open: true });
  };

  const handleSaveColumn = () => {
    if (!columnTitle.trim()) return;
    if (columnDialog.column) {
      updateColumnMutation.mutate({ id: columnDialog.column.id, title: columnTitle });
    } else {
      createColumnMutation.mutate(columnTitle);
    }
  };

  const columns = board?.columns || [];
  const cards = board?.cards || [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Columns3 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground" data-testid="kanban-heading">Kanban Board</h1>
          <Badge variant="outline" className="text-xs">{cards.length} cards</Badge>
        </div>
        <Button size="sm" onClick={openAddColumn} data-testid="add-column-btn">
          <Plus className="w-4 h-4 mr-1" /> Add Column
        </Button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Loading board...</p>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 p-4 min-h-full">
            {columns.sort((a, b) => a.order - b.order).map((column) => (
              <ColumnComponent
                key={column.id}
                column={column}
                cards={cards.filter(c => c.columnId === column.id)}
                onAddCard={openAddCard}
                onEditCard={openEditCard}
                onDeleteCard={(id) => deleteCardMutation.mutate(id)}
                onMoveCard={(cardId, targetColumnId, order) => moveCardMutation.mutate({ cardId, columnId: targetColumnId, order })}
                onEditColumn={openEditColumn}
                onDeleteColumn={(id) => deleteColumnMutation.mutate(id)}
                onOpenDetail={(card) => setDetailCard(card)}
              />
            ))}
            {columns.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
                <Columns3 className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">No columns yet. Add your first column to get started.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={cardDialog.open} onOpenChange={(open) => setCardDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cardDialog.card ? "Edit Card" : "New Card"}</DialogTitle>
            <DialogDescription>
              {cardDialog.card ? "Update the card details." : "Add a new card to this column."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Card title"
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveCard()}
              data-testid="card-title-input"
            />
            <textarea
              placeholder="Description (optional)"
              value={cardDesc}
              onChange={(e) => setCardDesc(e.target.value)}
              className="w-full min-h-[80px] px-3 py-2 text-sm bg-background border border-border rounded-md resize-y focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="card-desc-input"
            />
            <Select value={cardPriority} onValueChange={setCardPriority}>
              <SelectTrigger data-testid="card-priority-select">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Labels (comma-separated)"
              value={cardLabels}
              onChange={(e) => setCardLabels(e.target.value)}
              data-testid="card-labels-input"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCardDialog({ open: false })}>Cancel</Button>
            <Button onClick={handleSaveCard} disabled={createCardMutation.isPending || updateCardMutation.isPending} data-testid="card-save-btn">
              {cardDialog.card ? "Save" : "Add Card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={columnDialog.open} onOpenChange={(open) => setColumnDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{columnDialog.column ? "Rename Column" : "New Column"}</DialogTitle>
            <DialogDescription>
              {columnDialog.column ? "Enter a new name for this column." : "Add a new column to the board."}
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Column title"
            value={columnTitle}
            onChange={(e) => setColumnTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveColumn()}
            data-testid="column-title-input"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setColumnDialog({ open: false })}>Cancel</Button>
            <Button onClick={handleSaveColumn} disabled={createColumnMutation.isPending || updateColumnMutation.isPending} data-testid="column-save-btn">
              {columnDialog.column ? "Rename" : "Add Column"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CardDetailDialog
        card={detailCard}
        open={!!detailCard}
        onClose={() => setDetailCard(null)}
      />
    </div>
  );
}
