import crypto from "crypto";
import type { CrmDb } from "./db";

export type CrmToolAuditFn = (...args: any[]) => any;

export function createCrmTool(db: CrmDb, logAudit: CrmToolAuditFn, getIntelligenceAnalyzer?: () => ((contact: any) => Promise<any>) | undefined) {
  return {
    name: "crm",
    description: `Interact with the CRM system. Full control over contacts, accounts, sequences, and agent-driven outreach.

CONTACTS: create_contact, list_contacts, get_contact, search_contacts, update_contact, delete_contact
ACCOUNTS: create_account, list_accounts, get_account, update_account, delete_account
ACTIVITIES & COMMENTS: log_activity, add_comment, get_activities, get_comments
SEQUENCES: list_sequences, get_sequence, create_sequence, update_sequence, delete_sequence
ENROLLMENT: enroll_contacts, unenroll_contacts, pause_contact, resume_contact, advance_contact, complete_contact
AGENT STEP ACTIONS: save_step_draft (save personalized draft for a contact at a step), get_step_context (get current step + draft + intelligence), mark_step_done (record action taken, log activity, advance)

The sequence model is a task list for agents: the sequence defines step types and order, but agents plan the specific action for each contact, draft content, and mark steps complete.`,
    category: "system",
    enabled: true,
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Action to perform",
          enum: [
            "create_contact", "list_contacts", "get_contact", "search_contacts", "update_contact", "delete_contact",
            "create_account", "list_accounts", "get_account", "update_account", "delete_account",
            "log_activity", "add_comment", "get_activities", "get_comments",
            "list_sequences", "get_sequence", "create_sequence", "update_sequence", "delete_sequence",
            "enroll_contacts", "unenroll_contacts", "pause_contact", "resume_contact", "advance_contact", "complete_contact",
            "save_step_draft", "get_step_context", "mark_step_done",
          ],
        },
        contact_id: { type: "string", description: "Contact ID" },
        contact_ids: { type: "array", description: "Array of contact IDs", items: { type: "string" } },
        sequence_id: { type: "string", description: "Sequence ID" },
        step_id: { type: "string", description: "Step ID within a sequence" },
        query: { type: "string", description: "Search query for search_contacts" },
        first_name: { type: "string", description: "First name" },
        last_name: { type: "string", description: "Last name" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        company: { type: "string", description: "Company name" },
        account_id: { type: "string", description: "Account ID" },
        updates: { type: "object", description: "Fields to update" },
        activity_type: { type: "string", description: "Type of activity" },
        title: { type: "string", description: "Title/subject" },
        content: { type: "string", description: "Content/description" },
        metadata: { type: "object", description: "Optional metadata" },
        steps: { type: "array", description: "Array of sequence steps" },
        name: { type: "string", description: "Name for create_sequence" },
        description: { type: "string", description: "Description" },
        sequence_type: { type: "string", description: "Sequence type: contact or account" },
        draft_type: { type: "string", description: "Type of draft" },
        subject: { type: "string", description: "Subject line" },
        body: { type: "string", description: "Body content" },
        notes: { type: "string", description: "Notes" },
        action_taken: { type: "string", description: "Description of what was done" },
      },
      required: ["action"],
    },
    execute: async (args: Record<string, any>, agentContext?: { agentName?: string; agentRole?: string }) => {
      const action = args.action as string;
      const contactId = args.contact_id as string;
      const sequenceId = args.sequence_id as string;
      const authorName = agentContext?.agentName || "Nami";
      const authorType = (agentContext?.agentRole === "queen" || agentContext?.agentRole === "swarm_queen") ? "queen" : "agent";

      try {
        if (action === "create_contact") {
          const firstName = args.first_name as string;
          const lastName = args.last_name as string;
          if (!firstName || !lastName) return "Error: first_name and last_name are required.";
          const now = new Date().toISOString();
          const contact = {
            id: crypto.randomUUID(),
            accountId: (args.account_id as string) || null,
            firstName, lastName,
            email: (args.email as string) || "",
            phone: (args.phone as string) || "",
            title: (args.title as string) || "",
            company: (args.company as string) || "",
            linkedIn: "", twitter: "", website: "",
            notes: (args.content as string) || "",
            tags: [] as string[], stage: "lead",
            sequenceId: null, sequenceStep: null,
            createdAt: now, updatedAt: now,
            createdBy: authorName, lastModifiedBy: authorName,
          };
          await db.upsertContact(contact);
          logAudit("created", "crm_contact", contact.id, `${firstName} ${lastName}`, { actorType: "agent", actorName: authorName }, `CRM contact "${firstName} ${lastName}" created by ${authorName}`);
          return `Contact created: **${firstName} ${lastName}** (${contact.id.substring(0, 8)}…) | ${contact.email || "no email"} | ${contact.company || "no company"}`;
        }

        if (action === "delete_contact") {
          if (!contactId) return "Error: contact_id required.";
          const c = await db.getContact(contactId);
          if (!c) return "Error: Contact not found.";
          await db.deleteContact(contactId);
          logAudit("deleted", "crm_contact", contactId, `${c.firstName} ${c.lastName}`, { actorType: "agent", actorName: authorName }, `CRM contact "${c.firstName} ${c.lastName}" deleted by ${authorName}`);
          return `Contact deleted: **${c.firstName} ${c.lastName}** (${contactId.substring(0, 8)}…)`;
        }

        if (action === "create_account") {
          const name = (args.company as string) || (args.title as string);
          if (!name) return "Error: company (account name) is required.";
          const now = new Date().toISOString();
          const account = {
            id: crypto.randomUUID(),
            name,
            domain: (args.metadata as any)?.domain || "",
            industry: (args.metadata as any)?.industry || "",
            description: (args.content as string) || "",
            website: (args.metadata as any)?.website || "",
            size: (args.metadata as any)?.size || "",
            createdAt: now, updatedAt: now,
            createdBy: authorName, lastModifiedBy: authorName,
          };
          await db.upsertAccount(account);
          logAudit("created", "crm_account", account.id, name, { actorType: "agent", actorName: authorName }, `CRM account "${name}" created by ${authorName}`);
          return `Account created: **${name}** (${account.id.substring(0, 8)}…)`;
        }

        if (action === "delete_account") {
          const accId = args.account_id as string;
          if (!accId) return "Error: account_id required.";
          const a = await db.getAccount(accId);
          if (!a) return "Error: Account not found.";
          await db.deleteAccount(accId);
          logAudit("deleted", "crm_account", accId, a.name, { actorType: "agent", actorName: authorName }, `CRM account "${a.name}" deleted by ${authorName}`);
          return `Account deleted: **${a.name}** (${accId.substring(0, 8)}…). Associated contacts have been unlinked.`;
        }

        if (action === "list_accounts") {
          const accounts = await db.getAccounts();
          if (accounts.length === 0) return "No accounts in CRM.";
          return accounts.slice(0, 50).map((a: any) =>
            `- **${a.name}** (${a.id.substring(0, 8)}…) | ${a.industry || "no industry"} | ${a.domain || "no domain"}`
          ).join("\n");
        }

        if (action === "update_account") {
          const accId = args.account_id as string;
          if (!accId) return "Error: account_id required.";
          const a = await db.getAccount(accId);
          if (!a) return "Error: Account not found.";
          const updates = args.updates as Record<string, any> || {};
          const updated = { ...a, ...updates, id: accId, updatedAt: new Date().toISOString(), lastModifiedBy: authorName };
          await db.upsertAccount(updated);
          logAudit("updated", "crm_account", accId, a.name, { actorType: "agent", actorName: authorName }, `CRM account "${a.name}" updated by ${authorName}`);
          return `Account **${a.name}** updated.`;
        }

        if (action === "get_account") {
          const accId = (args.account_id as string) || (args.contact_id as string);
          if (!accId) return "Error: account_id required.";
          const a = await db.getAccount(accId);
          if (!a) return "Error: Account not found.";
          return `**${a.name}**\nDomain: ${a.domain}\nIndustry: ${a.industry}\nSize: ${a.size}\nWebsite: ${a.website}\nDescription: ${a.description}\nCreated: ${a.createdAt}`;
        }

        if (action === "list_contacts") {
          const contacts = await db.getContacts();
          if (contacts.length === 0) return "No contacts in CRM.";
          return contacts.slice(0, 50).map((c: any) =>
            `- **${c.firstName} ${c.lastName}** (${c.id.substring(0, 8)}…) | ${c.email || "no email"} | ${c.company || "no company"} | Stage: ${c.stage || "lead"}`
          ).join("\n");
        }

        if (action === "get_contact") {
          if (!contactId) return "Error: contact_id required.";
          const c = await db.getContact(contactId);
          if (!c) return "Error: Contact not found.";
          return `**${c.firstName} ${c.lastName}**\nEmail: ${c.email}\nPhone: ${c.phone}\nTitle: ${c.title}\nCompany: ${c.company}\nStage: ${c.stage}\nLinkedIn: ${c.linkedIn}\nTwitter: ${c.twitter}\nTags: ${(c.tags || []).join(", ")}\nNotes: ${c.notes || "(none)"}\nSequence: ${c.sequenceId || "none"} | Step: ${c.sequenceStep ?? "n/a"} | Status: ${c.sequenceStatus || "n/a"}\nCreated: ${c.createdAt}`;
        }

        if (action === "search_contacts") {
          const query = (args.query as string || "").toLowerCase();
          if (!query) return "Error: query required for search.";
          const contacts = await db.getContacts();
          const matches = contacts.filter((c: any) =>
            `${c.firstName} ${c.lastName} ${c.email} ${c.company} ${(c.tags || []).join(" ")}`.toLowerCase().includes(query)
          );
          if (matches.length === 0) return `No contacts matching "${query}".`;
          return matches.slice(0, 20).map((c: any) =>
            `- **${c.firstName} ${c.lastName}** (${c.id.substring(0, 8)}…) | ${c.email || "no email"} | ${c.company || ""}`
          ).join("\n");
        }

        if (action === "update_contact") {
          if (!contactId) return "Error: contact_id required.";
          const c = await db.getContact(contactId);
          if (!c) return "Error: Contact not found.";
          const updates = args.updates as Record<string, any> || {};
          const updated = { ...c, ...updates, id: contactId, updatedAt: new Date().toISOString(), lastModifiedBy: authorName };
          await db.upsertContact(updated);
          logAudit("updated", "crm_contact", contactId, `${c.firstName} ${c.lastName}`, { actorType: "agent", actorName: authorName }, `CRM contact "${c.firstName} ${c.lastName}" updated by ${authorName}`);
          return `Contact ${c.firstName} ${c.lastName} updated.`;
        }

        if (action === "log_activity") {
          if (!contactId) return "Error: contact_id required.";
          const actType = args.activity_type as string || "other";
          const title = args.title as string;
          if (!title) return "Error: title required for activity.";
          const activity = {
            id: crypto.randomUUID(), contactId,
            type: actType, title,
            description: (args.content as string) || "",
            metadata: (args.metadata as Record<string, any>) || {},
            agentName: authorName,
            createdAt: new Date().toISOString(),
          };
          await db.addActivity(activity);
          return `Activity logged for contact ${contactId.substring(0, 8)}…: ${title}`;
        }

        if (action === "add_comment") {
          if (!contactId) return "Error: contact_id required.";
          const content = args.content as string;
          if (!content) return "Error: content required.";
          const comment = {
            id: crypto.randomUUID(), contactId,
            author: authorName, authorType,
            content, createdAt: new Date().toISOString(),
          };
          await db.addContactComment(comment);
          return `Comment posted on contact ${contactId.substring(0, 8)}… by ${authorName}.`;
        }

        if (action === "get_activities") {
          if (!contactId) return "Error: contact_id required.";
          const activities = await db.getActivities(contactId);
          if (activities.length === 0) return "No activities for this contact.";
          return activities.slice(0, 30).map((a: any) =>
            `[${a.type}] ${a.title} — ${a.agentName || "system"} (${new Date(a.createdAt).toLocaleString()})\n${a.description || ""}`
          ).join("\n---\n");
        }

        if (action === "get_comments") {
          if (!contactId) return "Error: contact_id required.";
          const comments = await db.getContactComments(contactId);
          if (comments.length === 0) return "No comments for this contact.";
          return comments.map((c: any) =>
            `**${c.author}** (${c.authorType}) — ${new Date(c.createdAt).toLocaleString()}:\n${c.content}`
          ).join("\n---\n");
        }

        if (action === "list_sequences") {
          const sequences = await db.getSequences();
          if (sequences.length === 0) return "No sequences in CRM.";
          return sequences.slice(0, 50).map((s: any) =>
            `- **${s.name}** (${s.id.substring(0, 8)}…) | Status: ${s.status} | Steps: ${(s.steps || []).length} | Enrolled: ${(s.contactIds || []).length} | Type: ${s.sequenceType || "contact"}`
          ).join("\n");
        }

        if (action === "get_sequence") {
          if (!sequenceId) return "Error: sequence_id required.";
          const s = await db.getSequence(sequenceId);
          if (!s) return "Error: Sequence not found.";
          const stepsDetail = (s.steps || []).map((step: any, i: number) =>
            `  ${i + 1}. [${step.type}] ${step.subject || step.instruction || "(no subject)"} (ID: ${step.id})${step.delayDays ? ` — delay: ${step.delayDays}d` : ""}`
          ).join("\n");
          return `**${s.name}** (${s.id})\nDescription: ${s.description || "(none)"}\nStatus: ${s.status}\nType: ${s.sequenceType || "contact"}\nAccount: ${s.accountId || "none"}\nEnrolled contacts: ${(s.contactIds || []).length}\nSteps:\n${stepsDetail}\nCreated: ${s.createdAt}`;
        }

        if (action === "create_sequence") {
          const name = (args.name as string) || (args.title as string) || (args.company as string);
          if (!name) return "Error: name (sequence name) is required.";
          const steps = (args.steps as any[]) || [];
          const now = new Date().toISOString();
          const sequence = {
            id: crypto.randomUUID(),
            name,
            description: (args.description as string) || (args.content as string) || "",
            status: "draft" as const,
            sequenceType: (args.sequence_type as string) || "contact",
            accountId: (args.account_id as string) || undefined,
            steps: steps.map((s: any, i: number) => ({
              id: s.id || crypto.randomUUID(),
              order: s.order ?? i,
              type: s.type || "email",
              subject: s.subject || "",
              content: s.content || "",
              delayDays: s.delayDays || 0,
              instruction: s.instruction || "",
            })),
            contactIds: [] as string[],
            createdAt: now,
            updatedAt: now,
            createdBy: authorName,
            lastModifiedBy: authorName,
          };
          await db.upsertSequence(sequence);
          logAudit("created", "crm_sequence", sequence.id, name, { actorType: "agent", actorName: authorName }, `CRM sequence "${name}" created by ${authorName}`);
          return `Sequence created: **${name}** (${sequence.id.substring(0, 8)}…) | ${steps.length} steps | Status: draft`;
        }

        if (action === "update_sequence") {
          if (!sequenceId) return "Error: sequence_id required.";
          const s = await db.getSequence(sequenceId);
          if (!s) return "Error: Sequence not found.";
          const updates = args.updates as Record<string, any> || {};
          const updated = { ...s, ...updates, id: sequenceId, updatedAt: new Date().toISOString(), lastModifiedBy: authorName };
          await db.upsertSequence(updated);
          logAudit("updated", "crm_sequence", sequenceId, s.name, { actorType: "agent", actorName: authorName }, `CRM sequence "${s.name}" updated by ${authorName}`);
          return `Sequence **${s.name}** updated.`;
        }

        if (action === "delete_sequence") {
          if (!sequenceId) return "Error: sequence_id required.";
          const s = await db.getSequence(sequenceId);
          if (!s) return "Error: Sequence not found.";
          for (const cid of (s.contactIds || [])) {
            const contact = await db.getContact(cid);
            if (contact && contact.sequenceId === sequenceId) {
              contact.sequenceId = null;
              contact.sequenceStep = null;
              contact.sequenceStatus = undefined;
              contact.lastStepCompletedAt = undefined;
              contact.sequenceMetadata = undefined;
              contact.updatedAt = new Date().toISOString();
              await db.upsertContact(contact);
            }
          }
          await db.deleteSequence(sequenceId);
          logAudit("deleted", "crm_sequence", sequenceId, s.name, { actorType: "agent", actorName: authorName }, `CRM sequence "${s.name}" deleted by ${authorName}`);
          return `Sequence deleted: **${s.name}** (${sequenceId.substring(0, 8)}…). Enrolled contacts have been unenrolled.`;
        }

        if (action === "enroll_contacts") {
          if (!sequenceId) return "Error: sequence_id required.";
          const contactIds = args.contact_ids as string[];
          if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) return "Error: contact_ids array required.";
          const seq = await db.getSequence(sequenceId);
          if (!seq) return "Error: Sequence not found.";
          const existing = seq.contactIds || [];
          const newIds = contactIds.filter((id: string) => !existing.includes(id));
          seq.contactIds = [...existing, ...newIds];
          seq.updatedAt = new Date().toISOString();
          await db.upsertSequence(seq);
          for (const cid of newIds) {
            const contact = await db.getContact(cid);
            if (contact) {
              contact.sequenceId = seq.id;
              contact.sequenceStep = 0;
              contact.sequenceStatus = "active";
              contact.lastStepCompletedAt = new Date().toISOString();
              contact.updatedAt = new Date().toISOString();
              await db.upsertContact(contact);
              const analyzer = getIntelligenceAnalyzer?.();
              if (analyzer) {
                analyzer(contact).then(async (intel) => {
                  contact.contactIntelligence = intel;
                  contact.updatedAt = new Date().toISOString();
                  await db.upsertContact(contact);
                }).catch(() => {});
              }
            }
          }
          return `Enrolled ${newIds.length} contact(s) in sequence **${seq.name}**. Intelligence analysis triggered.`;
        }

        if (action === "unenroll_contacts") {
          if (!sequenceId) return "Error: sequence_id required.";
          const contactIds = args.contact_ids as string[];
          if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) return "Error: contact_ids array required.";
          const seq = await db.getSequence(sequenceId);
          if (!seq) return "Error: Sequence not found.";
          seq.contactIds = (seq.contactIds || []).filter((id: string) => !contactIds.includes(id));
          seq.updatedAt = new Date().toISOString();
          await db.upsertSequence(seq);
          for (const cid of contactIds) {
            const contact = await db.getContact(cid);
            if (contact && contact.sequenceId === seq.id) {
              contact.sequenceId = null;
              contact.sequenceStep = null;
              contact.sequenceStatus = undefined;
              contact.lastStepCompletedAt = undefined;
              contact.sequenceMetadata = undefined;
              contact.updatedAt = new Date().toISOString();
              await db.upsertContact(contact);
            }
          }
          return `Unenrolled ${contactIds.length} contact(s) from sequence **${seq.name}**.`;
        }

        if (action === "pause_contact") {
          if (!contactId) return "Error: contact_id required.";
          const contact = await db.getContact(contactId);
          if (!contact) return "Error: Contact not found.";
          if (sequenceId && contact.sequenceId !== sequenceId) return "Error: Contact is not enrolled in the specified sequence.";
          if (!contact.sequenceId) return "Error: Contact is not enrolled in any sequence.";
          contact.sequenceStatus = "paused";
          contact.updatedAt = new Date().toISOString();
          await db.upsertContact(contact);
          return `Contact ${contact.firstName} ${contact.lastName} paused in sequence.`;
        }

        if (action === "resume_contact") {
          if (!contactId) return "Error: contact_id required.";
          const contact = await db.getContact(contactId);
          if (!contact) return "Error: Contact not found.";
          if (sequenceId && contact.sequenceId !== sequenceId) return "Error: Contact is not enrolled in the specified sequence.";
          if (!contact.sequenceId) return "Error: Contact is not enrolled in any sequence.";
          contact.sequenceStatus = "active";
          contact.updatedAt = new Date().toISOString();
          await db.upsertContact(contact);
          return `Contact ${contact.firstName} ${contact.lastName} resumed in sequence.`;
        }

        if (action === "advance_contact") {
          if (!sequenceId) return "Error: sequence_id required.";
          if (!contactId) return "Error: contact_id required.";
          const seq = await db.getSequence(sequenceId);
          if (!seq) return "Error: Sequence not found.";
          const contact = await db.getContact(contactId);
          if (!contact) return "Error: Contact not found.";
          if (contact.sequenceId !== sequenceId) return "Error: Contact is not enrolled in this sequence.";
          const currentIdx = contact.sequenceStep || 0;
          const nextStep = currentIdx + 1;
          if (nextStep >= seq.steps.length) {
            contact.sequenceStatus = "completed";
            contact.sequenceStep = currentIdx;
          } else {
            contact.sequenceStep = nextStep;
          }
          contact.lastStepCompletedAt = new Date().toISOString();
          contact.updatedAt = new Date().toISOString();
          await db.upsertContact(contact);
          const stepDisplay = contact.sequenceStatus === "completed" ? "completed" : `step ${(contact.sequenceStep || 0) + 1}`;
          return `Contact ${contact.firstName} ${contact.lastName} advanced to ${stepDisplay} (status: ${contact.sequenceStatus}).`;
        }

        if (action === "complete_contact") {
          if (!contactId) return "Error: contact_id required.";
          const contact = await db.getContact(contactId);
          if (!contact) return "Error: Contact not found.";
          if (sequenceId && contact.sequenceId !== sequenceId) return "Error: Contact is not enrolled in the specified sequence.";
          if (!contact.sequenceId) return "Error: Contact is not enrolled in any sequence.";
          contact.sequenceStatus = "completed";
          contact.updatedAt = new Date().toISOString();
          await db.upsertContact(contact);
          return `Contact ${contact.firstName} ${contact.lastName} marked as completed in sequence.`;
        }

        if (action === "save_step_draft") {
          if (!contactId) return "Error: contact_id required.";
          if (!sequenceId) return "Error: sequence_id required.";
          const stepId = args.step_id as string;
          if (!stepId) return "Error: step_id required.";
          const contact = await db.getContact(contactId);
          if (!contact) return "Error: Contact not found.";
          if (contact.sequenceId !== sequenceId) return "Error: Contact is not enrolled in this sequence.";
          const draftType = (args.draft_type as string) || "email";
          const draft = {
            draft_type: draftType,
            subject: (args.subject as string) || "",
            body: (args.body as string) || "",
            notes: (args.notes as string) || "",
            savedAt: new Date().toISOString(),
            savedBy: authorName,
          };
          contact.sequenceMetadata = {
            ...(contact.sequenceMetadata || {}),
            [stepId]: { ...(contact.sequenceMetadata?.[stepId] || {}), draft },
          };
          contact.updatedAt = new Date().toISOString();
          await db.upsertContact(contact);
          return `Draft saved for contact ${contact.firstName} ${contact.lastName} at step ${stepId} (${draftType}).`;
        }

        if (action === "get_step_context") {
          if (!contactId) return "Error: contact_id required.";
          if (!sequenceId) return "Error: sequence_id required.";
          const contact = await db.getContact(contactId);
          if (!contact) return "Error: Contact not found.";
          if (contact.sequenceId !== sequenceId) return "Error: Contact is not enrolled in this sequence.";
          const seq = await db.getSequence(sequenceId);
          if (!seq) return "Error: Sequence not found.";
          const currentStepIndex = contact.sequenceStep ?? 0;
          const step = seq.steps[currentStepIndex];
          if (!step) return `Error: No step found at index ${currentStepIndex} in sequence.`;
          const stepMeta = contact.sequenceMetadata?.[step.id] || {};
          const draft = stepMeta.draft || null;
          const intel = contact.contactIntelligence || null;
          let result = `**Contact:** ${contact.firstName} ${contact.lastName} (${contact.email || "no email"})\n`;
          result += `**Company:** ${contact.company || "none"} | **Stage:** ${contact.stage || "lead"}\n`;
          result += `**Sequence:** ${seq.name} | **Step ${currentStepIndex + 1}/${seq.steps.length}:** [${step.type}] ${step.subject || step.instruction || "(no subject)"}\n`;
          result += `**Step ID:** ${step.id}\n`;
          if (step.content) result += `**Step Template Content:** ${step.content}\n`;
          if (step.instruction) result += `**Step Instruction:** ${step.instruction}\n`;
          if (step.delayDays) result += `**Delay:** ${step.delayDays} days\n`;
          result += `**Sequence Status:** ${contact.sequenceStatus || "n/a"}\n`;
          if (draft) {
            result += `\n--- SAVED DRAFT ---\n`;
            result += `Type: ${draft.draft_type} | Subject: ${draft.subject || "(none)"}\n`;
            result += `Body: ${draft.body || "(empty)"}\n`;
            if (draft.notes) result += `Notes: ${draft.notes}\n`;
            result += `Saved by: ${draft.savedBy} at ${draft.savedAt}\n`;
          } else {
            result += `\n--- NO DRAFT SAVED YET ---\n`;
          }
          if (intel) {
            result += `\n--- INTELLIGENCE REPORT ---\n`;
            result += typeof intel === "string" ? intel : JSON.stringify(intel, null, 2);
            result += `\n`;
          }
          return result;
        }

        if (action === "mark_step_done") {
          if (!contactId) return "Error: contact_id required.";
          if (!sequenceId) return "Error: sequence_id required.";
          const stepId = args.step_id as string;
          if (!stepId) return "Error: step_id required.";
          const contact = await db.getContact(contactId);
          if (!contact) return "Error: Contact not found.";
          if (contact.sequenceId !== sequenceId) return "Error: Contact is not enrolled in this sequence.";
          const seq = await db.getSequence(sequenceId);
          if (!seq) return "Error: Sequence not found.";
          const currentStepIndex = contact.sequenceStep ?? 0;
          const currentStepObj = seq.steps[currentStepIndex];
          if (!currentStepObj || currentStepObj.id !== stepId) {
            return `Error: step_id "${stepId}" does not match the contact's current step (step ${currentStepIndex + 1}, id: ${currentStepObj?.id || "none"}). Complete steps in order.`;
          }
          const actionTaken = (args.action_taken as string) || "Step completed";
          const notesText = (args.notes as string) || "";
          const activity = {
            id: crypto.randomUUID(),
            contactId,
            type: "sequence_step" as const,
            title: `Step done: ${currentStepObj.type} — ${actionTaken}`,
            description: notesText || `Step ${stepId} marked done by ${authorName}. Action: ${actionTaken}`,
            metadata: {
              sequenceId: seq.id,
              stepId,
              stepType: currentStepObj.type,
              actionTaken,
              ...(args.metadata as Record<string, any> || {}),
            },
            agentName: authorName,
            createdAt: new Date().toISOString(),
          };
          await db.addActivity(activity);
          contact.sequenceMetadata = {
            ...(contact.sequenceMetadata || {}),
            [stepId]: {
              ...(contact.sequenceMetadata?.[stepId] || {}),
              completedAt: new Date().toISOString(),
              completedBy: authorName,
              actionTaken,
            },
          };
          const nextStep = currentStepIndex + 1;
          if (nextStep >= seq.steps.length) {
            contact.sequenceStatus = "completed";
            contact.sequenceStep = currentStepIndex;
          } else {
            contact.sequenceStep = nextStep;
          }
          contact.lastStepCompletedAt = new Date().toISOString();
          contact.updatedAt = new Date().toISOString();
          await db.upsertContact(contact);
          return `Step marked done for ${contact.firstName} ${contact.lastName}. Action: ${actionTaken}. Advanced to step ${contact.sequenceStep ?? "completed"} (status: ${contact.sequenceStatus}).`;
        }

        return "Error: Invalid action.";
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    },
  };
}
