import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Mail, Phone, Building2, Globe, MessageSquare, Activity,
  Send, Trash2, Crown, Bot, User, Linkedin, Twitter, Tag, MapPin,
  Clock, FileText, Search as SearchIcon, Eye, Zap, Users
} from "lucide-react";
import type { CrmContact, CrmContactComment, CrmActivity, CrmAccount } from "@shared/schema";

const STAGE_COLORS: Record<string, string> = {
  lead: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  prospect: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  qualified: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  customer: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  churned: "bg-red-500/20 text-red-400 border-red-500/30",
};

const ACTIVITY_ICONS: Record<string, typeof Mail> = {
  email_sent: Mail,
  email_received: Mail,
  profile_visit: Eye,
  note: FileText,
  call: Phone,
  meeting: Users,
  research: SearchIcon,
  sequence_step: Zap,
  engagement: MessageSquare,
  other: Activity,
};

const ACTIVITY_COLORS: Record<string, string> = {
  email_sent: "text-blue-400 bg-blue-500/10",
  email_received: "text-green-400 bg-green-500/10",
  profile_visit: "text-purple-400 bg-purple-500/10",
  note: "text-yellow-400 bg-yellow-500/10",
  call: "text-emerald-400 bg-emerald-500/10",
  meeting: "text-pink-400 bg-pink-500/10",
  research: "text-orange-400 bg-orange-500/10",
  sequence_step: "text-indigo-400 bg-indigo-500/10",
  engagement: "text-cyan-400 bg-cyan-500/10",
  other: "text-muted-foreground bg-muted/30",
};

const AUTHOR_ICONS: Record<string, typeof User> = { user: User, agent: Bot, queen: Crown };
const AUTHOR_COLORS: Record<string, string> = { user: "text-emerald-400", agent: "text-blue-400", queen: "text-purple-400" };

