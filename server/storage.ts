import type { Agent, InsertAgent, Swarm, InsertSwarm, NamiEvent, NamiConfig, SystemStats, AgentMessage, ChatMessage, ChatSession, Thought, Memory, Skill, HeartbeatConfig, HeartbeatLog, EngineState, SwarmMessage, UsageRecord, InsertUsageRecord, DocPage, InsertDocPage } from "@shared/schema";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { dbGet, dbSet, dbUpsertRow, dbInsertRow, dbDeleteRow, dbDeleteWhere, dbGetAllRows, dbGetRowsByColumn, dbInit, dbUpsertByKey, dbDeleteByKey, dbTruncate } from "./db-persist";

const PERSIST_DIR = path.join(process.cwd(), ".nami-data");
const CONFIG_FILE = path.join(PERSIST_DIR, "config.json");
const HEARTBEAT_CONFIG_FILE = path.join(PERSIST_DIR, "heartbeat.json");
const ENGINE_STATE_FILE = path.join(PERSIST_DIR, "engine-state.json");
const CHAT_HISTORY_FILE = path.join(PERSIST_DIR, "chat-history.json");
const CHAT_SESSIONS_FILE = path.join(PERSIST_DIR, "chat-sessions.json");
const THOUGHTS_FILE = path.join(PERSIST_DIR, "thoughts.json");
const MEMORIES_FILE = path.join(PERSIST_DIR, "memories.json");
const SWARM_MESSAGES_FILE = path.join(PERSIST_DIR, "swarm-messages.json");
const AGENTS_FILE = path.join(PERSIST_DIR, "agents.json");
const SWARMS_FILE = path.join(PERSIST_DIR, "swarms.json");
const EVENTS_FILE = path.join(PERSIST_DIR, "events.json");
const MESSAGES_FILE = path.join(PERSIST_DIR, "messages.json");
const SKILLS_FILE = path.join(PERSIST_DIR, "skills.json");
const USAGE_FILE = path.join(PERSIST_DIR, "usage.json");
const DOCS_FILE = path.join(PERSIST_DIR, "docs.json");

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

  getChatSessions(): Promise<ChatSession[]>;
  getChatSession(id: string): Promise<ChatSession | undefined>;
  createChatSession(name: string): Promise<ChatSession>;
  renameChatSession(id: string, name: string): Promise<ChatSession | undefined>;
  deleteChatSession(id: string): Promise<boolean>;
  getActiveChatSessionId(): string;
  setActiveChatSessionId(id: string): void;

  getChatHistory(sessionId?: string): Promise<ChatMessage[]>;
  addChatMessage(message: Omit<ChatMessage, "id" | "timestamp">): Promise<ChatMessage>;
  clearChatHistory(sessionId?: string): Promise<void>;

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


  getDocs(): Promise<DocPage[]>;
  getDoc(slug: string): Promise<DocPage | undefined>;
  upsertDoc(data: InsertDocPage): Promise<DocPage>;
  deleteDoc(slug: string): Promise<boolean>;

  getSwarmMessages(swarmId: string): Promise<SwarmMessage[]>;
  addSwarmMessage(message: Omit<SwarmMessage, "id" | "timestamp">): Promise<SwarmMessage>;

  getHeartbeatConfig(): Promise<HeartbeatConfig>;
  updateHeartbeatConfig(updates: Partial<HeartbeatConfig>): Promise<HeartbeatConfig>;

  getHeartbeatLogs(): Promise<HeartbeatLog[]>;
  addHeartbeatLog(log: Omit<HeartbeatLog, "id">): Promise<HeartbeatLog>;

  getEngineState(): Promise<EngineState>;
  setEngineState(state: EngineState): Promise<EngineState>;

  getUsageRecords(swarmId?: string): Promise<UsageRecord[]>;
  addUsageRecord(record: InsertUsageRecord): Promise<UsageRecord>;
  clearUsageRecords(): Promise<void>;
}

