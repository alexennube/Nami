import type { Agent, InsertAgent, Swarm, InsertSwarm, NamiEvent, NamiConfig, SystemStats, AgentMessage, ChatMessage, Thought, Memory, Skill, HeartbeatConfig, HeartbeatLog, EngineState } from "@shared/schema";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

const PERSIST_DIR = path.join(process.cwd(), ".nami-data");
const CONFIG_FILE = path.join(PERSIST_DIR, "config.json");
const HEARTBEAT_CONFIG_FILE = path.join(PERSIST_DIR, "heartbeat.json");
const ENGINE_STATE_FILE = path.join(PERSIST_DIR, "engine-state.json");
const CHAT_HISTORY_FILE = path.join(PERSIST_DIR, "chat-history.json");
const THOUGHTS_FILE = path.join(PERSIST_DIR, "thoughts.json");
const MEMORIES_FILE = path.join(PERSIST_DIR, "memories.json");
const SKILLS_FILE = path.join(PERSIST_DIR, "skills.json");

function ensurePersistDir() {
  if (!fs.existsSync(PERSIST_DIR)) {
    fs.mkdirSync(PERSIST_DIR, { recursive: true });
  }
}

function saveJson(filePath: string, data: any) {
  try {
    ensurePersistDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err: any) {
    console.error(`Failed to persist ${filePath}: ${err.message}`);
  }
}

