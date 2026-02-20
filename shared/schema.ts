import { z } from "zod";

export const AgentStatus = z.enum(["idle", "running", "paused", "completed", "failed", "terminated"]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const AgentRole = z.enum(["nami", "spawn", "swarm_queen"]);
export type AgentRole = z.infer<typeof AgentRole>;

export const SwarmStatus = z.enum(["pending", "active", "paused", "completed", "failed"]);
export type SwarmStatus = z.infer<typeof SwarmStatus>;

export const StepStatus = z.enum(["pending", "running", "completed", "failed", "skipped"]);
export type StepStatus = z.infer<typeof StepStatus>;

export const StepType = z.enum(["prompt", "code"]);
export type StepType = z.infer<typeof StepType>;

export const EngineState = z.enum(["running", "paused", "stopped"]);
export type EngineState = z.infer<typeof EngineState>;

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

export const swarmStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: StepType,
  instruction: z.string(),
  status: StepStatus,
  agentId: z.string().nullable(),
  output: z.any().nullable(),
  order: z.number(),
});
export type SwarmStep = z.infer<typeof swarmStepSchema>;

export const swarmSchema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  objective: z.string(),
  status: SwarmStatus,
  queenId: z.string().nullable(),
  agentIds: z.array(z.string()),
  steps: z.array(swarmStepSchema),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  progress: z.number().default(0),
  maxCycles: z.number().optional(),
});
export type Swarm = z.infer<typeof swarmSchema>;

export const insertSwarmStepSchema = z.object({
  name: z.string(),
  type: StepType,
  instruction: z.string(),
  agentId: z.string().nullable().optional(),
});

export const insertSwarmSchema = z.object({
  name: z.string(),
  goal: z.string(),
  objective: z.string(),
  status: SwarmStatus,
  steps: z.array(insertSwarmStepSchema).optional(),
  maxCycles: z.number().optional(),
});
export type InsertSwarm = z.infer<typeof insertSwarmSchema>;

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

export const swarmMessageSchema = z.object({
  id: z.string(),
  swarmId: z.string(),
  agentId: z.string().nullable(),
  agentName: z.string(),
  content: z.string(),
  type: z.enum(["queen_thinking", "spawn_created", "spawn_result", "queen_review", "queen_decision", "system", "error", "completion"]),
  timestamp: z.string(),
});
export type SwarmMessage = z.infer<typeof swarmMessageSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  agentId: z.string().nullable(),
  agentName: z.string().nullable(),
  timestamp: z.string(),
  tokensUsed: z.number().default(0),
  autonomous: z.boolean().default(false),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const pinnedChatSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  messageId: z.string().nullable(),
  pinnedAt: z.string(),
  pinnedBy: z.enum(["user", "nami"]),
  category: z.string().default("general"),
});
export type PinnedChat = z.infer<typeof pinnedChatSchema>;

export const insertPinnedChatSchema = pinnedChatSchema.omit({ id: true, pinnedAt: true });
export type InsertPinnedChat = z.infer<typeof insertPinnedChatSchema>;

export const thoughtSchema = z.object({
  id: z.string(),
  content: z.string(),
  source: z.string(),
  timestamp: z.string(),
  type: z.enum(["reasoning", "planning", "reflection", "observation", "action"]),
});
export type Thought = z.infer<typeof thoughtSchema>;

export const memorySchema = z.object({
  id: z.string(),
  content: z.string(),
  category: z.string(),
  importance: z.number().default(0),
  createdAt: z.string(),
  lastAccessedAt: z.string(),
});
export type Memory = z.infer<typeof memorySchema>;

export const skillSchema = z.object({
  id: z.string(),
  name: z.string(),
  content: z.string(),
  category: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Skill = z.infer<typeof skillSchema>;

export const heartbeatConfigSchema = z.object({
  enabled: z.boolean().default(false),
  intervalSeconds: z.number().default(30),
  instruction: z.string().default("Check on the status of all agents and swarms. If idle, report a sleep state. If active, provide a brief progress update."),
  maxBeats: z.number().default(0),
  totalBeats: z.number().default(0),
});
export type HeartbeatConfig = z.infer<typeof heartbeatConfigSchema>;

export const heartbeatLogSchema = z.object({
  id: z.string(),
  beatNumber: z.number(),
  status: z.enum(["active", "sleep", "error"]),
  attempts: z.number().default(1),
  summary: z.string(),
  details: z.array(z.object({
    attempt: z.number(),
    action: z.string(),
    result: z.string(),
    tokensUsed: z.number(),
  })),
  totalTokens: z.number().default(0),
  timestamp: z.string(),
  duration: z.number().default(0),
});
export type HeartbeatLog = z.infer<typeof heartbeatLogSchema>;

export const engineStatusSchema = z.object({
  state: EngineState,
  heartbeatCount: z.number(),
  idleCount: z.string(),
  uptime: z.number(),
  currentModel: z.string(),
});
export type EngineStatus = z.infer<typeof engineStatusSchema>;

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
  swarmQueenModel: z.string().default(""),
  engineMindModel: z.string().default(""),
  engineMindEnabled: z.boolean().default(false),
  siteUrl: z.string().default("https://agentnami.com"),
  siteName: z.string().default("AgentNami"),
  maxConcurrentAgents: z.number().default(10),
  maxTokensPerRequest: z.number().default(4096),
  temperature: z.number().default(0.7),
});

export const engineMindStatusSchema = z.object({
  initialized: z.boolean(),
  sessionActive: z.boolean(),
  model: z.string(),
  totalPrompts: z.number().default(0),
  totalCompactions: z.number().default(0),
  totalToolExecutions: z.number().default(0),
  totalSelfHeals: z.number().default(0),
  lastActivity: z.string().nullable(),
  errors: z.array(z.string()).default([]),
});
export type EngineMindStatus = z.infer<typeof engineMindStatusSchema>;
export type NamiConfig = z.infer<typeof namiConfigSchema>;

export const systemStatsSchema = z.object({
  totalAgents: z.number(),
  activeAgents: z.number(),
  totalSwarms: z.number(),
  activeSwarms: z.number(),
  totalTokensUsed: z.number(),
  totalMessagesProcessed: z.number(),
  uptime: z.number(),
});
export type SystemStats = z.infer<typeof systemStatsSchema>;

export const eventSchema = z.object({
  id: z.string(),
  type: z.enum(["agent_created", "agent_status_changed", "swarm_created", "swarm_completed", "step_completed", "message_sent", "heartbeat", "thought", "error", "system"]),
  payload: z.record(z.any()),
  timestamp: z.string(),
  source: z.string(),
});
export type NamiEvent = z.infer<typeof eventSchema>;

export type User = { id: string; username: string; password: string };
export type InsertUser = { username: string; password: string };
