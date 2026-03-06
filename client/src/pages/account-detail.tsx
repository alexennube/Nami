import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Building2, Globe, Users, Pencil, Plus, Trash2, X, Check,
  Mail, Phone
} from "lucide-react";
import type { CrmAccount, CrmContact } from "@shared/schema";

const STAGE_COLORS: Record<string, string> = {
  lead: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  prospect: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  qualified: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  customer: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  churned: "bg-red-500/20 text-red-400 border-red-500/30",
};

function AddContactDialog({ open, onClose, accountId, accountName }: { open: boolean; onClose: () => void; accountId: string; accountName: string }) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState("lead");

  const mutation = useMutation({
    mutationFn: async () => {
      const data = {
        firstName, lastName, email, phone, title,
        company: accountName,
        accountId,
        stage,
        tags: [],
      };
      const res = await apiRequest("POST", "/api/crm/contacts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts", { accountId }] });
      onClose();
      toast({ title: "Contact added to account" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Contact to {accountName}</DialogTitle>
          <DialogDescription>Create a new contact linked to this account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="First name *" value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="new-contact-firstname" />
            <Input placeholder="Last name *" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="new-contact-lastname" />
          </div>
          <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="new-contact-email" />
          <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="new-contact-phone" />
          <Input placeholder="Title / Role" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="new-contact-title" />
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger data-testid="new-contact-stage"><SelectValue placeholder="Stage" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="churned">Churned</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!firstName.trim() || !lastName.trim() || mutation.isPending} data-testid="new-contact-save">
            Add Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AccountDetail() {
  const params = useParams<{ id: string }>();
  const accountId = params.id;
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<CrmAccount>>({});

  const { data: account, isLoading } = useQuery<CrmAccount>({
    queryKey: ["/api/crm/accounts", accountId],
    queryFn: async () => { const res = await fetch(`/api/crm/accounts/${accountId}`); return res.json(); },
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<CrmContact[]>({
    queryKey: ["/api/crm/contacts", { accountId }],
    queryFn: async () => { const res = await fetch(`/api/crm/contacts?accountId=${accountId}`); return res.json(); },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<CrmAccount>) => {
      const res = await apiRequest("PATCH", `/api/crm/accounts/${accountId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/accounts", accountId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/accounts"] });
      setEditing(false);
      toast({ title: "Account updated" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/crm/contacts/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts", { accountId }] });
      toast({ title: "Contact removed" });
    },
  });

  const startEdit = () => {
    if (!account) return;
    setEditForm({
      name: account.name,
      domain: account.domain || "",
      industry: account.industry || "",
      website: account.website || "",
      size: account.size || "",
      description: account.description || "",
    });
    setEditing(true);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full p-6 gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <Building2 className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-sm font-medium mb-2">Account not found</h3>
        <Link href="/crm">
          <Button variant="outline" size="sm" data-testid="button-back-crm">
            <ArrowLeft className="w-3 h-3 mr-1" /> Back to CRM
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-3 md:p-4 border-b shrink-0">
        <Link href="/crm">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 shrink-0">
          <Building2 className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm" data-testid="text-account-name">{account.name}</span>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {account.industry && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{account.industry}</Badge>}
            {account.size && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{account.size}</Badge>}
            <span>{contacts.length} contact{contacts.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6 max-w-4xl">
          <div className="border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Account Details</h2>
              {!editing ? (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startEdit} data-testid="account-edit-toggle">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(false)} data-testid="account-edit-cancel">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateMutation.mutate(editForm)} disabled={updateMutation.isPending} data-testid="account-edit-save">
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  </Button>
                </div>
              )}
            </div>

            {editing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Name</label>
                  <Input value={editForm.name || ""} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className="mt-1 h-8 text-xs" data-testid="account-edit-name" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Industry</label>
                  <Input value={editForm.industry || ""} onChange={(e) => setEditForm(f => ({ ...f, industry: e.target.value }))} className="mt-1 h-8 text-xs" data-testid="account-edit-industry" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Domain</label>
                  <Input value={editForm.domain || ""} onChange={(e) => setEditForm(f => ({ ...f, domain: e.target.value }))} className="mt-1 h-8 text-xs" data-testid="account-edit-domain" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Website</label>
                  <Input value={editForm.website || ""} onChange={(e) => setEditForm(f => ({ ...f, website: e.target.value }))} className="mt-1 h-8 text-xs" data-testid="account-edit-website" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Size</label>
                  <Select value={editForm.size || ""} onValueChange={(v) => setEditForm(f => ({ ...f, size: v }))}>
                    <SelectTrigger className="mt-1 h-8 text-xs" data-testid="account-edit-size"><SelectValue placeholder="Company size" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1-10</SelectItem>
                      <SelectItem value="11-50">11-50</SelectItem>
                      <SelectItem value="51-200">51-200</SelectItem>
                      <SelectItem value="201-1000">201-1000</SelectItem>
                      <SelectItem value="1000+">1000+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Description</label>
                  <textarea
                    value={editForm.description || ""}
                    onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full mt-1 min-h-[60px] px-3 py-2 text-xs bg-background border border-border rounded-md resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                    data-testid="account-edit-description"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Name</span>
                  <p className="text-xs mt-0.5">{account.name}</p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Industry</span>
                  <p className="text-xs mt-0.5">{account.industry || "—"}</p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Domain</span>
                  <p className="text-xs mt-0.5">{account.domain || "—"}</p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Website</span>
                  <p className="text-xs mt-0.5">
                    {account.website ? (
                      <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                        <Globe className="w-3 h-3" />{account.website}
                      </a>
                    ) : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Size</span>
                  <p className="text-xs mt-0.5">{account.size || "—"}</p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Created</span>
                  <p className="text-xs mt-0.5">{new Date(account.createdAt).toLocaleDateString()}</p>
                </div>
                {account.description && (
                  <div className="md:col-span-2">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Description</span>
                    <p className="text-xs mt-0.5 text-muted-foreground whitespace-pre-wrap">{account.description}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border border-border rounded-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Contacts</h2>
                <Badge variant="outline" className="text-[10px]">{contacts.length}</Badge>
              </div>
              <Button size="sm" className="h-7 text-xs" onClick={() => setAddContactOpen(true)} data-testid="account-add-contact">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Contact
              </Button>
            </div>

            {contactsLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading contacts...</div>
            ) : contacts.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No contacts linked to this account yet.</p>
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Phone</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Title</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Stage</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground w-16">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map(contact => (
                      <tr
                        key={contact.id}
                        className="border-b border-border/50 hover:bg-accent/30 cursor-pointer transition-colors"
                        onClick={() => navigate(`/crm/contacts/${contact.id}`)}
                        data-testid={`account-contact-row-${contact.id}`}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-medium text-[10px] shrink-0">
                              {contact.firstName[0]}{contact.lastName[0]}
                            </div>
                            <span className="font-medium">{contact.firstName} {contact.lastName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {contact.email && (
                            <span className="flex items-center gap-1"><Mail className="w-2.5 h-2.5" />{contact.email}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {contact.phone && (
                            <span className="flex items-center gap-1"><Phone className="w-2.5 h-2.5" />{contact.phone}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{contact.title || "—"}</td>
                        <td className="px-3 py-2.5">
                          {contact.stage && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${STAGE_COLORS[contact.stage] || ""}`}>
                              {contact.stage}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => { e.stopPropagation(); deleteContactMutation.mutate(contact.id); }}
                            data-testid={`account-contact-delete-${contact.id}`}
                          >
                            <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-400" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {addContactOpen && (
        <AddContactDialog
          open={addContactOpen}
          onClose={() => setAddContactOpen(false)}
          accountId={accountId}
          accountName={account.name}
        />
      )}
    </div>
  );
}