export class MemStorage implements IStorage {
  private agents: Map<string, Agent> = new Map();
  private swarms: Map<string, Swarm> = new Map();
  private events: NamiEvent[] = [];
  private messages: AgentMessage[] = [];
  private chatHistory: ChatMessage[] = [];
  private chatSessions: Map<string, ChatSession> = new Map();
  private activeChatSessionId: string = "default";
  private thoughts: Thought[] = [];
  private memories: Map<string, Memory> = new Map();
  private skills: Map<string, Skill> = new Map();
  private usageRecords: UsageRecord[] = [];
  private docs: Map<string, DocPage> = new Map();
  private swarmMessages: SwarmMessage[];
  private heartbeatLogs: HeartbeatLog[] = [];
  private heartbeatConfig: HeartbeatConfig;
  private engineState: EngineState;
  private config: NamiConfig;
  private startTime = Date.now();

  constructor() {
    const defaultConfig: NamiConfig = {
      openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
      geminiApiKey: "",
      namiProvider: "openrouter",
      engineProvider: "openrouter",
      defaultModel: "openai/gpt-4o",
      engineMindModel: "qwen/qwen3-coder-flash",
      engineMindEnabled: true,
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

    const savedEngine = loadJson<{ state: EngineState }>(ENGINE_STATE_FILE, { state: "stopped" });
    this.engineState = savedEngine.state;

    this.chatHistory = loadJson<ChatMessage[]>(CHAT_HISTORY_FILE, []);
    let chatMigrated = false;
    for (const msg of this.chatHistory) {
      if (!msg.sessionId) {
        (msg as any).sessionId = "default";
        chatMigrated = true;
      }
    }
    if (chatMigrated) {
      this.persistChat();
    }

    const savedSessions = loadJson<ChatSession[]>(CHAT_SESSIONS_FILE, []);
    for (const session of savedSessions) {
      this.chatSessions.set(session.id, session);
    }
    if (!this.chatSessions.has("default")) {
      const now = new Date().toISOString();
      this.chatSessions.set("default", { id: "default", name: "Main Chat", createdAt: now, updatedAt: now });
      this.persistChatSessions();
    }

    this.thoughts = loadJson<Thought[]>(THOUGHTS_FILE, []);
    this.swarmMessages = loadJson<SwarmMessage[]>(SWARM_MESSAGES_FILE, []);

    const savedMemories = loadJson<Memory[]>(MEMORIES_FILE, []);
    for (const mem of savedMemories) {
      this.memories.set(mem.id, mem);
    }

    const savedSkills = loadJson<Skill[]>(SKILLS_FILE, []);
    for (const skill of savedSkills) {
      this.skills.set(skill.id, skill);
    }


    const savedAgents = loadJson<Agent[]>(AGENTS_FILE, []);
    for (const agent of savedAgents) {
      if (agent.status === "running") {
        agent.status = "idle";
      }
      this.agents.set(agent.id, agent);
    }

    const savedSwarms = loadJson<Swarm[]>(SWARMS_FILE, []);
    let interruptedCount = 0;
    for (const swarm of savedSwarms) {
      if (swarm.status === "active") {
        swarm.status = "failed";
        interruptedCount++;
      }
      this.swarms.set(swarm.id, swarm);
    }
    if (interruptedCount > 0) {
      this.persistSwarms();
      console.log(`[storage] Marked ${interruptedCount} active swarm(s) as failed (server restart)`);
    }

    this.events = loadJson<NamiEvent[]>(EVENTS_FILE, []);
    this.messages = loadJson<AgentMessage[]>(MESSAGES_FILE, []);
    this.usageRecords = loadJson<UsageRecord[]>(USAGE_FILE, []);

    const savedDocs = loadJson<DocPage[]>(DOCS_FILE, []);
    for (const doc of savedDocs) {
      this.docs.set(doc.slug, doc);
    }

    console.log(`[storage] Loaded from disk (model: ${this.config.defaultModel}, heartbeat: ${this.heartbeatConfig.enabled}, engine: ${this.engineState}, chat: ${this.chatHistory.length} msgs, thoughts: ${this.thoughts.length}, memories: ${this.memories.size}, skills: ${this.skills.size}, agents: ${this.agents.size}, swarms: ${this.swarms.size})`);
  }

  async initFromDb(): Promise<void> {
    try {
      const dbConfig = await dbGet<NamiConfig>("config");
      if (dbConfig) {
        this.config = { ...this.config, ...dbConfig };
        if (!this.config.openRouterApiKey && process.env.OPENROUTER_API_KEY) {
          this.config.openRouterApiKey = process.env.OPENROUTER_API_KEY;
        }
      } else {
        const { openRouterApiKey: _, ...safeConfig } = this.config;
        await dbSet("config", safeConfig);
      }

      const dbHeartbeat = await dbGet<HeartbeatConfig>("heartbeat");
      if (dbHeartbeat) {
        this.heartbeatConfig = { ...this.heartbeatConfig, ...dbHeartbeat };
      } else {
        await dbSet("heartbeat", this.heartbeatConfig);
      }

      const dbEngine = await dbGet<{ state: EngineState }>("engine-state");
      if (dbEngine) {
        this.engineState = dbEngine.state;
      } else {
        await dbSet("engine-state", { state: this.engineState });
      }

      console.log(`[storage] DB settings loaded (model: ${this.config.defaultModel}, heartbeat: ${this.heartbeatConfig.enabled}, engine: ${this.engineState})`);

      const dbAgents = await dbGetAllRows<Agent>("nami_agents");
      if (dbAgents.length > 0) {
        this.agents.clear();
        for (const agent of dbAgents) {
          if (agent.status === "running") agent.status = "idle";
          this.agents.set(agent.id, agent);
        }
        console.log(`[storage] DB loaded ${dbAgents.length} agents`);
      } else if (this.agents.size > 0) {
        for (const agent of this.agents.values()) {
          await dbUpsertRow("nami_agents", agent.id, agent);
        }
        console.log(`[storage] Migrated ${this.agents.size} agents to DB`);
      }

      const dbSwarms = await dbGetAllRows<Swarm>("nami_swarms");
      if (dbSwarms.length > 0) {
        this.swarms.clear();
        let interruptedCount = 0;
        for (const swarm of dbSwarms) {
          if (swarm.status === "active") {
            swarm.status = "failed";
            interruptedCount++;
          }
          this.swarms.set(swarm.id, swarm);
        }
        if (interruptedCount > 0) {
          for (const swarm of this.swarms.values()) {
            if (swarm.status === "failed") await dbUpsertRow("nami_swarms", swarm.id, swarm);
          }
          console.log(`[storage] Marked ${interruptedCount} active swarm(s) as failed (server restart)`);
        }
        console.log(`[storage] DB loaded ${dbSwarms.length} swarms`);
      } else if (this.swarms.size > 0) {
        for (const swarm of this.swarms.values()) {
          await dbUpsertRow("nami_swarms", swarm.id, swarm);
        }
        console.log(`[storage] Migrated ${this.swarms.size} swarms to DB`);
      }

      const dbSessions = await dbGetAllRows<ChatSession>("nami_chat_sessions");
      if (dbSessions.length > 0) {
        this.chatSessions.clear();
        for (const session of dbSessions) {
          this.chatSessions.set(session.id, session);
        }
        console.log(`[storage] DB loaded ${dbSessions.length} chat sessions`);
      } else if (this.chatSessions.size > 0) {
        for (const session of this.chatSessions.values()) {
          await dbUpsertRow("nami_chat_sessions", session.id, session);
        }
        console.log(`[storage] Migrated ${this.chatSessions.size} chat sessions to DB`);
      }

      const dbChatMessages = await dbGetAllRows<ChatMessage>("nami_chat_messages");
      if (dbChatMessages.length > 0) {
        this.chatHistory = dbChatMessages;
        console.log(`[storage] DB loaded ${dbChatMessages.length} chat messages`);
      } else if (this.chatHistory.length > 0) {
        for (const msg of this.chatHistory) {
          await dbInsertRow("nami_chat_messages", msg.id, msg, { session_id: msg.sessionId || "default" });
        }
        console.log(`[storage] Migrated ${this.chatHistory.length} chat messages to DB`);
      }

      const dbSwarmMessages = await dbGetAllRows<SwarmMessage>("nami_swarm_messages");
      if (dbSwarmMessages.length > 0) {
        this.swarmMessages = dbSwarmMessages;
        console.log(`[storage] DB loaded ${dbSwarmMessages.length} swarm messages`);
      } else if (this.swarmMessages.length > 0) {
        for (const msg of this.swarmMessages) {
          await dbInsertRow("nami_swarm_messages", msg.id, msg, { swarm_id: msg.swarmId });
        }
        console.log(`[storage] Migrated ${this.swarmMessages.length} swarm messages to DB`);
      }

      const dbThoughts = await dbGetAllRows<Thought>("nami_thoughts");
      if (dbThoughts.length > 0) {
        this.thoughts = dbThoughts;
        console.log(`[storage] DB loaded ${dbThoughts.length} thoughts`);
      } else if (this.thoughts.length > 0) {
        for (const t of this.thoughts) {
          await dbInsertRow("nami_thoughts", t.id, t);
        }
        console.log(`[storage] Migrated ${this.thoughts.length} thoughts to DB`);
      }

      const dbMemories = await dbGetAllRows<Memory>("nami_memories");
      if (dbMemories.length > 0) {
        this.memories.clear();
        for (const m of dbMemories) {
          this.memories.set(m.id, m);
        }
        console.log(`[storage] DB loaded ${dbMemories.length} memories`);
      } else if (this.memories.size > 0) {
        for (const m of this.memories.values()) {
          await dbInsertRow("nami_memories", m.id, m);
        }
        console.log(`[storage] Migrated ${this.memories.size} memories to DB`);
      }

      const dbUsage = await dbGetAllRows<UsageRecord>("nami_usage");
      if (dbUsage.length > 0) {
        this.usageRecords = dbUsage;
        console.log(`[storage] DB loaded ${dbUsage.length} usage records`);
      } else if (this.usageRecords.length > 0) {
        for (const u of this.usageRecords) {
          await dbInsertRow("nami_usage", u.id, u);
        }
        console.log(`[storage] Migrated ${this.usageRecords.length} usage records to DB`);
      }

      const dbDocs = await dbGetAllRows<DocPage>("nami_docs");
      if (dbDocs.length > 0) {
        this.docs.clear();
        for (const d of dbDocs) {
          this.docs.set(d.slug, d);
        }
        console.log(`[storage] DB loaded ${dbDocs.length} docs`);
      } else if (this.docs.size > 0) {
        for (const d of this.docs.values()) {
          await dbUpsertByKey("nami_docs", "slug", d.slug, d);
        }
        console.log(`[storage] Migrated ${this.docs.size} docs to DB`);
      }

    } catch (err: any) {
      console.log(`[storage] DB settings load skipped: ${err.message}`);
    }
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
    this.persistAgents();
    dbUpsertRow("nami_agents", agent.id, agent).catch((e) => console.log(`[storage] DB agent insert error: ${e.message}`));
    return agent;
  }

  async updateAgent(id: string, updates: Partial<Agent>): Promise<Agent | undefined> {
    const agent = this.agents.get(id);
    if (!agent) return undefined;
    const updated = { ...agent, ...updates, lastActiveAt: new Date().toISOString() };
    this.agents.set(id, updated);
    this.persistAgents();
    dbUpsertRow("nami_agents", updated.id, updated).catch((e) => console.log(`[storage] DB agent update error: ${e.message}`));
    return updated;
  }

  async deleteAgent(id: string): Promise<boolean> {
    const result = this.agents.delete(id);
    if (result) {
      this.persistAgents();
      dbDeleteRow("nami_agents", id).catch((e) => console.log(`[storage] DB agent delete error: ${e.message}`));
    }
    return result;
  }

  private persistAgents() {
    saveJson(AGENTS_FILE, Array.from(this.agents.values()));
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
    const schedule = data.schedule?.enabled ? {
      enabled: true,
      type: data.schedule.type || "interval",
      intervalHours: data.schedule.intervalHours || 24,
      dailyTime: data.schedule.dailyTime || "09:00",
      weeklyDays: data.schedule.weeklyDays || [1],
      nextRunAt: null,
      lastRunAt: null,
      runCount: 0,
    } : undefined;
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
      maxCycles: data.maxCycles,
      schedule,
    };
    this.swarms.set(id, swarm);
    this.persistSwarms();
    dbUpsertRow("nami_swarms", swarm.id, swarm).catch((e) => console.log(`[storage] DB swarm insert error: ${e.message}`));
    return swarm;
  }

