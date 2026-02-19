import type { Agent, InsertAgent, Swarm, InsertSwarm, NamiEvent, NamiConfig, SystemStats, AgentMessage, ChatMessage, Thought, Memory, HeartbeatConfig, HeartbeatLog, EngineState } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
  createAgent(agent: InsertAgent): Promise<Agent>;
  updateAgent(id: string, updates: Partial<Agent>): Promise<Agent | undefined>;
  deleteAgent(id: string): Promise<boolean>;

  getSwarms(): Promise<Swarm[]>;
  getSwarm(id: string): Promise<Swarm | undefined>;
  createSwarm(swarm: InsertSwarm): Promise<Swarm>;
  updateSwarm(id: string, updates: Partial<Swarm>): Promise<Swarm | undefined>;
  deleteSwarm(id: string): Promise<boolean>;

  getEvents(): Promise<NamiEvent[]>;
  addEvent(event: Omit<NamiEvent, "id" | "timestamp">): Promise<NamiEvent>;

  getConfig(): Promise<NamiConfig>;
  updateConfig(updates: Partial<NamiConfig>): Promise<NamiConfig>;

  getStats(): Promise<SystemStats>;

  getMessages(agentId?: string, swarmId?: string): Promise<AgentMessage[]>;
  addMessage(message: Omit<AgentMessage, "id" | "timestamp">): Promise<AgentMessage>;

  getChatHistory(): Promise<ChatMessage[]>;
  addChatMessage(message: Omit<ChatMessage, "id" | "timestamp">): Promise<ChatMessage>;
  clearChatHistory(): Promise<void>;

  getThoughts(): Promise<Thought[]>;
  addThought(thought: Omit<Thought, "id" | "timestamp">): Promise<Thought>;
  clearThoughts(): Promise<void>;

  getMemories(): Promise<Memory[]>;
  addMemory(memory: Omit<Memory, "id" | "createdAt" | "lastAccessedAt">): Promise<Memory>;
  updateMemory(id: string, updates: Partial<Memory>): Promise<Memory | undefined>;
  deleteMemory(id: string): Promise<boolean>;

  getHeartbeatConfig(): Promise<HeartbeatConfig>;
  updateHeartbeatConfig(updates: Partial<HeartbeatConfig>): Promise<HeartbeatConfig>;

  getHeartbeatLogs(): Promise<HeartbeatLog[]>;
  addHeartbeatLog(log: Omit<HeartbeatLog, "id">): Promise<HeartbeatLog>;

  getEngineState(): Promise<EngineState>;
  setEngineState(state: EngineState): Promise<EngineState>;
}

export class MemStorage implements IStorage {
  private agents: Map<string, Agent> = new Map();
  private swarms: Map<string, Swarm> = new Map();
  private events: NamiEvent[] = [];
  private messages: AgentMessage[] = [];
  private chatHistory: ChatMessage[] = [];
  private thoughts: Thought[] = [];
  private memories: Map<string, Memory> = new Map();
  private heartbeatLogs: HeartbeatLog[] = [];
  private heartbeatConfig: HeartbeatConfig = {
    enabled: false,
    intervalSeconds: 30,
    instruction: "Check on the status of all agents and swarms. If idle, report a sleep state. If active, provide a brief progress update.",
    maxBeats: 0,
    totalBeats: 0,
  };
  private engineState: EngineState = "stopped";
  private config: NamiConfig = {
    openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
    defaultModel: "openai/gpt-4o",
    siteUrl: "https://agentnami.com",
    siteName: "AgentNami",
    maxConcurrentAgents: 10,
    maxTokensPerRequest: 4096,
    temperature: 0.7,
  };
  private startTime = Date.now();

  async getAgents(): Promise<Agent[]> {
    return Array.from(this.agents.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    return this.agents.get(id);
  }

  async createAgent(data: InsertAgent): Promise<Agent> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const agent: Agent = { ...data, id, createdAt: now, lastActiveAt: now, tokensUsed: 0, messagesProcessed: 0 };
    this.agents.set(id, agent);
    return agent;
  }

  async updateAgent(id: string, updates: Partial<Agent>): Promise<Agent | undefined> {
    const agent = this.agents.get(id);
    if (!agent) return undefined;
    const updated = { ...agent, ...updates, lastActiveAt: new Date().toISOString() };
    this.agents.set(id, updated);
    return updated;
  }

  async deleteAgent(id: string): Promise<boolean> {
    return this.agents.delete(id);
  }

