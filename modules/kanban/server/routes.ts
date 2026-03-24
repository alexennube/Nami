import type { Express } from "express";
import crypto from "crypto";
import type { KanbanDb } from "./db";

export type KanbanAuditFn = (...args: any[]) => any;

export function registerKanbanRoutes(app: Express, db: KanbanDb, logAudit: KanbanAuditFn) {
  const USER_ACTOR = { actorType: "user", actorName: "User" };

  app.get("/api/kanban", async (_req, res) => {
    try {
      const columns = await db.getColumns();
      const cards = await db.getCards();
      if (columns.length === 0) {
        const defaultColumns = [
          { id: crypto.randomUUID(), title: "To Do", order: 0 },
          { id: crypto.randomUUID(), title: "In Progress", order: 1 },
          { id: crypto.randomUUID(), title: "Done", order: 2 },
        ];
        for (const col of defaultColumns) await db.upsertColumn(col);
        res.json({ columns: defaultColumns, cards: [] });
      } else {
        res.json({ columns, cards });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kanban/columns", async (req, res) => {
    try {
      const { title } = req.body;
      if (!title) return res.status(400).json({ error: "title required" });
      const columns = await db.getColumns();
      const col = { id: crypto.randomUUID(), title, order: columns.length };
      await db.upsertColumn(col);
      res.json(col);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/kanban/columns/:id", async (req, res) => {
    try {
      const columns = await db.getColumns();
      const col = columns.find(c => c.id === req.params.id);
      if (!col) return res.status(404).json({ error: "Column not found" });
      const updated = { ...col, ...req.body, id: req.params.id };
      await db.upsertColumn(updated);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/kanban/columns/:id", async (req, res) => {
    try {
      await db.deleteColumn(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kanban/cards", async (req, res) => {
    try {
      const { columnId, title, description, priority, labels } = req.body;
      if (!columnId || !title) return res.status(400).json({ error: "columnId and title required" });
      const cards = await db.getCards();
      const colCards = cards.filter(c => c.columnId === columnId);
      const now = new Date().toISOString();
      const card = {
        id: crypto.randomUUID(),
        columnId,
        title,
        description: description || "",
        order: colCards.length,
        priority: priority || "medium",
        status: req.body.status || "not_started",
        labels: labels || [],
        createdAt: now,
        updatedAt: now,
        createdBy: "User",
        lastModifiedBy: "User",
      };
      await db.upsertCard(card);
      logAudit("created", "kanban_card", card.id, card.title, USER_ACTOR, `Card "${card.title}" created`);
      res.json(card);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/kanban/cards/:id", async (req, res) => {
    try {
      const cards = await db.getCards();
      const card = cards.find(c => c.id === req.params.id);
      if (!card) return res.status(404).json({ error: "Card not found" });
      const updated = { ...card, ...req.body, id: req.params.id, updatedAt: new Date().toISOString(), lastModifiedBy: "User" };
      await db.upsertCard(updated);
      logAudit("updated", "kanban_card", updated.id, updated.title, USER_ACTOR, `Card "${updated.title}" updated`);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/kanban/cards/:id", async (req, res) => {
    try {
      const cards = await db.getCards();
      const card = cards.find((c: any) => c.id === req.params.id);
      await db.deleteCommentsByCard(req.params.id);
      await db.deleteCard(req.params.id);
      logAudit("deleted", "kanban_card", req.params.id, card?.title || req.params.id, USER_ACTOR, `Card "${card?.title || req.params.id}" deleted`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/kanban/cards/:id/comments", async (req, res) => {
    try {
      const comments = await db.getComments(req.params.id);
      res.json(comments);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kanban/cards/:id/comments", async (req, res) => {
    try {
      const { author, authorType, content } = req.body;
      if (!content || !author) return res.status(400).json({ error: "author and content required" });
      const validTypes = ["user", "agent", "queen"];
      const safeAuthorType = validTypes.includes(authorType) ? authorType : "user";
      const cards = await db.getCards();
      if (!cards.find((c: any) => c.id === req.params.id)) {
        return res.status(404).json({ error: "Card not found" });
      }
      const comment = {
        id: crypto.randomUUID(),
        cardId: req.params.id,
        author: String(author).substring(0, 100),
        authorType: safeAuthorType,
        content: String(content).substring(0, 10000),
        createdAt: new Date().toISOString(),
      };
      await db.addComment(comment);
      res.json(comment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/kanban/comments/:id", async (req, res) => {
    try {
      await db.deleteComment(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/kanban/cards/:id/move", async (req, res) => {
    try {
      const { columnId, order } = req.body;
      if (!columnId || order === undefined) return res.status(400).json({ error: "columnId and order required" });
      const cards = await db.getCards();
      const card = cards.find(c => c.id === req.params.id);
      if (!card) return res.status(404).json({ error: "Card not found" });
      const targetCards = cards.filter(c => c.columnId === columnId && c.id !== req.params.id).sort((a, b) => a.order - b.order);
      targetCards.splice(order, 0, { ...card, columnId, updatedAt: new Date().toISOString() });
      for (let i = 0; i < targetCards.length; i++) {
        targetCards[i].order = i;
        await db.upsertCard(targetCards[i]);
      }
      if (card.columnId !== columnId) {
        const oldCards = cards.filter(c => c.columnId === card.columnId && c.id !== req.params.id).sort((a, b) => a.order - b.order);
        for (let i = 0; i < oldCards.length; i++) {
          oldCards[i].order = i;
          await db.upsertCard(oldCards[i]);
        }
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/kanban/columns/reorder", async (req, res) => {
    try {
      const { columnIds } = req.body;
      if (!columnIds || !Array.isArray(columnIds)) return res.status(400).json({ error: "columnIds array required" });
      const columns = await db.getColumns();
      for (let i = 0; i < columnIds.length; i++) {
        const col = columns.find(c => c.id === columnIds[i]);
        if (col) {
          col.order = i;
          await db.upsertColumn(col);
        }
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