  async updateSwarm(id: string, updates: Partial<Swarm>): Promise<Swarm | undefined> {
    const swarm = this.swarms.get(id);
    if (!swarm) return undefined;
    const updated = { ...swarm, ...updates };
    this.swarms.set(id, updated);
    this.persistSwarms();
    dbUpsertRow("nami_swarms", updated.id, updated).catch((e) => console.log(`[storage] DB swarm update error: ${e.message}`));
    return updated;
  }

  async deleteSwarm(id: string): Promise<boolean> {
    const result = this.swarms.delete(id);
    if (result) {
      this.persistSwarms();
      dbDeleteRow("nami_swarms", id).catch((e) => console.log(`[storage] DB swarm delete error: ${e.message}`));
      dbDeleteWhere("nami_swarm_messages", "swarm_id", id).catch((e) => console.log(`[storage] DB swarm messages delete error: ${e.message}`));
    }
    return result;
  }

  private persistSwarms() {
    saveJson(SWARMS_FILE, Array.from(this.swarms.values()));
  }

  async getEvents(): Promise<NamiEvent[]> {
    return [...this.events].reverse().slice(0, 100);
  }

  async addEvent(data: Omit<NamiEvent, "id" | "timestamp">): Promise<NamiEvent> {
    const event: NamiEvent = { ...data, id: randomUUID(), timestamp: new Date().toISOString() };
    this.events.push(event);
    if (this.events.length > 500) this.events = this.events.slice(-500);
    this.persistEvents();
    return event;
  }

