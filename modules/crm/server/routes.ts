import type { Express } from "express";
import crypto from "crypto";
import type { CrmDb } from "./db";

export type CrmAuditFn = (...args: any[]) => any;

export interface CrmRouteDeps {
  db: CrmDb;
  logAudit: CrmAuditFn;
  log: (msg: string, source: string) => void;
  runContactIntelligenceAnalysis: (contact: any) => Promise<any>;
  executeToolCall: (name: string, args: Record<string, any>, ctx: { agentName: string; agentRole: string }) => Promise<string>;
}

export function registerCrmRoutes(app: Express, deps: CrmRouteDeps) {
  const { db, logAudit, log, runContactIntelligenceAnalysis, executeToolCall } = deps;
  const USER_ACTOR = { actorType: "user", actorName: "User" };

  app.get("/api/crm/accounts", async (_req, res) => {
    try {
      const accounts = await db.getAccounts();
      res.json(accounts);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/accounts/:id", async (req, res) => {
    try {
      const account = await db.getAccount(req.params.id);
      if (!account) return res.status(404).json({ error: "Account not found" });
      res.json(account);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/accounts", async (req, res) => {
    try {
      const { name, domain, industry, description, website, size } = req.body;
      if (!name) return res.status(400).json({ error: "name required" });
      const now = new Date().toISOString();
      const account = { id: crypto.randomUUID(), name, domain: domain || "", industry: industry || "", description: description || "", website: website || "", size: size || "", createdAt: now, updatedAt: now, createdBy: "User", lastModifiedBy: "User" };
      await db.upsertAccount(account);
      logAudit("created", "crm_account", account.id, account.name, USER_ACTOR, `CRM account "${account.name}" created`);
      res.status(201).json(account);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/crm/accounts/:id", async (req, res) => {
    try {
      const existing = await db.getAccount(req.params.id);
      if (!existing) return res.status(404).json({ error: "Account not found" });
      const updated = { ...existing, ...req.body, id: req.params.id, updatedAt: new Date().toISOString(), lastModifiedBy: "User" };
      await db.upsertAccount(updated);
      logAudit("updated", "crm_account", updated.id, updated.name, USER_ACTOR, `CRM account "${updated.name}" updated`);
      res.json(updated);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/crm/accounts/:id", async (req, res) => {
    try {
      const account = await db.getAccount(req.params.id);
      await db.deleteAccount(req.params.id);
      logAudit("deleted", "crm_account", req.params.id, account?.name || req.params.id, USER_ACTOR, `CRM account "${account?.name || req.params.id}" deleted`);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/contacts", async (req, res) => {
    try {
      const accountId = req.query.accountId as string;
      const contacts = accountId ? await db.getContactsByAccount(accountId) : await db.getContacts();
      res.json(contacts);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/contacts/:id", async (req, res) => {
    try {
      const contact = await db.getContact(req.params.id);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      res.json(contact);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/contacts", async (req, res) => {
    try {
      const { firstName, lastName } = req.body;
      if (!firstName || !lastName) return res.status(400).json({ error: "firstName and lastName required" });
      const now = new Date().toISOString();
      const contact = {
        id: crypto.randomUUID(),
        accountId: req.body.accountId || null,
        firstName, lastName,
        email: req.body.email || "", phone: req.body.phone || "",
        title: req.body.title || "", company: req.body.company || "",
        linkedIn: req.body.linkedIn || "", twitter: req.body.twitter || "",
        website: req.body.website || "", notes: req.body.notes || "",
        tags: req.body.tags || [], stage: req.body.stage || "lead",
        sequenceId: null, sequenceStep: null,
        createdAt: now, updatedAt: now,
        createdBy: "User", lastModifiedBy: "User",
      };
      await db.upsertContact(contact);
      logAudit("created", "crm_contact", contact.id, `${contact.firstName} ${contact.lastName}`, USER_ACTOR, `CRM contact "${contact.firstName} ${contact.lastName}" created`);
      res.status(201).json(contact);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/crm/contacts/:id", async (req, res) => {
    try {
      const existing = await db.getContact(req.params.id);
      if (!existing) return res.status(404).json({ error: "Contact not found" });
      const updated = { ...existing, ...req.body, id: req.params.id, updatedAt: new Date().toISOString(), lastModifiedBy: "User" };
      await db.upsertContact(updated);
      logAudit("updated", "crm_contact", updated.id, `${updated.firstName} ${updated.lastName}`, USER_ACTOR, `CRM contact "${updated.firstName} ${updated.lastName}" updated`);
      res.json(updated);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/crm/contacts/:id", async (req, res) => {
    try {
      const contact = await db.getContact(req.params.id);
      await db.deleteContact(req.params.id);
      logAudit("deleted", "crm_contact", req.params.id, contact ? `${contact.firstName} ${contact.lastName}` : req.params.id, USER_ACTOR, `CRM contact deleted`);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/contacts/:id/comments", async (req, res) => {
    try {
      const comments = await db.getContactComments(req.params.id);
      res.json(comments);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/contacts/:id/comments", async (req, res) => {
    try {
      const { author, authorType, content } = req.body;
      if (!content || !author) return res.status(400).json({ error: "author and content required" });
      const validTypes = ["user", "agent", "queen"];
      const comment = {
        id: crypto.randomUUID(), contactId: req.params.id,
        author: String(author).substring(0, 100),
        authorType: validTypes.includes(authorType) ? authorType : "user",
        content: String(content).substring(0, 10000),
        createdAt: new Date().toISOString(),
      };
      await db.addContactComment(comment);
      res.json(comment);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/crm/comments/:id", async (req, res) => {
    try {
      await db.deleteContactComment(req.params.id);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/contacts/:id/activities", async (req, res) => {
    try {
      const activities = await db.getActivities(req.params.id);
      res.json(activities);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/contacts/:id/activities", async (req, res) => {
    try {
      const { type, title, description, metadata, agentName } = req.body;
      if (!type || !title) return res.status(400).json({ error: "type and title required" });
      const activity = {
        id: crypto.randomUUID(), contactId: req.params.id,
        type, title, description: description || "",
        metadata: metadata || {}, agentName: agentName || "",
        createdAt: new Date().toISOString(),
      };
      await db.addActivity(activity);
      res.json(activity);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/sequences", async (_req, res) => {
    try {
      const sequences = await db.getSequences();
      res.json(sequences);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/sequences/:id", async (req, res) => {
    try {
      const seq = await db.getSequence(req.params.id);
      if (!seq) return res.status(404).json({ error: "Sequence not found" });
      res.json(seq);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/sequences", async (req, res) => {
    try {
      const { name, description, steps } = req.body;
      if (!name) return res.status(400).json({ error: "name required" });
      const now = new Date().toISOString();
      const seq = {
        id: crypto.randomUUID(), name, description: description || "",
        status: "draft" as const, sequenceType: "contact" as const,
        steps: steps || [],
        contactIds: [], createdAt: now, updatedAt: now,
        createdBy: "User", lastModifiedBy: "User",
      };
      await db.upsertSequence(seq);
      logAudit("created", "crm_sequence", seq.id, seq.name, USER_ACTOR, `CRM sequence "${seq.name}" created`);
      res.status(201).json(seq);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/crm/sequences/:id", async (req, res) => {
    try {
      const existing = await db.getSequence(req.params.id);
      if (!existing) return res.status(404).json({ error: "Sequence not found" });
      const updated = { ...existing, ...req.body, id: req.params.id, updatedAt: new Date().toISOString(), lastModifiedBy: "User" };
      await db.upsertSequence(updated);
      logAudit("updated", "crm_sequence", updated.id, updated.name, USER_ACTOR, `CRM sequence "${updated.name}" updated`);
      res.json(updated);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/crm/sequences/:id", async (req, res) => {
    try {
      const seq = await db.getSequence(req.params.id);
      await db.deleteSequence(req.params.id);
      logAudit("deleted", "crm_sequence", req.params.id, seq?.name || req.params.id, USER_ACTOR, `CRM sequence deleted`);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/sequences/:id/enroll", async (req, res) => {
    try {
      const { contactIds } = req.body;
      if (!contactIds || !Array.isArray(contactIds)) return res.status(400).json({ error: "contactIds array required" });
      const seq = await db.getSequence(req.params.id);
      if (!seq) return res.status(404).json({ error: "Sequence not found" });
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
          runContactIntelligenceAnalysis(contact).then(async (intel) => {
            contact.contactIntelligence = intel;
            contact.updatedAt = new Date().toISOString();
            await db.upsertContact(contact);
            log(`Intelligence analysis completed for contact ${contact.firstName} ${contact.lastName}`, "sequence-engine");
          }).catch((err) => {
            log(`Intelligence analysis failed for contact ${cid}: ${err.message}`, "sequence-engine");
          });
        }
      }
      res.json({ enrolled: newIds.length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/sequences/:id/unenroll", async (req, res) => {
    try {
      const { contactIds } = req.body;
      if (!contactIds || !Array.isArray(contactIds)) return res.status(400).json({ error: "contactIds array required" });
      const seq = await db.getSequence(req.params.id);
      if (!seq) return res.status(404).json({ error: "Sequence not found" });
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
      res.json({ unenrolled: contactIds.length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/contacts/:id/intelligence", async (req, res) => {
    try {
      const contact = await db.getContact(req.params.id);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      res.json(contact.contactIntelligence || null);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/contacts/:id/analyze", async (req, res) => {
    try {
      const contact = await db.getContact(req.params.id);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      const intelligence = await runContactIntelligenceAnalysis(contact);
      contact.contactIntelligence = intelligence;
      contact.updatedAt = new Date().toISOString();
      await db.upsertContact(contact);
      res.json(intelligence);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/sequences/:id/pause-contact", async (req, res) => {
    try {
      const { contactId } = req.body;
      if (!contactId) return res.status(400).json({ error: "contactId required" });
      const contact = await db.getContact(contactId);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      contact.sequenceStatus = "paused";
      contact.updatedAt = new Date().toISOString();
      await db.upsertContact(contact);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/sequences/:id/resume-contact", async (req, res) => {
    try {
      const { contactId } = req.body;
      if (!contactId) return res.status(400).json({ error: "contactId required" });
      const contact = await db.getContact(contactId);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      contact.sequenceStatus = "active";
      contact.updatedAt = new Date().toISOString();
      await db.upsertContact(contact);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/sequences/:id/complete-contact", async (req, res) => {
    try {
      const { contactId } = req.body;
      if (!contactId) return res.status(400).json({ error: "contactId required" });
      const contact = await db.getContact(contactId);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      contact.sequenceStatus = "completed";
      contact.updatedAt = new Date().toISOString();
      await db.upsertContact(contact);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/sequences/:id/advance-contact", async (req, res) => {
    try {
      const { contactId } = req.body;
      if (!contactId) return res.status(400).json({ error: "contactId required" });
      const seq = await db.getSequence(req.params.id);
      if (!seq) return res.status(404).json({ error: "Sequence not found" });
      const contact = await db.getContact(contactId);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      const nextStep = (contact.sequenceStep || 0) + 1;
      if (nextStep >= seq.steps.length) {
        contact.sequenceStatus = "completed";
      } else {
        contact.sequenceStep = nextStep;
      }
      contact.lastStepCompletedAt = new Date().toISOString();
      contact.updatedAt = new Date().toISOString();
      await db.upsertContact(contact);
      const step = seq.steps[contact.sequenceStep || 0];
      if (step) {
        const activity = {
          id: crypto.randomUUID(),
          contactId,
          type: "sequence_step" as const,
          title: `Sequence step: ${step.type} (Step ${(contact.sequenceStep || 0) + 1})`,
          description: step.instruction || step.content || step.subject || "",
          metadata: { sequenceId: seq.id, stepId: step.id, stepType: step.type },
          agentName: "Sequence Engine",
          createdAt: new Date().toISOString(),
        };
        await db.addActivity(activity);
      }
      res.json({ step: contact.sequenceStep, status: contact.sequenceStatus });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/accounts/:id/sequences", async (req, res) => {
    try {
      const sequences = await db.getSequencesByAccount(req.params.id);
      res.json(sequences);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/accounts/:id/sequences", async (req, res) => {
    try {
      const account = await db.getAccount(req.params.id);
      if (!account) return res.status(404).json({ error: "Account not found" });
      const { name, description, steps, roleTargeting, contactIds } = req.body;
      if (!name) return res.status(400).json({ error: "name required" });
      const now = new Date().toISOString();
      const seq = {
        id: crypto.randomUUID(),
        name,
        description: description || "",
        status: "draft" as const,
        sequenceType: "account" as const,
        accountId: req.params.id,
        roleTargeting: roleTargeting || {},
        steps: steps || [],
        contactIds: contactIds || [],
        createdAt: now,
        updatedAt: now,
      };
      await db.upsertSequence(seq);
      res.status(201).json(seq);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/sequences/:id/activate", async (req, res) => {
    try {
      const seq = await db.getSequence(req.params.id);
      if (!seq) return res.status(404).json({ error: "Sequence not found" });
      seq.status = "active";
      seq.updatedAt = new Date().toISOString();
      await db.upsertSequence(seq);

      if (seq.sequenceType === "account" && seq.accountId) {
        const accountContacts = await db.getContactsByAccount(seq.accountId);
        const candidateIds = seq.contactIds && seq.contactIds.length > 0
          ? seq.contactIds
          : accountContacts.map((c: any) => c.id);

        const hasRoleTargeting = seq.roleTargeting && Object.keys(seq.roleTargeting).length > 0;

        for (const cid of candidateIds) {
          const contact = await db.getContact(cid);
          if (!contact) continue;

          if (hasRoleTargeting) {
            const contactTitle = (contact.title || "").toLowerCase();
            const roleKey = Object.keys(seq.roleTargeting!).find(role =>
              contactTitle.includes(role.toLowerCase())
            );
            if (!roleKey) {
              log(`Skipping contact ${contact.firstName} ${contact.lastName} — title "${contact.title}" does not match any role target`, "sequence-engine");
              continue;
            }
            contact.sequenceMetadata = {
              ...(contact.sequenceMetadata || {}),
              roleTargetingApplied: roleKey,
              roleMessaging: seq.roleTargeting![roleKey],
            };
          }

          contact.sequenceId = seq.id;
          contact.sequenceStep = contact.sequenceStep ?? 0;
          contact.sequenceStatus = "active";
          contact.lastStepCompletedAt = contact.lastStepCompletedAt || new Date().toISOString();
          contact.updatedAt = new Date().toISOString();
          await db.upsertContact(contact);

          if (!seq.contactIds?.includes(cid)) {
            seq.contactIds = [...(seq.contactIds || []), cid];
          }

          runContactIntelligenceAnalysis(contact).then(async (intel) => {
            contact.contactIntelligence = intel;
            contact.updatedAt = new Date().toISOString();
            await db.upsertContact(contact);
          }).catch(() => {});
        }
        await db.upsertSequence(seq);
      } else {
        for (const cid of (seq.contactIds || [])) {
          const contact = await db.getContact(cid);
          if (contact && !contact.sequenceStatus) {
            contact.sequenceStatus = "active";
            contact.lastStepCompletedAt = contact.lastStepCompletedAt || new Date().toISOString();
            contact.updatedAt = new Date().toISOString();
            await db.upsertContact(contact);
          }
        }
      }
      res.json(seq);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
}
