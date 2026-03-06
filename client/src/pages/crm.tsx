import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Building2, Users, Search, Globe, Mail, Phone, Tag, Zap } from "lucide-react";
import { ConfigurableTable, type ColumnDef } from "@/components/configurable-table";
import type { CrmAccount, CrmContact, CrmSequence } from "@shared/schema";

const STAGE_COLORS: Record<string, string> = {
  lead: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  prospect: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  qualified: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  customer: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  churned: "bg-red-500/20 text-red-400 border-red-500/30",
};

function AccountDialog({ open, onClose, account }: { open: boolean; onClose: () => void; account?: CrmAccount }) {
  const { toast } = useToast();
  const [name, setName] = useState(account?.name || "");
  const [domain, setDomain] = useState(account?.domain || "");
  const [industry, setIndustry] = useState(account?.industry || "");
  const [description, setDescription] = useState(account?.description || "");
  const [website, setWebsite] = useState(account?.website || "");
  const [size, setSize] = useState(account?.size || "");

  const mutation = useMutation({
    mutationFn: async () => {
      const data = { name, domain, industry, description, website, size };
      if (account) {
        const res = await apiRequest("PATCH", `/api/crm/accounts/${account.id}`, data);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/crm/accounts", data);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/accounts"] });
      onClose();
      toast({ title: account ? "Account updated" : "Account created" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Edit Account" : "New Account"}</DialogTitle>
          <DialogDescription>{account ? "Update account details." : "Add a new company or organization."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Company name *" value={name} onChange={(e) => setName(e.target.value)} data-testid="account-name-input" />
          <Input placeholder="Domain (e.g. acme.com)" value={domain} onChange={(e) => setDomain(e.target.value)} data-testid="account-domain-input" />
          <Input placeholder="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)} data-testid="account-industry-input" />
          <Input placeholder="Website" value={website} onChange={(e) => setWebsite(e.target.value)} data-testid="account-website-input" />
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger data-testid="account-size-select"><SelectValue placeholder="Company size" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1-10">1-10</SelectItem>
              <SelectItem value="11-50">11-50</SelectItem>
              <SelectItem value="51-200">51-200</SelectItem>
              <SelectItem value="201-1000">201-1000</SelectItem>
              <SelectItem value="1000+">1000+</SelectItem>
            </SelectContent>
          </Select>
          <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full min-h-[60px] px-3 py-2 text-sm bg-background border border-border rounded-md resize-y focus:outline-none focus:ring-1 focus:ring-primary" data-testid="account-desc-input" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending} data-testid="account-save-btn">
            {account ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactDialog({ open, onClose, contact, accounts }: { open: boolean; onClose: () => void; contact?: CrmContact; accounts: CrmAccount[] }) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState(contact?.firstName || "");
  const [lastName, setLastName] = useState(contact?.lastName || "");
  const [email, setEmail] = useState(contact?.email || "");
  const [phone, setPhone] = useState(contact?.phone || "");
  const [title, setTitle] = useState(contact?.title || "");
  const [company, setCompany] = useState(contact?.company || "");
  const [accountId, setAccountId] = useState(contact?.accountId || "none");
  const [stage, setStage] = useState(contact?.stage || "lead");
  const [linkedIn, setLinkedIn] = useState(contact?.linkedIn || "");
  const [twitter, setTwitter] = useState(contact?.twitter || "");
  const [tags, setTags] = useState((contact?.tags || []).join(", "));

  const mutation = useMutation({
    mutationFn: async () => {
      const data = {
        firstName, lastName, email, phone, title, company,
        accountId: accountId === "none" ? null : accountId,
        stage, linkedIn, twitter,
        tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      };
      if (contact) {
        const res = await apiRequest("PATCH", `/api/crm/contacts/${contact.id}`, data);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/crm/contacts", data);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts"] });
      onClose();
      toast({ title: contact ? "Contact updated" : "Contact created" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit Contact" : "New Contact"}</DialogTitle>
          <DialogDescription>{contact ? "Update contact details." : "Add a new contact to the CRM."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="First name *" value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="contact-firstname-input" />
            <Input placeholder="Last name *" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="contact-lastname-input" />
          </div>
          <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="contact-email-input" />
          <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="contact-phone-input" />
          <Input placeholder="Title / Role" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="contact-title-input" />
          <Input placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} data-testid="contact-company-input" />
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger data-testid="contact-account-select"><SelectValue placeholder="Link to account" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No account</SelectItem>
              {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger data-testid="contact-stage-select"><SelectValue placeholder="Stage" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="churned">Churned</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="LinkedIn URL" value={linkedIn} onChange={(e) => setLinkedIn(e.target.value)} data-testid="contact-linkedin-input" />
          <Input placeholder="Twitter / X handle" value={twitter} onChange={(e) => setTwitter(e.target.value)} data-testid="contact-twitter-input" />
          <Input placeholder="Tags (comma-separated)" value={tags} onChange={(e) => setTags(e.target.value)} data-testid="contact-tags-input" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!firstName.trim() || !lastName.trim() || mutation.isPending} data-testid="contact-save-btn">
            {contact ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CrmPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [accountDialog, setAccountDialog] = useState<{ open: boolean; account?: CrmAccount }>({ open: false });
  const [contactDialog, setContactDialog] = useState<{ open: boolean; contact?: CrmContact }>({ open: false });
  const [activeTab, setActiveTab] = useState("accounts");

  const { data: accounts = [], isLoading: accountsLoading } = useQuery<CrmAccount[]>({ queryKey: ["/api/crm/accounts"] });
  const { data: contacts = [], isLoading: contactsLoading } = useQuery<CrmContact[]>({ queryKey: ["/api/crm/contacts"] });
  const { data: sequences = [], isLoading: sequencesLoading } = useQuery<CrmSequence[]>({ queryKey: ["/api/crm/sequences"] });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/crm/accounts/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts"] });
      toast({ title: "Account deleted" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/crm/contacts/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/contacts"] });
      toast({ title: "Contact deleted" });
    },
  });

  const filteredContacts = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${c.firstName} ${c.lastName} ${c.email} ${c.company} ${(c.tags || []).join(" ")}`.toLowerCase().includes(q);
  });

  const filteredAccounts = accounts.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${a.name} ${a.domain} ${a.industry}`.toLowerCase().includes(q);
  });

  const accountColumns: ColumnDef<CrmAccount>[] = [
    {
      key: "name",
      label: "Name",
      defaultVisible: true,
      render: (a) => (
        <span className="font-medium text-primary hover:underline">{a.name}</span>
      ),
    },
    {
      key: "industry",
      label: "Industry",
      defaultVisible: true,
      render: (a) => a.industry ? <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{a.industry}</Badge> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "domain",
      label: "Domain",
      defaultVisible: true,
      render: (a) => a.domain ? <span className="flex items-center gap-1 text-muted-foreground"><Globe className="w-2.5 h-2.5" />{a.domain}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "size",
      label: "Size",
      defaultVisible: true,
      render: (a) => a.size ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{a.size}</Badge> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "contactCount",
      label: "Contacts",
      defaultVisible: true,
      render: (a) => {
        const count = contacts.filter(c => c.accountId === a.id).length;
        return <span className="text-muted-foreground">{count}</span>;
      },
    },
    {
      key: "website",
      label: "Website",
      defaultVisible: false,
      render: (a) => a.website ? (
        <a href={a.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Globe className="w-2.5 h-2.5" />{a.website}
        </a>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "created",
      label: "Created",
      defaultVisible: false,
      render: (a) => <span className="text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</span>,
    },
  ];

  const contactColumns: ColumnDef<CrmContact>[] = [
    {
      key: "name",
      label: "Name",
      defaultVisible: true,
      render: (c) => (
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-medium text-[10px] shrink-0">
            {c.firstName[0]}{c.lastName[0]}
          </div>
          <span className="font-medium">{c.firstName} {c.lastName}</span>
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      defaultVisible: true,
      render: (c) => c.email ? <span className="flex items-center gap-1 text-muted-foreground"><Mail className="w-2.5 h-2.5" />{c.email}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "phone",
      label: "Phone",
      defaultVisible: false,
      render: (c) => c.phone ? <span className="flex items-center gap-1 text-muted-foreground"><Phone className="w-2.5 h-2.5" />{c.phone}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "company",
      label: "Company",
      defaultVisible: true,
      render: (c) => c.company ? <span className="text-muted-foreground">{c.company}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "stage",
      label: "Stage",
      defaultVisible: true,
      render: (c) => c.stage ? (
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${STAGE_COLORS[c.stage] || ""}`}>
          {c.stage}
        </Badge>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "tags",
      label: "Tags",
      defaultVisible: false,
      render: (c) => (c.tags && c.tags.length > 0) ? (
        <div className="flex items-center gap-1 flex-wrap">
          {c.tags.slice(0, 2).map(tag => (
            <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-primary/10 text-primary border-primary/20">
              <Tag className="w-2 h-2 mr-0.5" />{tag}
            </Badge>
          ))}
          {c.tags.length > 2 && <span className="text-[9px] text-muted-foreground">+{c.tags.length - 2}</span>}
        </div>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "account",
      label: "Account",
      defaultVisible: true,
      render: (c) => {
        const account = accounts.find(a => a.id === c.accountId);
        if (!account) return <span className="text-muted-foreground">—</span>;
        return (
          <span
            className="text-primary hover:underline cursor-pointer flex items-center gap-1"
            onClick={(e) => { e.stopPropagation(); navigate(`/crm/accounts/${account.id}`); }}
            data-testid={`contact-account-link-${c.id}`}
          >
            <Building2 className="w-2.5 h-2.5" />{account.name}
          </span>
        );
      },
    },
    {
      key: "created",
      label: "Created",
      defaultVisible: false,
      render: (c) => <span className="text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground" data-testid="crm-heading">CRM</h1>
          <Badge variant="outline" className="text-xs">{contacts.length} contacts</Badge>
          <Badge variant="outline" className="text-xs">{accounts.length} accounts</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 w-48 text-xs"
              data-testid="crm-search-input"
            />
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 pt-2 shrink-0">
          <TabsList className="h-8">
            <TabsTrigger value="accounts" className="text-xs h-7" data-testid="tab-accounts">
              <Building2 className="w-3.5 h-3.5 mr-1" /> Accounts
            </TabsTrigger>
            <TabsTrigger value="contacts" className="text-xs h-7" data-testid="tab-contacts">
              <Users className="w-3.5 h-3.5 mr-1" /> Contacts
            </TabsTrigger>
            <TabsTrigger value="sequences" className="text-xs h-7" data-testid="tab-sequences">
              <Zap className="w-3.5 h-3.5 mr-1" /> Sequences
            </TabsTrigger>
          </TabsList>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              if (activeTab === "sequences") navigate("/crm/sequences");
              else if (activeTab === "contacts") setContactDialog({ open: true });
              else setAccountDialog({ open: true });
            }}
            data-testid="crm-add-btn"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> {activeTab === "sequences" ? "View All" : activeTab === "contacts" ? "Add Contact" : "Add Account"}
          </Button>
        </div>

        <TabsContent value="accounts" className="flex-1 min-h-0 mt-0 px-4 pb-4 pt-2">
          <ConfigurableTable
            tableName="accounts"
            columns={accountColumns}
            data={filteredAccounts}
            isLoading={accountsLoading}
            emptyIcon={<Building2 className="w-10 h-10 text-muted-foreground/20 mx-auto" />}
            emptyMessage={search ? "No accounts match your search" : "No accounts yet"}
            getRowId={(a) => a.id}
            onRowClick={(a) => navigate(`/crm/accounts/${a.id}`)}
            onEdit={(a) => setAccountDialog({ open: true, account: a })}
            onDelete={(a) => deleteAccountMutation.mutate(a.id)}
          />
        </TabsContent>

        <TabsContent value="contacts" className="flex-1 min-h-0 mt-0 px-4 pb-4 pt-2">
          <ConfigurableTable
            tableName="contacts"
            columns={contactColumns}
            data={filteredContacts}
            isLoading={contactsLoading}
            emptyIcon={<Users className="w-10 h-10 text-muted-foreground/20 mx-auto" />}
            emptyMessage={search ? "No contacts match your search" : "No contacts yet"}
            getRowId={(c) => c.id}
            onRowClick={(c) => navigate(`/crm/contacts/${c.id}`)}
            onEdit={(c) => setContactDialog({ open: true, contact: c })}
            onDelete={(c) => deleteContactMutation.mutate(c.id)}
          />
        </TabsContent>

        <TabsContent value="sequences" className="flex-1 min-h-0 mt-0 px-4 pb-4 pt-2">
          {sequencesLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Loading sequences...</p>
            </div>
          ) : sequences.length === 0 ? (
            <div className="text-center py-12">
              <Zap className="w-10 h-10 text-muted-foreground/20 mx-auto" />
              <p className="text-sm text-muted-foreground mt-3">No sequences yet</p>
              <Button size="sm" className="mt-3 h-7 text-xs" onClick={() => navigate("/crm/sequences")} data-testid="go-sequences-btn">
                <Plus className="w-3.5 h-3.5 mr-1" /> Create Sequence
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {sequences.slice(0, 10).map(seq => {
                const enrolled = (seq.contactIds || []).length;
                const completed = contacts.filter(c => c.sequenceId === seq.id && c.sequenceStatus === "completed").length;
                const pct = enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0;
                const statusColor = seq.status === "active" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                  seq.status === "paused" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                  "bg-gray-500/20 text-gray-400 border-gray-500/30";
                return (
                  <div
                    key={seq.id}
                    className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-accent/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/crm/sequences/${seq.id}`)}
                    data-testid={`sequence-card-${seq.id}`}
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{seq.name}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${statusColor}`}>{seq.status}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                        <span>{seq.steps.length} steps</span>
                        <span>{enrolled} enrolled</span>
                        <span>{pct}% complete</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {sequences.length > 10 && (
                <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => navigate("/crm/sequences")}>
                  View all {sequences.length} sequences
                </Button>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {accountDialog.open && (
        <AccountDialog
          open={accountDialog.open}
          onClose={() => setAccountDialog({ open: false })}
          account={accountDialog.account}
        />
      )}

      {contactDialog.open && (
        <ContactDialog
          open={contactDialog.open}
          onClose={() => setContactDialog({ open: false })}
          contact={contactDialog.contact}
          accounts={accounts}
        />
      )}
    </div>
  );
}