  private persistEvents() {
    saveJson(EVENTS_FILE, this.events);
  }

  async getConfig(): Promise<NamiConfig> {
    return { ...this.config };
  }

  async updateConfig(updates: Partial<NamiConfig>): Promise<NamiConfig> {
    this.config = { ...this.config, ...updates };
    saveJson(CONFIG_FILE, this.config);
    const { openRouterApiKey: _, ...safeConfig } = this.config;
    dbSet("config", safeConfig).catch(() => {});
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
    this.persistMessages();
    return msg;
  }

  private persistMessages() {
    saveJson(MESSAGES_FILE, this.messages);
  }

  async getChatSessions(): Promise<ChatSession[]> {
    return Array.from(this.chatSessions.values()).sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async getChatSession(id: string): Promise<ChatSession | undefined> {
    return this.chatSessions.get(id);
  }

  async createChatSession(name: string): Promise<ChatSession> {
    const now = new Date().toISOString();
    const session: ChatSession = { id: randomUUID(), name, createdAt: now, updatedAt: now };
    this.chatSessions.set(session.id, session);
    this.persistChatSessions();
    dbUpsertRow("nami_chat_sessions", session.id, session).catch((e) => console.log(`[storage] DB chat session insert error: ${e.message}`));
    return session;
  }

  async renameChatSession(id: string, name: string): Promise<ChatSession | undefined> {
    const session = this.chatSessions.get(id);
    if (!session) return undefined;
    session.name = name;
    session.updatedAt = new Date().toISOString();
    this.persistChatSessions();
    dbUpsertRow("nami_chat_sessions", session.id, session).catch((e) => console.log(`[storage] DB chat session update error: ${e.message}`));
    return session;
  }

  async deleteChatSession(id: string): Promise<boolean> {
    if (id === "default") return false;
    const deleted = this.chatSessions.delete(id);
    if (deleted) {
      this.chatHistory = this.chatHistory.filter((m) => m.sessionId !== id);
      this.persistChat();
      this.persistChatSessions();
      dbDeleteRow("nami_chat_sessions", id).catch((e) => console.log(`[storage] DB chat session delete error: ${e.message}`));
      dbDeleteWhere("nami_chat_messages", "session_id", id).catch((e) => console.log(`[storage] DB chat messages delete error: ${e.message}`));
      if (this.activeChatSessionId === id) {
        this.activeChatSessionId = "default";
      }
    }
    return deleted;
  }

  getActiveChatSessionId(): string {
    return this.activeChatSessionId;
  }

  setActiveChatSessionId(id: string): void {
    this.activeChatSessionId = id;
  }

  async getChatHistory(sessionId?: string): Promise<ChatMessage[]> {
    const sid = sessionId || this.activeChatSessionId;
    return this.chatHistory.filter((m) => m.sessionId === sid);
  }

  async addChatMessage(data: Omit<ChatMessage, "id" | "timestamp">): Promise<ChatMessage> {
    const sessionId = data.sessionId || this.activeChatSessionId;
    if (!this.chatSessions.has(sessionId)) {
      const now = new Date().toISOString();
      const newSession = { id: sessionId, name: sessionId === "default" ? "Main Chat" : "Chat", createdAt: now, updatedAt: now };
      this.chatSessions.set(sessionId, newSession);
      this.persistChatSessions();
      dbUpsertRow("nami_chat_sessions", newSession.id, newSession).catch((e) => console.log(`[storage] DB chat session auto-create error: ${e.message}`));
    }
    const msg: ChatMessage = { ...data, sessionId, id: randomUUID(), timestamp: new Date().toISOString() };
    this.chatHistory.push(msg);
    const MAX_CHAT = 500;
    const sessionMsgs = this.chatHistory.filter((m) => m.sessionId === sessionId);
    if (sessionMsgs.length > MAX_CHAT) {
      const removeIds = new Set(sessionMsgs.slice(0, sessionMsgs.length - MAX_CHAT).map((m) => m.id));
      this.chatHistory = this.chatHistory.filter((m) => m.sessionId !== sessionId || !removeIds.has(m.id));
      for (const removeId of removeIds) {
        dbDeleteRow("nami_chat_messages", removeId).catch(() => {});
      }
    }
    const session = this.chatSessions.get(sessionId);
    if (session) {
      session.updatedAt = new Date().toISOString();
      this.persistChatSessions();
      dbUpsertRow("nami_chat_sessions", session.id, session).catch(() => {});
    }
    this.persistChat();
    dbInsertRow("nami_chat_messages", msg.id, msg, { session_id: sessionId }).catch((e) => console.log(`[storage] DB chat message insert error: ${e.message}`));
    return msg;
  }

  async clearChatHistory(sessionId?: string): Promise<void> {
    const sid = sessionId || this.activeChatSessionId;
    this.chatHistory = this.chatHistory.filter((m) => m.sessionId !== sid);
    this.persistChat();
    dbDeleteWhere("nami_chat_messages", "session_id", sid).catch((e) => console.log(`[storage] DB chat clear error: ${e.message}`));
  }

  private persistChat() {
    saveJson(CHAT_HISTORY_FILE, this.chatHistory);
  }

  private persistChatSessions() {
    saveJson(CHAT_SESSIONS_FILE, Array.from(this.chatSessions.values()));
  }

  async getThoughts(): Promise<Thought[]> {
    return [...this.thoughts].reverse().slice(0, 100);
  }

  async addThought(data: Omit<Thought, "id" | "timestamp">): Promise<Thought> {
    const thought: Thought = { ...data, id: randomUUID(), timestamp: new Date().toISOString() };
    this.thoughts.push(thought);
    if (this.thoughts.length > 500) this.thoughts = this.thoughts.slice(-500);
    this.persistThoughts();
    dbInsertRow("nami_thoughts", thought.id, thought).catch((e) => console.log(`[storage] DB thought insert error: ${e.message}`));
    return thought;
  }

  async clearThoughts(): Promise<void> {
    this.thoughts = [];
    this.persistThoughts();
    dbTruncate("nami_thoughts").catch(() => {});
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
    dbUpsertRow("nami_memories", memory.id, memory).catch((e) => console.log(`[storage] DB memory insert error: ${e.message}`));
    return memory;
  }

  async updateMemory(id: string, updates: Partial<Memory>): Promise<Memory | undefined> {
    const memory = this.memories.get(id);
    if (!memory) return undefined;
    const updated = { ...memory, ...updates };
    this.memories.set(id, updated);
    this.persistMemories();
    dbUpsertRow("nami_memories", updated.id, updated).catch((e) => console.log(`[storage] DB memory update error: ${e.message}`));
    return updated;
  }

  async deleteMemory(id: string): Promise<boolean> {
    const result = this.memories.delete(id);
    this.persistMemories();
    if (result) dbDeleteRow("nami_memories", id).catch((e) => console.log(`[storage] DB memory delete error: ${e.message}`));
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


  async getSwarmMessages(swarmId: string): Promise<SwarmMessage[]> {
    return this.swarmMessages.filter((m) => m.swarmId === swarmId);
  }

  async addSwarmMessage(data: Omit<SwarmMessage, "id" | "timestamp">): Promise<SwarmMessage> {
    const msg: SwarmMessage = { ...data, id: randomUUID(), timestamp: new Date().toISOString() };
    this.swarmMessages.push(msg);
    if (this.swarmMessages.length > 5000) this.swarmMessages = this.swarmMessages.slice(-5000);
    this.persistSwarmMessages();
    dbInsertRow("nami_swarm_messages", msg.id, msg, { swarm_id: msg.swarmId }).catch((e) => console.log(`[storage] DB swarm message insert error: ${e.message}`));
    return msg;
  }

  private persistSwarmMessages() {
    saveJson(SWARM_MESSAGES_FILE, this.swarmMessages);
  }

  async getHeartbeatConfig(): Promise<HeartbeatConfig> {
    return { ...this.heartbeatConfig };
  }

  async updateHeartbeatConfig(updates: Partial<HeartbeatConfig>): Promise<HeartbeatConfig> {
    this.heartbeatConfig = { ...this.heartbeatConfig, ...updates };
    saveJson(HEARTBEAT_CONFIG_FILE, this.heartbeatConfig);
    dbSet("heartbeat", this.heartbeatConfig).catch(() => {});
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
    dbSet("engine-state", { state }).catch(() => {});
    return this.engineState;
  }

  async getUsageRecords(swarmId?: string): Promise<UsageRecord[]> {
    if (swarmId) {
      return this.usageRecords.filter((r) => r.swarmId === swarmId);
    }
    return [...this.usageRecords];
  }

  async addUsageRecord(record: InsertUsageRecord): Promise<UsageRecord> {
    const entry: UsageRecord = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...record,
    };
    this.usageRecords.push(entry);
    debouncedSave(USAGE_FILE, () => this.usageRecords);
    dbInsertRow("nami_usage", entry.id, entry).catch((e) => console.log(`[storage] DB usage insert error: ${e.message}`));
    return entry;
  }

  async clearUsageRecords(): Promise<void> {
    this.usageRecords = [];
    saveJson(USAGE_FILE, []);
    dbTruncate("nami_usage").catch(() => {});
  }

  async getDocs(): Promise<DocPage[]> {
    return Array.from(this.docs.values()).sort((a, b) => a.title.localeCompare(b.title));
  }

  async getDoc(slug: string): Promise<DocPage | undefined> {
    return this.docs.get(slug);
  }

  async upsertDoc(data: InsertDocPage): Promise<DocPage> {
    const now = new Date().toISOString();
    const existing = this.docs.get(data.slug);
    const doc: DocPage = {
      ...data,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.docs.set(data.slug, doc);
    this.persistDocs();
    dbUpsertByKey("nami_docs", "slug", doc.slug, doc).catch((e) => console.log(`[storage] DB doc upsert error: ${e.message}`));
    return doc;
  }

  async deleteDoc(slug: string): Promise<boolean> {
    const result = this.docs.delete(slug);
    this.persistDocs();
    if (result) dbDeleteByKey("nami_docs", "slug", slug).catch((e) => console.log(`[storage] DB doc delete error: ${e.message}`));
    return result;
  }

  private persistDocs() {
    saveJson(DOCS_FILE, Array.from(this.docs.values()));
  }
}

export const storage = new MemStorage();
