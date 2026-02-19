import { z } from "zod";

export const AgentStatus = z.enum(["idle", "running", "paused", "completed", "failed", "terminated"]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const AgentRole = z.enum(["nami", "spawn", "swarm_queen"]);
export type AgentRole = z.infer<typeof AgentRole>;

export const SwarmStatus = z.enum(["pending", "active", "paused", "completed", "failed"]);
export type SwarmStatus = z.infer<typeof SwarmStatus>;

export const WorkflowStepStatus = z.enum(["pending", "running", "completed", "failed", "skipped"]);
export type WorkflowStepStatus = z.infer<typeof WorkflowStepStatus>;

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: AgentRole,
  status: AgentStatus,
  model: z.string(),
  systemPrompt: z.string(),
  parentId: z.string().nullable(),
  swarmId: z.string().nullable(),
  createdAt: z.string(),
  lastActiveAt: z.string(),
  tokensUsed: z.number().default(0),
  messagesProcessed: z.number().default(0),
});
export type Agent = z.infer<typeof agentSchema>;

export const insertAgentSchema = agentSchema.omit({ id: true, createdAt: true, lastActiveAt: true, tokensUsed: true, messagesProcessed: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;

export const swarmSchema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  objective: z.string(),
  status: SwarmStatus,
  queenId: z.string().nullable(),
  agentIds: z.array(z.string()),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  progress: z.number().default(0),
});
export type Swarm = z.infer<typeof swarmSchema>;

export const insertSwarmSchema = swarmSchema.omit({ id: true, createdAt: true, completedAt: true, queenId: true, agentIds: true, progress: true });
export type InsertSwarm = z.infer<typeof insertSwarmSchema>;

export const workflowStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: WorkflowStepStatus,
  agentId: z.string().nullable(),
  input: z.any().nullable(),
  output: z.any().nullable(),
  order: z.number(),
});
export type WorkflowStep = z.infer<typeof workflowStepSchema>;

export const workflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  steps: z.array(workflowStepSchema),
  status: SwarmStatus,
  swarmId: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type Workflow = z.infer<typeof workflowSchema>;

export const insertWorkflowStepSchema = workflowStepSchema.omit({ id: true }).extend({ id: z.string().optional() });

export const insertWorkflowSchema = z.object({
  name: z.string(),
  description: z.string(),
  steps: z.array(insertWorkflowStepSchema),
  swarmId: z.string().nullable(),
});
export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;

export const agentMessageSchema = z.object({
  id: z.string(),
  fromAgentId: z.string(),
  toAgentId: z.string().nullable(),
  swarmId: z.string().nullable(),
  content: z.string(),
  role: z.enum(["system", "user", "assistant", "tool"]),
  timestamp: z.string(),
  metadata: z.record(z.any()).optional(),
});
export type AgentMessage = z.infer<typeof agentMessageSchema>;

export const toolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.any()),
  enabled: z.boolean().default(true),
});
export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;

export const namiConfigSchema = z.object({
  openRouterApiKey: z.string().optional(),
  defaultModel: z.string().default("openai/gpt-4o"),
  siteUrl: z.string().default("https://agentnami.com"),
  siteName: z.string().default("AgentNami"),
  maxConcurrentAgents: z.number().default(10),
  maxTokensPerRequest: z.number().default(4096),
  temperature: z.number().default(0.7),
});
export type NamiConfig = z.infer<typeof namiConfigSchema>;

export const systemStatsSchema = z.object({
  totalAgents: z.number(),
  activeAgents: z.number(),
  totalSwarms: z.number(),
  activeSwarms: z.number(),
  totalWorkflows: z.number(),
  totalTokensUsed: z.number(),
  totalMessagesProcessed: z.number(),
  uptime: z.number(),
});
export type SystemStats = z.infer<typeof systemStatsSchema>;

export const eventSchema = z.object({
  id: z.string(),
  type: z.enum(["agent_created", "agent_status_changed", "swarm_created", "swarm_completed", "workflow_step_completed", "message_sent", "error", "system"]),
  payload: z.record(z.any()),
  timestamp: z.string(),
  source: z.string(),
});
export type NamiEvent = z.infer<typeof eventSchema>;

export type User = { id: string; username: string; password: string };
export type InsertUser = { username: string; password: string };