  async getSwarms(): Promise<Swarm[]> {
    return Array.from(this.swarms.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getSwarm(id: string): Promise<Swarm | undefined> {
    return this.swarms.get(id);
  }

  async createSwarm(data: InsertSwarm): Promise<Swarm> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const steps = (data.steps || []).map((s, i) => ({
      id: randomUUID(),
      name: s.name,
      type: s.type,
      instruction: s.instruction,
      status: "pending" as const,
      agentId: s.agentId || null,
      output: null,
      order: i,
    }));
    const swarm: Swarm = {
      id,
      name: data.name,
      goal: data.goal,
      objective: data.objective,
      status: data.status,
      queenId: null,
      agentIds: [],
      steps,
      createdAt: now,
      completedAt: null,
      progress: 0,
    };
    this.swarms.set(id, swarm);
    return swarm;
  }

  async updateSwarm(id: string, updates: Partial<Swarm>): Promise<Swarm | undefined> {
    const swarm = this.swarms.get(id);
    if (!swarm) return undefined;
    const updated = { ...swarm, ...updates };
    this.swarms.set(id, updated);
    return updated;
  }

  async deleteSwarm(id: string): Promise<boolean> {
    return this.swarms.delete(id);
  }

  async getEvents(): Promise<NamiEvent[]> {
    return [...this.events].reverse().slice(0, 100);
  }

  async addEvent(data: Omit<NamiEvent, "id" | "timestamp">): Promise<NamiEvent> {
    const event: NamiEvent = { ...data, id: randomUUID(), timestamp: new Date().toISOString() };
    this.events.push(event);
    if (this.events.length > 500) this.events = this.events.slice(-500);
    return event;
  }

  async getConfig(): Promise<NamiConfig> {
    return { ...this.config };
  }

  async updateConfig(updates: Partial<NamiConfig>): Promise<NamiConfig> {
    this.config = { ...this.config, ...updates };
    return { ...this.config };
  }

  async getStats(): Promise<SystemStats> {
    const agents = Array.from(this.agents.values());
    const swarms = Array.from(this.swarms.values());
    return {
      totalAgents: agents.length,
      activeAgents: agents.filter((a) => a.status === "running").length,
      totalSwarms: swarms.length,
      activeSwarms: swarms.filter((s) => s.status === "active").length,
      totalTokensUsed: agents.reduce((sum, a) => sum + a.tokensUsed, 0),
      totalMessagesProcessed: agents.reduce((sum, a) => sum + a.messagesProcessed, 0),
      uptime: Date.now() - this.startTime,
    };
  }

  async getMessages(agentId?: string, swarmId?: string): Promise<AgentMessage[]> {
    let msgs = this.messages;
    if (agentId) msgs = msgs.filter((m) => m.fromAgentId === agentId || m.toAgentId === agentId);
    if (swarmId) msgs = msgs.filter((m) => m.swarmId === swarmId);
    return msgs.slice(-100);
  }

  async addMessage(data: Omit<AgentMessage, "id" | "timestamp">): Promise<AgentMessage> {
    const msg: AgentMessage = { ...data, id: randomUUID(), timestamp: new Date().toISOString() };
    this.messages.push(msg);
    if (this.messages.length > 1000) this.messages = this.messages.slice(-1000);
    return msg;
  }

  async getChatHistory(): Promise<ChatMessage[]> {
    return [...this.chatHistory];
  }

  async addChatMessage(data: Omit<ChatMessage, "id" | "timestamp">): Promise<ChatMessage> {
    const msg: ChatMessage = { ...data, id: randomUUID(), timestamp: new Date().toISOString() };
    this.chatHistory.push(msg);
    if (this.chatHistory.length > 200) this.chatHistory = this.chatHistory.slice(-200);
    return msg;
  }

  async clearChatHistory(): Promise<void> {
    this.chatHistory = [];
  }

  async getThoughts(): Promise<Thought[]> {
    return [...this.thoughts].reverse().slice(0, 100);
  }

  async addThought(data: Omit<Thought, "id" | "timestamp">): Promise<Thought> {
    const thought: Thought = { ...data, id: randomUUID(), timestamp: new Date().toISOString() };
    this.thoughts.push(thought);
    if (this.thoughts.length > 500) this.thoughts = this.thoughts.slice(-500);
    return thought;
  }

  async clearThoughts(): Promise<void> {
    this.thoughts = [];
  }

  async getMemories(): Promise<Memory[]> {
    return Array.from(this.memories.values()).sort((a, b) => b.importance - a.importance);
  }

  async addMemory(data: Omit<Memory, "id" | "createdAt" | "lastAccessedAt">): Promise<Memory> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const memory: Memory = { ...data, id, createdAt: now, lastAccessedAt: now };
    this.memories.set(id, memory);
    return memory;
  }

  async updateMemory(id: string, updates: Partial<Memory>): Promise<Memory | undefined> {
    const memory = this.memories.get(id);
    if (!memory) return undefined;
    const updated = { ...memory, ...updates };
    this.memories.set(id, updated);
    return updated;
  }

  async deleteMemory(id: string): Promise<boolean> {
    return this.memories.delete(id);
  }

  async getHeartbeatConfig(): Promise<HeartbeatConfig> {
    return { ...this.heartbeatConfig };
  }

  async updateHeartbeatConfig(updates: Partial<HeartbeatConfig>): Promise<HeartbeatConfig> {
    this.heartbeatConfig = { ...this.heartbeatConfig, ...updates };
    return { ...this.heartbeatConfig };
  }

  async getHeartbeatLogs(): Promise<HeartbeatLog[]> {
    return [...this.heartbeatLogs].reverse();
  }

  async addHeartbeatLog(log: Omit<HeartbeatLog, "id">): Promise<HeartbeatLog> {
    const entry: HeartbeatLog = { ...log, id: randomUUID() };
    this.heartbeatLogs.push(entry);
    if (this.heartbeatLogs.length > 100) {
      this.heartbeatLogs = this.heartbeatLogs.slice(-100);
    }
    return entry;
  }

  async getEngineState(): Promise<EngineState> {
    return this.engineState;
  }

  async setEngineState(state: EngineState): Promise<EngineState> {
    this.engineState = state;
    return this.engineState;
  }
}

export const storage = new MemStorage();
