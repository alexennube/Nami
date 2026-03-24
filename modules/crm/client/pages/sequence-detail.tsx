import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Mail, Phone, Linkedin, Share2, FileSearch, Clock, CheckSquare,
  Zap, Play, Pause, Users, UserPlus, UserMinus, ChevronRight, Brain,
  Check, Building2, SkipForward
} from "lucide-react";
import type { CrmSequence, CrmContact, CrmAccount, ContactIntelligence } from "@shared/schema";

const STEP_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  phone_call: Phone,
  linkedin: Linkedin,
  social_media: Share2,
  research: FileSearch,
  wait: Clock,
  task: CheckSquare,
};

const STEP_COLORS: Record<string, string> = {
  email: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  phone_call: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  linkedin: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  social_media: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  research: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  wait: "text-gray-400 bg-gray-500/10 border-gray-500/20",
  task: "text-purple-400 bg-purple-500/10 border-purple-500/20",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  paused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  completed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const CONTACT_STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  paused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  completed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

function EnrollDialog({ open, onClose, sequenceId, enrolledIds, allContacts }: {
  open: boolean; onClose: () => void; sequenceId: string; enrolledIds: string[]; allContacts: CrmContact[];
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const available = allContacts.filter(c => !enrolledIds.includes(c.id));
  const filtered = available.filter(c => {
    if (!search) return true;
    return `${c.firstName} ${c.lastName} ${c.email} ${c.company}`.toLowerCase().includes(search.toLowerCase());
  });

  const enrollMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/sequences/${sequenceId}/enroll`, { contactIds: Array.from(selected) });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/sequences", sequenceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts"] });
      onClose();
      toast({ title: `${data.enrolled} contact(s) enrolled` });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enroll Contacts</DialogTitle>
          <DialogDescription>Select contacts to add to this sequence.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs" data-testid="enroll-search" />
        <ScrollArea className="h-[300px]">
          <div className="space-y-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No available contacts</p>
            ) : (
              filtered.map(c => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-accent/30 cursor-pointer text-xs"
                  data-testid={`enroll-contact-${c.id}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(c.id);
                      else next.delete(c.id);
                      setSelected(next);
                    }}
                    className="rounded"
                  />
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-medium text-[10px] shrink-0">
                    {c.firstName[0]}{c.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{c.firstName} {c.lastName}</span>
                    {c.email && <span className="text-muted-foreground ml-2">{c.email}</span>}
                  </div>
                </label>
              ))
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="enroll-cancel-btn">Cancel</Button>
          <Button onClick={() => enrollMutation.mutate()} disabled={selected.size === 0 || enrollMutation.isPending} data-testid="enroll-confirm-btn">
            Enroll {selected.size} Contact{selected.size !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IntelligenceSummary({ intelligence }: { intelligence: ContactIntelligence }) {
  return (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-1 flex-wrap">
        {intelligence.recommendedChannels.slice(0, 3).map(ch => (
          <Badge key={ch} variant="outline" className="text-[9px] px-1 py-0 h-3.5">{ch}</Badge>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground line-clamp-2">{intelligence.messagingApproach.split(":")[0]}</p>
    </div>
  );
}

export default function SequenceDetail() {
  const params = useParams<{ id: string }>();
  const sequenceId = params.id;
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [enrollOpen, setEnrollOpen] = useState(false);

  const { data: sequence, isLoading } = useQuery<CrmSequence>({
    queryKey: ["/api/crm/sequences", sequenceId],
    queryFn: async () => { const res = await fetch(`/api/crm/sequences/${sequenceId}`); return res.json(); },
  });

  const { data: allContacts = [] } = useQuery<CrmContact[]>({ queryKey: ["/api/crm/contacts"] });
  const { data: accounts = [] } = useQuery<CrmAccount[]>({ queryKey: ["/api/crm/accounts"] });

  const enrolledContacts = allContacts.filter(c => (sequence?.contactIds || []).includes(c.id));

  const statusMutation = useMutation({
    mutationFn: async ({ action, status }: { action: string; status?: string }) => {
      if (action === "activate") {
        const res = await apiRequest("POST", `/api/crm/sequences/${sequenceId}/activate`, {});
        return res.json();
      }
      const res = await apiRequest("PATCH", `/api/crm/sequences/${sequenceId}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/sequences", sequenceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts"] });
    },
  });

  const unenrollMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const res = await apiRequest("POST", `/api/crm/sequences/${sequenceId}/unenroll`, { contactIds: [contactId] });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/sequences", sequenceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts"] });
      toast({ title: "Contact removed from sequence" });
    },
  });

  const contactActionMutation = useMutation({
    mutationFn: async ({ contactId, action }: { contactId: string; action: string }) => {
      const res = await apiRequest("POST", `/api/crm/sequences/${sequenceId}/${action}`, { contactId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/sequences", sequenceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-full p-6 gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!sequence) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <Zap className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-sm font-medium mb-2">Sequence not found</h3>
        <Link href="/crm/sequences">
          <Button variant="outline" size="sm" data-testid="button-back-sequences">
            <ArrowLeft className="w-3 h-3 mr-1" /> Back to Sequences
          </Button>
        </Link>
      </div>
    );
  }

  const account = sequence.accountId ? accounts.find(a => a.id === sequence.accountId) : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-3 md:p-4 border-b shrink-0">
        <Link href="/crm/sequences">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-500 shrink-0">
          <Zap className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm" data-testid="text-sequence-name">{sequence.name}</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${STATUS_COLORS[sequence.status] || ""}`}>
              {sequence.status}
            </Badge>
            {sequence.sequenceType === "account" && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">account</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>{sequence.steps.length} step{sequence.steps.length !== 1 ? "s" : ""}</span>
            <span>{enrolledContacts.length} enrolled</span>
            {sequence.createdBy && <span>Created by: {sequence.createdBy}</span>}
            {sequence.createdAt && <span>Created: {new Date(sequence.createdAt).toLocaleDateString()}</span>}
            {sequence.lastModifiedBy && <span>Modified by: {sequence.lastModifiedBy}</span>}
            {sequence.updatedAt && <span>Modified: {new Date(sequence.updatedAt).toLocaleString()}</span>}
            {account && (
              <Link href={`/crm/accounts/${account.id}`}>
                <span className="text-primary hover:underline cursor-pointer flex items-center gap-0.5">
                  <Building2 className="w-2.5 h-2.5" />{account.name}
                </span>
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {sequence.status === "draft" && (
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => statusMutation.mutate({ action: "activate" })} data-testid="activate-btn">
              <Play className="w-3 h-3" /> Activate
            </Button>
          )}
          {sequence.status === "active" && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => statusMutation.mutate({ action: "update", status: "paused" })} data-testid="pause-btn">
              <Pause className="w-3 h-3" /> Pause
            </Button>
          )}
          {sequence.status === "paused" && (
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => statusMutation.mutate({ action: "activate" })} data-testid="resume-btn">
              <Play className="w-3 h-3" /> Resume
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEnrollOpen(true)} data-testid="enroll-btn">
            <UserPlus className="w-3 h-3" /> Enroll
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6 max-w-5xl">
          {sequence.description && (
            <p className="text-xs text-muted-foreground">{sequence.description}</p>
          )}

          <div className="border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-400" /> Step Pipeline
            </h2>
            {sequence.steps.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No steps defined yet.</p>
            ) : (
              <div className="flex items-start gap-2 overflow-x-auto pb-2">
                {sequence.steps.sort((a, b) => a.order - b.order).map((step, idx) => {
                  const Icon = STEP_ICONS[step.type];
                  const colorClass = STEP_COLORS[step.type] || "";
                  const [textColor, bgColor, borderColor] = colorClass.split(" ");
                  return (
                    <div key={step.id} className="flex items-start gap-2" data-testid={`pipeline-step-${idx}`}>
                      <div className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border min-w-[120px] ${bgColor} ${borderColor}`}>
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full ${bgColor}`}>
                          <Icon className={`w-4 h-4 ${textColor}`} />
                        </div>
                        <span className={`text-[10px] font-medium ${textColor}`}>{step.type.replace("_", " ")}</span>
                        <span className="text-[9px] text-muted-foreground">Step {idx + 1}</span>
                        {step.type === "wait" && step.delayDays && (
                          <span className="text-[9px] text-muted-foreground">{step.delayDays}d delay</span>
                        )}
                        {step.subject && (
                          <span className="text-[9px] text-muted-foreground truncate max-w-[100px]">{step.subject}</span>
                        )}
                        <span className="text-[9px] text-muted-foreground">
                          {enrolledContacts.filter(c => (c.sequenceStep || 0) === idx && c.sequenceStatus !== "completed").length} here
                        </span>
                      </div>
                      {idx < sequence.steps.length - 1 && (
                        <div className="flex items-center pt-8">
                          <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border border-border rounded-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Enrolled Contacts</h2>
                <Badge variant="outline" className="text-[10px]">{enrolledContacts.length}</Badge>
              </div>
            </div>

            {enrolledContacts.length > 0 && (
              <div className="px-4 pb-3">
                <div className="grid grid-cols-4 gap-3" data-testid="sequence-aggregate-stats">
                  {(() => {
                    const active = enrolledContacts.filter(c => c.sequenceStatus === "active").length;
                    const paused = enrolledContacts.filter(c => c.sequenceStatus === "paused").length;
                    const completed = enrolledContacts.filter(c => c.sequenceStatus === "completed").length;
                    const total = enrolledContacts.length;
                    const avgProgress = total > 0 ? Math.round(enrolledContacts.reduce((sum, c) => {
                      const step = c.sequenceStep || 0;
                      return sum + (c.sequenceStatus === "completed" ? 100 : sequence.steps.length > 0 ? (step / sequence.steps.length) * 100 : 0);
                    }, 0) / total) : 0;
                    return (
                      <>
                        <div className="p-2 rounded-lg border border-border bg-muted/20 text-center">
                          <div className="text-lg font-semibold text-emerald-400" data-testid="stat-active">{active}</div>
                          <div className="text-[10px] text-muted-foreground">Active</div>
                        </div>
                        <div className="p-2 rounded-lg border border-border bg-muted/20 text-center">
                          <div className="text-lg font-semibold text-yellow-400" data-testid="stat-paused">{paused}</div>
                          <div className="text-[10px] text-muted-foreground">Paused</div>
                        </div>
                        <div className="p-2 rounded-lg border border-border bg-muted/20 text-center">
                          <div className="text-lg font-semibold text-blue-400" data-testid="stat-completed">{completed}</div>
                          <div className="text-[10px] text-muted-foreground">Completed</div>
                        </div>
                        <div className="p-2 rounded-lg border border-border bg-muted/20 text-center">
                          <div className="text-lg font-semibold" data-testid="stat-progress">{avgProgress}%</div>
                          <div className="text-[10px] text-muted-foreground">Avg Progress</div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {sequence.sequenceType === "account" && sequence.roleTargeting && Object.keys(sequence.roleTargeting).length > 0 && (
                  <div className="mt-3">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Role Groups</span>
                    <div className="grid grid-cols-2 gap-2 mt-1.5" data-testid="role-groups">
                      {Object.entries(sequence.roleTargeting).map(([role, messaging]) => {
                        const roleContacts = enrolledContacts.filter(c =>
                          (c.title || "").toLowerCase().includes(role.toLowerCase())
                        );
                        const roleCompleted = roleContacts.filter(c => c.sequenceStatus === "completed").length;
                        return (
                          <div key={role} className="p-2 rounded-lg border border-border bg-muted/10" data-testid={`role-group-${role}`}>
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-[10px]">{role}</Badge>
                              <span className="text-[10px] text-muted-foreground">{roleContacts.length} contact{roleContacts.length !== 1 ? "s" : ""}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1 truncate" title={String(messaging)}>{String(messaging)}</p>
                            {roleContacts.length > 0 && (
                              <div className="mt-1.5 w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full transition-all"
                                  style={{ width: `${roleContacts.length > 0 ? (roleCompleted / roleContacts.length) * 100 : 0}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {enrolledContacts.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No contacts enrolled. Use the "Enroll" button to add contacts.</p>
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Contact</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Step</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Intelligence</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrolledContacts.map(contact => {
                      const contactStatus = contact.sequenceStatus || "active";
                      const currentStep = contact.sequenceStep || 0;
                      const step = sequence.steps[currentStep];
                      return (
                        <tr
                          key={contact.id}
                          className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                          data-testid={`enrolled-contact-${contact.id}`}
                        >
                          <td className="px-3 py-2.5">
                            <Link href={`/crm/contacts/${contact.id}`}>
                              <div className="flex items-center gap-2 cursor-pointer hover:underline">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-medium text-[10px] shrink-0">
                                  {contact.firstName[0]}{contact.lastName[0]}
                                </div>
                                <div>
                                  <span className="font-medium">{contact.firstName} {contact.lastName}</span>
                                  {contact.title && <span className="text-muted-foreground ml-1">· {contact.title}</span>}
                                </div>
                              </div>
                            </Link>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              {step && (() => {
                                const StepIcon = STEP_ICONS[step.type];
                                return StepIcon ? <StepIcon className="w-3 h-3 text-muted-foreground" /> : null;
                              })()}
                              <span className="text-muted-foreground">
                                {contactStatus === "completed" ? "Done" : `Step ${currentStep + 1}/${sequence.steps.length}`}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${CONTACT_STATUS_COLORS[contactStatus] || ""}`}>
                              {contactStatus}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            {contact.contactIntelligence ? (
                              <IntelligenceSummary intelligence={contact.contactIntelligence} />
                            ) : (
                              <span className="text-[10px] text-muted-foreground">Not analyzed</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {contactStatus === "active" && (
                                <>
                                  <Button
                                    variant="ghost" size="icon" className="h-6 w-6"
                                    onClick={() => contactActionMutation.mutate({ contactId: contact.id, action: "advance-contact" })}
                                    title="Advance to next step"
                                    data-testid={`advance-${contact.id}`}
                                  >
                                    <SkipForward className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                                  </Button>
                                  <Button
                                    variant="ghost" size="icon" className="h-6 w-6"
                                    onClick={() => contactActionMutation.mutate({ contactId: contact.id, action: "pause-contact" })}
                                    title="Pause"
                                    data-testid={`pause-contact-${contact.id}`}
                                  >
                                    <Pause className="w-3 h-3 text-muted-foreground hover:text-yellow-400" />
                                  </Button>
                                </>
                              )}
                              {contactStatus === "paused" && (
                                <Button
                                  variant="ghost" size="icon" className="h-6 w-6"
                                  onClick={() => contactActionMutation.mutate({ contactId: contact.id, action: "resume-contact" })}
                                  title="Resume"
                                  data-testid={`resume-contact-${contact.id}`}
                                >
                                  <Play className="w-3 h-3 text-muted-foreground hover:text-emerald-400" />
                                </Button>
                              )}
                              <Button
                                variant="ghost" size="icon" className="h-6 w-6"
                                onClick={() => unenrollMutation.mutate(contact.id)}
                                title="Remove"
                                data-testid={`unenroll-${contact.id}`}
                              >
                                <UserMinus className="w-3 h-3 text-muted-foreground hover:text-red-400" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {enrollOpen && (
        <EnrollDialog
          open={enrollOpen}
          onClose={() => setEnrollOpen(false)}
          sequenceId={sequenceId}
          enrolledIds={sequence.contactIds || []}
          allContacts={allContacts}
        />
      )}
    </div>
  );
}
