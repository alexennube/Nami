import crypto from "crypto";
import type { KanbanDb } from "./db";

export type KanbanToolAuditFn = (...args: any[]) => any;

export function createKanbanTool(db: KanbanDb, logAudit: KanbanToolAuditFn) {
  return {
    name: "kanban",
    description: "Full Kanban board management. Create, update, delete, and move cards. Create, rename, and delete columns. List cards/columns, read and post comments. Use this to manage project tasks on the Kanban board.",
    category: "system",
    enabled: true,
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Action to perform on the Kanban board",
          enum: ["list_cards", "list_columns", "create_card", "update_card", "delete_card", "move_card", "create_column", "rename_column", "delete_column", "read_comments", "comment"],
        },
        card_id: {
          type: "string",
          description: "ID of the kanban card (required for update_card, delete_card, move_card, read_comments, comment)",
        },
        column_id: {
          type: "string",
          description: "ID of the column (required for create_card, move_card, rename_column, delete_column)",
        },
        title: {
          type: "string",
          description: "Title for card or column (required for create_card, create_column)",
        },
        description: {
          type: "string",
          description: "Description for the card (optional for create_card, update_card)",
        },
        priority: {
          type: "string",
          description: "Priority level: low, medium, high (optional for create_card, update_card)",
          enum: ["low", "medium", "high"],
        },
        status: {
          type: "string",
          description: "Status: not_started, in_progress, blocked, done (optional for create_card, update_card)",
          enum: ["not_started", "in_progress", "blocked", "done"],
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Labels for the card (optional for create_card, update_card)",
        },
        content: {
          type: "string",
          description: "Comment text to post (required for 'comment' action). Supports markdown.",
        },
      },
      required: ["action"],
    },
    execute: async (args: Record<string, any>, agentContext?: { agentName?: string; agentRole?: string }) => {
      const action = args.action as string;
      const cardId = args.card_id as string;
      const columnId = args.column_id as string;
      const title = args.title as string;
      const description = args.description as string | undefined;
      const priority = args.priority as string | undefined;
      const status = args.status as string | undefined;
      const labels = args.labels as string[] | undefined;
      const content = args.content as string;
      const authorName = agentContext?.agentName || "Nami";
      const authorType = (agentContext?.agentRole === "queen" || agentContext?.agentRole === "swarm_queen") ? "queen" : "agent";

      try {
        if (action === "list_columns") {
          const columns = await db.getColumns();
          if (columns.length === 0) return "No kanban columns found. Create one first with create_column.";
          return columns.map((c: any) => `- **${c.title}** (ID: ${c.id}) | Order: ${c.order}`).join("\n");
        }

        if (action === "list_cards") {
          const cards = await db.getCards();
          if (cards.length === 0) return "No kanban cards found.";
          return cards.map((c: any) => `- **${c.title}** (ID: ${c.id})\n  Column: ${c.columnId} | Priority: ${c.priority || "medium"} | Status: ${c.status || "not_started"}\n  ${c.description || "(no description)"}`).join("\n\n");
        }

        if (action === "create_card") {
          if (!columnId) return "Error: column_id is required for create_card.";
          if (!title) return "Error: title is required for create_card.";
          const cards = await db.getCards();
          const colCards = cards.filter((c: any) => c.columnId === columnId);
          const now = new Date().toISOString();
          const card = {
            id: crypto.randomUUID(),
            columnId,
            title,
            description: description || "",
            order: colCards.length,
            priority: priority || "medium",
            status: status || "not_started",
            labels: labels || [],
            createdAt: now,
            updatedAt: now,
            createdBy: authorName,
            lastModifiedBy: authorName,
          };
          await db.upsertCard(card);
          logAudit("created", "kanban_card", card.id, title, { actorType: "agent", actorName: authorName }, `Card "${title}" created by ${authorName}`);
          return `Card created: **${title}** (ID: ${card.id}) in column ${columnId}.`;
        }

        if (action === "update_card") {
          if (!cardId) return "Error: card_id is required for update_card.";
          const cards = await db.getCards();
          const card = cards.find((c: any) => c.id === cardId);
          if (!card) return `Error: Card ${cardId} not found.`;
          const updated = {
            ...card,
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(priority !== undefined && { priority }),
            ...(status !== undefined && { status }),
            ...(labels !== undefined && { labels }),
            updatedAt: new Date().toISOString(),
            lastModifiedBy: authorName,
          };
          await db.upsertCard(updated);
          logAudit("updated", "kanban_card", cardId, updated.title, { actorType: "agent", actorName: authorName }, `Card "${updated.title}" updated by ${authorName}`);
          return `Card updated: **${updated.title}** (ID: ${cardId}).`;
        }

        if (action === "delete_card") {
          if (!cardId) return "Error: card_id is required for delete_card.";
          const cards = await db.getCards();
          const deletedCard = cards.find((c: any) => c.id === cardId);
          await db.deleteCard(cardId);
          logAudit("deleted", "kanban_card", cardId, deletedCard?.title || cardId, { actorType: "agent", actorName: authorName }, `Card "${deletedCard?.title || cardId}" deleted by ${authorName}`);
          return `Card ${cardId} deleted.`;
        }

        if (action === "move_card") {
          if (!cardId) return "Error: card_id is required for move_card.";
          if (!columnId) return "Error: column_id is required for move_card.";
          const cards = await db.getCards();
          const card = cards.find((c: any) => c.id === cardId);
          if (!card) return `Error: Card ${cardId} not found.`;
          const targetCards = cards.filter((c: any) => c.columnId === columnId && c.id !== cardId).sort((a: any, b: any) => a.order - b.order);
          const movedCard = { ...card, columnId, order: targetCards.length, updatedAt: new Date().toISOString() };
          await db.upsertCard(movedCard);
          return `Card **${card.title}** moved to column ${columnId}.`;
        }

        if (action === "create_column") {
          if (!title) return "Error: title is required for create_column.";
          const columns = await db.getColumns();
          const col = {
            id: crypto.randomUUID(),
            title,
            order: columns.length,
          };
          await db.upsertColumn(col);
          return `Column created: **${title}** (ID: ${col.id}).`;
        }

        if (action === "rename_column") {
          if (!columnId) return "Error: column_id is required for rename_column.";
          if (!title) return "Error: title is required for rename_column.";
          const columns = await db.getColumns();
          const col = columns.find((c: any) => c.id === columnId);
          if (!col) return `Error: Column ${columnId} not found.`;
          const updated = { ...col, title };
          await db.upsertColumn(updated);
          return `Column renamed to **${title}**.`;
        }

        if (action === "delete_column") {
          if (!columnId) return "Error: column_id is required for delete_column.";
          await db.deleteColumn(columnId);
          return `Column ${columnId} deleted.`;
        }

        if (action === "read_comments") {
          if (!cardId) return "Error: card_id is required for read_comments.";
          const comments = await db.getComments(cardId);
          if (comments.length === 0) return "No comments on this card yet.";
          return comments.map((c: any) => `**${c.author}** (${c.authorType}) — ${new Date(c.createdAt).toLocaleString()}:\n${c.content}`).join("\n\n---\n\n");
        }

        if (action === "comment") {
          if (!cardId) return "Error: card_id is required for comment.";
          if (!content) return "Error: content is required for comment.";
          const comment = {
            id: crypto.randomUUID(),
            cardId,
            author: authorName,
            authorType,
            content,
            createdAt: new Date().toISOString(),
          };
          await db.addComment(comment);
          return `Comment posted on card ${cardId.substring(0, 8)}… by ${authorName}.`;
        }

        return "Error: Invalid action. Use list_cards, list_columns, create_card, update_card, delete_card, move_card, create_column, rename_column, delete_column, read_comments, or comment.";
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    },
  };
}