export default function ContactDetail() {
  const params = useParams<{ id: string }>();
  const contactId = params.id;
  const { toast } = useToast();
  const [newComment, setNewComment] = useState("");
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const { data: contact, isLoading } = useQuery<CrmContact>({
    queryKey: ["/api/crm/contacts", contactId],
    queryFn: async () => { const res = await fetch(`/api/crm/contacts/${contactId}`); return res.json(); },
  });

  const { data: accounts = [] } = useQuery<CrmAccount[]>({ queryKey: ["/api/crm/accounts"] });

  const { data: comments = [], isLoading: commentsLoading } = useQuery<CrmContactComment[]>({
    queryKey: ["/api/crm/contacts", contactId, "comments"],
    queryFn: async () => { const res = await fetch(`/api/crm/contacts/${contactId}/comments`); return res.json(); },
    refetchInterval: 5000,
  });

  const { data: activities = [], isLoading: activitiesLoading } = useQuery<CrmActivity[]>({
    queryKey: ["/api/crm/contacts", contactId, "activities"],
    queryFn: async () => { const res = await fetch(`/api/crm/contacts/${contactId}/activities`); return res.json(); },
    refetchInterval: 5000,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/crm/contacts/${contactId}/comments`, { author: "You", authorType: "user", content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts", contactId, "comments"] });
      setNewComment("");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => { await apiRequest("DELETE", `/api/crm/comments/${commentId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts", contactId, "comments"] });
      toast({ title: "Comment deleted" });
    },
  });

  useEffect(() => {
    if (commentsEndRef.current) commentsEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full p-6 gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <Users className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-sm font-medium mb-2">Contact not found</h3>
        <Link href="/crm">
          <Button variant="outline" size="sm" data-testid="button-back-crm">
            <ArrowLeft className="w-3 h-3 mr-1" /> Back to CRM
          </Button>
        </Link>
      </div>
    );
  }

  const account = accounts.find(a => a.id === contact.accountId);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-3 md:p-4 border-b shrink-0">
        <Link href="/crm">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-semibold text-sm shrink-0">
          {contact.firstName[0]}{contact.lastName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm" data-testid="text-contact-name">{contact.firstName} {contact.lastName}</span>
            {contact.stage && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${STAGE_COLORS[contact.stage] || ""}`}>
                {contact.stage}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {contact.title && <span>{contact.title}</span>}
            {contact.company && <span className="flex items-center gap-0.5"><Building2 className="w-2.5 h-2.5" />{contact.company}</span>}
            {account && (
              <Link href={`/crm/accounts/${account.id}`}>
                <span className="text-primary hover:underline cursor-pointer flex items-center gap-0.5" data-testid="contact-account-link">
                  <Building2 className="w-2.5 h-2.5" />{account.name}
                </span>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-64 border-r shrink-0 hidden md:flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Contact Info</span>
                <div className="mt-2 space-y-2">
                  {contact.email && (
                    <div className="flex items-center gap-2 text-xs">
                      <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
                      <a href={`mailto:${contact.email}`} className="text-primary hover:underline truncate" data-testid="text-email">{contact.email}</a>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-2 text-xs">
                      <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span data-testid="text-phone">{contact.phone}</span>
                    </div>
                  )}
                  {contact.linkedIn && (
                    <div className="flex items-center gap-2 text-xs">
                      <Linkedin className="w-3 h-3 text-muted-foreground shrink-0" />
                      <a href={contact.linkedIn} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate" data-testid="text-linkedin">LinkedIn</a>
                    </div>
                  )}
                  {contact.twitter && (
                    <div className="flex items-center gap-2 text-xs">
                      <Twitter className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span data-testid="text-twitter">{contact.twitter}</span>
                    </div>
                  )}
                  {contact.website && (
                    <div className="flex items-center gap-2 text-xs">
                      <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                      <a href={contact.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{contact.website}</a>
                    </div>
                  )}
                </div>
              </div>

              {contact.tags && contact.tags.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tags</span>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {contact.tags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20">
                        <Tag className="w-2 h-2 mr-0.5" />{tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {contact.notes && (
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Notes</span>
                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap" data-testid="text-notes">{contact.notes}</p>
                </div>
              )}

              {contact.sequenceId && (
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Sequence</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-indigo-400" />
                    <span className="text-xs">Step {(contact.sequenceStep || 0) + 1}</span>
                    <Link href="/crm/sequences">
                      <Button variant="link" size="sm" className="h-auto p-0 text-[10px]">View</Button>
                    </Link>
                  </div>
                </div>
              )}

              <div>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Stats</span>
                <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Activities</span><span>{activities.length}</span></div>
                  <div className="flex justify-between"><span>Comments</span><span>{comments.length}</span></div>
                  <div className="flex justify-between"><span>Created</span><span>{new Date(contact.createdAt).toLocaleDateString()}</span></div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <Tabs defaultValue="activity" className="flex-1 flex flex-col min-h-0">
            <div className="px-3 pt-2 shrink-0">
              <TabsList className="h-8">
                <TabsTrigger value="activity" className="text-xs h-7" data-testid="tab-activity">
                  <Activity className="w-3.5 h-3.5 mr-1" /> Activity ({activities.length})
                </TabsTrigger>
                <TabsTrigger value="comments" className="text-xs h-7" data-testid="tab-comments">
                  <MessageSquare className="w-3.5 h-3.5 mr-1" /> Comments ({comments.length})
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="activity" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-2">
                  {activitiesLoading ? (
                    <p className="text-xs text-muted-foreground text-center py-8">Loading activities...</p>
                  ) : activities.length === 0 ? (
                    <div className="text-center py-12">
                      <Activity className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No activity yet. Agents will post updates here as they interact with this contact.</p>
                    </div>
                  ) : (
                    activities.map(act => {
                      const Icon = ACTIVITY_ICONS[act.type] || Activity;
                      const colorClass = ACTIVITY_COLORS[act.type] || ACTIVITY_COLORS.other;
                      const [iconColor, bgColor] = colorClass.split(" ");
                      return (
                        <div key={act.id} className="flex gap-3 p-2.5 rounded-lg border border-border" data-testid={`activity-${act.id}`}>
                          <div className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${bgColor}`}>
                            <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium truncate">{act.title}</span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{act.type.replace("_", " ")}</Badge>
                            </div>
                            {act.description && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{act.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground">
                              {act.agentName && <span className="flex items-center gap-0.5"><Bot className="w-2.5 h-2.5" />{act.agentName}</span>}
                              <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{new Date(act.createdAt).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="comments" className="flex-1 min-h-0 mt-0 flex flex-col">
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-3">
                  {commentsLoading ? (
                    <p className="text-xs text-muted-foreground text-center py-8">Loading comments...</p>
                  ) : comments.length === 0 ? (
                    <div className="text-center py-12">
                      <MessageSquare className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No comments yet. Start the discussion or agents will post intelligence here.</p>
                    </div>
                  ) : (
                    comments.map(comment => {
                      const AuthorIcon = AUTHOR_ICONS[comment.authorType] || User;
                      const authorColor = AUTHOR_COLORS[comment.authorType] || "text-muted-foreground";
                      return (
                        <div key={comment.id} className="group flex gap-2" data-testid={`comment-${comment.id}`}>
                          <div className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 mt-0.5 ${
                            comment.authorType === "queen" ? "bg-purple-500/20" :
                            comment.authorType === "agent" ? "bg-blue-500/20" : "bg-emerald-500/20"
                          }`}>
                            <AuthorIcon className={`w-3 h-3 ${authorColor}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[11px] font-medium ${authorColor}`}>{comment.author}</span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{comment.authorType}</Badge>
                              <span className="text-[9px] text-muted-foreground">{new Date(comment.createdAt).toLocaleString()}</span>
                              <Button
                                variant="ghost" size="icon"
                                className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0"
                                onClick={() => deleteCommentMutation.mutate(comment.id)}
                                data-testid={`comment-delete-${comment.id}`}
                              >
                                <Trash2 className="w-2.5 h-2.5 text-muted-foreground hover:text-red-400" />
                              </Button>
                            </div>
                            <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{comment.content}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={commentsEndRef} />
                </div>
              </ScrollArea>
              <div className="p-2 border-t flex items-end gap-2 shrink-0">
                <textarea
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (newComment.trim()) addCommentMutation.mutate(newComment.trim()); } }}
                  className="flex-1 min-h-[36px] max-h-[100px] px-2.5 py-1.5 text-xs bg-background border border-border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="comment-input"
                />
                <Button
                  size="icon" className="h-8 w-8 shrink-0"
                  onClick={() => { if (newComment.trim()) addCommentMutation.mutate(newComment.trim()); }}
                  disabled={!newComment.trim() || addCommentMutation.isPending}
                  data-testid="comment-send-btn"
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
