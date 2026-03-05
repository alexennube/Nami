import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Building2, Users, Search, Trash2, Pencil, MoreHorizontal, Mail, Phone, Globe, MapPin } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { CrmAccount, CrmContact } from "@shared/schema";

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
  const [activeTab, setActiveTab] = useState("contacts");

  const { data: accounts = [], isLoading: accountsLoading } = useQuery<CrmAccount[]>({ queryKey: ["/api/crm/accounts"] });
  const { data: contacts = [], isLoading: contactsLoading } = useQuery<CrmContact[]>({ queryKey: ["/api/crm/contacts"] });

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
            <TabsTrigger value="contacts" className="text-xs h-7" data-testid="tab-contacts">
              <Users className="w-3.5 h-3.5 mr-1" /> Contacts
            </TabsTrigger>
            <TabsTrigger value="accounts" className="text-xs h-7" data-testid="tab-accounts">
              <Building2 className="w-3.5 h-3.5 mr-1" /> Accounts
            </TabsTrigger>
          </TabsList>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => activeTab === "contacts" ? setContactDialog({ open: true }) : setAccountDialog({ open: true })}
            data-testid="crm-add-btn"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add {activeTab === "contacts" ? "Contact" : "Account"}
          </Button>
        </div>

        <TabsContent value="contacts" className="flex-1 min-h-0 mt-0 px-4 pb-4">
          <ScrollArea className="h-full">
            {contactsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading contacts...</p>
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{search ? "No contacts match your search" : "No contacts yet"}</p>
              </div>
            ) : (
              <div className="space-y-1 pt-2">
                {filteredContacts.map(contact => {
                  const account = accounts.find(a => a.id === contact.accountId);
                  return (
                    <div
                      key={contact.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/crm/contacts/${contact.id}`)}
                      data-testid={`contact-row-${contact.id}`}
                    >
                      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary font-medium text-sm shrink-0">
                        {contact.firstName[0]}{contact.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{contact.firstName} {contact.lastName}</span>
                          {contact.stage && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${STAGE_COLORS[contact.stage] || ""}`}>
                              {contact.stage}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                          {contact.title && <span>{contact.title}</span>}
                          {contact.company && <span className="flex items-center gap-0.5"><Building2 className="w-2.5 h-2.5" />{contact.company}</span>}
                          {account && <span className="text-primary/70">{account.name}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
                        {contact.email && <span className="hidden md:flex items-center gap-0.5"><Mail className="w-2.5 h-2.5" />{contact.email}</span>}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => e.stopPropagation()} data-testid={`contact-menu-${contact.id}`}>
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setContactDialog({ open: true, contact }); }}>
                            <Pencil className="w-3 h-3 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-400" onClick={(e) => { e.stopPropagation(); deleteContactMutation.mutate(contact.id); }}>
                            <Trash2 className="w-3 h-3 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="accounts" className="flex-1 min-h-0 mt-0 px-4 pb-4">
          <ScrollArea className="h-full">
            {accountsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading accounts...</p>
            ) : filteredAccounts.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{search ? "No accounts match your search" : "No accounts yet"}</p>
              </div>
            ) : (
              <div className="space-y-1 pt-2">
                {filteredAccounts.map(account => {
                  const contactCount = contacts.filter(c => c.accountId === account.id).length;
                  return (
                    <div
                      key={account.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                      data-testid={`account-row-${account.id}`}
                    >
                      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/10 text-amber-500 shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{account.name}</span>
                          {account.industry && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{account.industry}</Badge>}
                          {account.size && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{account.size}</Badge>}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                          {account.domain && <span className="flex items-center gap-0.5"><Globe className="w-2.5 h-2.5" />{account.domain}</span>}
                          <span>{contactCount} contact{contactCount !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" data-testid={`account-menu-${account.id}`}>
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setAccountDialog({ open: true, account })}>
                            <Pencil className="w-3 h-3 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-400" onClick={() => deleteAccountMutation.mutate(account.id)}>
                            <Trash2 className="w-3 h-3 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
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
