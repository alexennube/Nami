import { z } from "zod";

export const kanbanColumnSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number(),
});
export type KanbanColumn = z.infer<typeof kanbanColumnSchema>;

export const kanbanCardSchema = z.object({
  id: z.string(),
  columnId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  order: z.number(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["not_started", "in_progress", "blocked", "done"]).optional(),
  labels: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().nullable().default(null),
  lastModifiedBy: z.string().nullable().default(null),
});
export type KanbanCard = z.infer<typeof kanbanCardSchema>;

export const kanbanBoardSchema = z.object({
  columns: z.array(kanbanColumnSchema),
  cards: z.array(kanbanCardSchema),
});
export type KanbanBoard = z.infer<typeof kanbanBoardSchema>;

export const kanbanCommentSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  author: z.string(),
  authorType: z.enum(["user", "agent", "queen"]),
  content: z.string(),
  createdAt: z.string(),
});
export type KanbanComment = z.infer<typeof kanbanCommentSchema>;