function loadJson<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(fallback)) return parsed as T;
      return { ...fallback, ...parsed };
    }
  } catch (err: any) {
    console.error(`Failed to load ${filePath}: ${err.message}`);
  }
  return fallback;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(filePath: string, getData: () => any) {
  saveJson(filePath, getData());
}

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

  getSkills(): Promise<Skill[]>;
  getSkill(id: string): Promise<Skill | undefined>;
  addSkill(skill: Omit<Skill, "id" | "createdAt" | "updatedAt">): Promise<Skill>;
  updateSkill(id: string, updates: Partial<Skill>): Promise<Skill | undefined>;
  deleteSkill(id: string): Promise<boolean>;

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
  private skills: Map<string, Skill> = new Map();
  private heartbeatLogs: HeartbeatLog[] = [];
  private heartbeatConfig: HeartbeatConfig;
  private engineState: EngineState;
  private config: NamiConfig;
  private startTime = Date.now();

  constructor() {
    const defaultConfig: NamiConfig = {
      openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
      defaultModel: "openai/gpt-4o",
      siteUrl: "https://agentnami.com",
      siteName: "AgentNami",
      maxConcurrentAgents: 10,
      maxTokensPerRequest: 4096,
      temperature: 0.7,
    };

    const defaultHeartbeat: HeartbeatConfig = {
      enabled: true,
      intervalSeconds: 30,
      instruction: "Check on the status of all agents and swarms. If idle, report a sleep state. If active, provide a brief progress update.",
      maxBeats: 0,
      totalBeats: 0,
    };

    this.config = loadJson<NamiConfig>(CONFIG_FILE, defaultConfig);
    if (!this.config.openRouterApiKey && process.env.OPENROUTER_API_KEY) {
      this.config.openRouterApiKey = process.env.OPENROUTER_API_KEY;
    }

    this.heartbeatConfig = loadJson<HeartbeatConfig>(HEARTBEAT_CONFIG_FILE, defaultHeartbeat);

    const savedEngine = loadJson<{ state: EngineState }>(ENGINE_STATE_FILE, { state: "running" });
    this.engineState = savedEngine.state;

    this.chatHistory = loadJson<ChatMessage[]>(CHAT_HISTORY_FILE, []);
    this.thoughts = loadJson<Thought[]>(THOUGHTS_FILE, []);

    const savedMemories = loadJson<Memory[]>(MEMORIES_FILE, []);
    for (const mem of savedMemories) {
      this.memories.set(mem.id, mem);
    }

    const savedSkills = loadJson<Skill[]>(SKILLS_FILE, []);
    for (const skill of savedSkills) {
      this.skills.set(skill.id, skill);
    }

    console.log(`[storage] Loaded from disk (model: ${this.config.defaultModel}, heartbeat: ${this.heartbeatConfig.enabled}, engine: ${this.engineState}, chat: ${this.chatHistory.length} msgs, thoughts: ${this.thoughts.length}, memories: ${this.memories.size}, skills: ${this.skills.size})`);
  }

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
    saveJson(CONFIG_FILE, this.config);
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
    this.persistChat();
    return msg;
  }

  async clearChatHistory(): Promise<void> {
    this.chatHistory = [];
    this.persistChat();
  }

  private persistChat() {
    saveJson(CHAT_HISTORY_FILE, this.chatHistory);
  }

  async getThoughts(): Promise<Thought[]> {
    return [...this.thoughts].reverse().slice(0, 100);
  }

  async addThought(data: Omit<Thought, "id" | "timestamp">): Promise<Thought> {
    const thought: Thought = { ...data, id: randomUUID(), timestamp: new Date().toISOString() };
    this.thoughts.push(thought);
    if (this.thoughts.length > 500) this.thoughts = this.thoughts.slice(-500);
    this.persistThoughts();
    return thought;
  }

  async clearThoughts(): Promise<void> {
    this.thoughts = [];
    this.persistThoughts();
  }

  private persistThoughts() {
    saveJson(THOUGHTS_FILE, this.thoughts);
  }

  async getMemories(): Promise<Memory[]> {
    return Array.from(this.memories.values()).sort((a, b) => b.importance - a.importance);
  }

  async addMemory(data: Omit<Memory, "id" | "createdAt" | "lastAccessedAt">): Promise<Memory> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const memory: Memory = { ...data, id, createdAt: now, lastAccessedAt: now };
    this.memories.set(id, memory);
    this.persistMemories();
    return memory;
  }

  async updateMemory(id: string, updates: Partial<Memory>): Promise<Memory | undefined> {
    const memory = this.memories.get(id);
    if (!memory) return undefined;
    const updated = { ...memory, ...updates };
    this.memories.set(id, updated);
    this.persistMemories();
    return updated;
  }

  async deleteMemory(id: string): Promise<boolean> {
    const result = this.memories.delete(id);
    this.persistMemories();
    return result;
  }

  private persistMemories() {
    saveJson(MEMORIES_FILE, Array.from(this.memories.values()));
  }

  async getSkills(): Promise<Skill[]> {
    return Array.from(this.skills.values()).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getSkill(id: string): Promise<Skill | undefined> {
    return this.skills.get(id);
  }

  async addSkill(data: Omit<Skill, "id" | "createdAt" | "updatedAt">): Promise<Skill> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const skill: Skill = { ...data, id, createdAt: now, updatedAt: now };
    this.skills.set(id, skill);
    this.persistSkills();
    return skill;
  }

  async updateSkill(id: string, updates: Partial<Skill>): Promise<Skill | undefined> {
    const skill = this.skills.get(id);
    if (!skill) return undefined;
    const updated = { ...skill, ...updates, updatedAt: new Date().toISOString() };
    this.skills.set(id, updated);
    this.persistSkills();
    return updated;
  }

  async deleteSkill(id: string): Promise<boolean> {
    const result = this.skills.delete(id);
    this.persistSkills();
    return result;
  }

  private persistSkills() {
    saveJson(SKILLS_FILE, Array.from(this.skills.values()));
  }

  async getHeartbeatConfig(): Promise<HeartbeatConfig> {
    return { ...this.heartbeatConfig };
  }

  async updateHeartbeatConfig(updates: Partial<HeartbeatConfig>): Promise<HeartbeatConfig> {
    this.heartbeatConfig = { ...this.heartbeatConfig, ...updates };
    saveJson(HEARTBEAT_CONFIG_FILE, this.heartbeatConfig);
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
    saveJson(ENGINE_STATE_FILE, { state });
    return this.engineState;
  }
}

export const storage = new MemStorage();
