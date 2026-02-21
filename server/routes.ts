import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { eventBus, createSpawn, createSwarmWithQueen, agentAction, swarmAction, runAgentInference, chatWithNami, runSwarmSteps, startEngine, pauseEngine, stopEngine, startHeartbeat, stopHeartbeat } from "./engine";
import { testConnection } from "./openrouter";
import { insertAgentSchema, insertSwarmSchema, insertPinnedChatSchema, skillSchema, swarmScheduleSchema, insertDocPageSchema } from "@shared/schema";
import { log, activeSessions, hashToken } from "./index";
import { getTools, setToolEnabled, getPermissions, updatePermissions } from "./tools";
import { engineMind } from "./engine-mind";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws, req) => {
    const cookieHeader = req.headers.cookie || "";
    const sessionCookie = cookieHeader.split(";").map(c => c.trim()).find(c => c.startsWith("nami_session="));
    const token = sessionCookie?.split("=")[1];

    if (!token || !activeSessions.has(hashToken(token))) {
      ws.close(4001, "Unauthorized");
      return;
    }

    clients.add(ws);
    log("WebSocket client connected", "ws");
    ws.on("close", () => clients.delete(ws));
  });

  eventBus.subscribe((event) => {
    const data = JSON.stringify(event);
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  });

  app.get("/api/stats", async (_req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  app.get("/api/engine/status", async (_req, res) => {
    const state = await storage.getEngineState();
    const hbConfig = await storage.getHeartbeatConfig();
    const config = await storage.getConfig();
    const agents = await storage.getAgents();
    const idleCount = agents.filter((a) => a.status === "idle").length;
    const totalCount = agents.length;
    res.json({
      state,
      heartbeatCount: hbConfig.totalBeats,
      idleCount: `${idleCount}/${totalCount}`,
      uptime: Date.now(),
      currentModel: config.defaultModel,
    });
  });

  app.post("/api/engine/start", async (_req, res) => {
    try {
      const state = await startEngine();
      res.json({ state });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/engine/pause", async (_req, res) => {
    try {
      const state = await pauseEngine();
      res.json({ state });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/engine/stop", async (_req, res) => {
    try {
      const state = await stopEngine();
      res.json({ state });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/agents", async (_req, res) => {
    const agents = await storage.getAgents();
    res.json(agents);
  });

  app.get("/api/agents/:id", async (req, res) => {
    const agent = await storage.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    res.json(agent);
  });

  app.post("/api/agents", async (req, res) => {
    try {
      const data = insertAgentSchema.parse(req.body);
      const agent = await createSpawn({
        name: data.name,
        model: data.model,
        systemPrompt: data.systemPrompt,
        parentId: data.parentId,
        swarmId: data.swarmId,
      });
      res.status(201).json(agent);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/agents/:id/action", async (req, res) => {
    try {
      const { action } = req.body;
      const agent = await agentAction(req.params.id, action);
      res.json(agent);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/agents/:id/chat", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message) return res.status(400).json({ message: "Message required" });
      const response = await runAgentInference(req.params.id, message);
      res.json({ response });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/agents/:id", async (req, res) => {
    const deleted = await storage.deleteAgent(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Agent not found" });
    res.json({ success: true });
  });

  app.get("/api/swarms", async (_req, res) => {
    const swarms = await storage.getSwarms();
    res.json(swarms);
  });

  app.get("/api/swarms/:id", async (req, res) => {
    const swarm = await storage.getSwarm(req.params.id);
    if (!swarm) return res.status(404).json({ message: "Swarm not found" });
    res.json(swarm);
  });

  app.post("/api/swarms", async (req, res) => {
    try {
      const data = insertSwarmSchema.parse(req.body);
      const { swarm } = await createSwarmWithQueen({
        name: data.name,
        goal: data.goal,
        objective: data.objective,
        steps: data.steps,
        schedule: data.schedule,
      });
      res.status(201).json(swarm);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/swarms/:id/action", async (req, res) => {
    try {
      const { action } = req.body;
      const swarm = await swarmAction(req.params.id, action);
      res.json(swarm);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/swarms/:id/run", async (req, res) => {
    try {
      runSwarmSteps(req.params.id).catch((err) => {
        log(`Swarm step execution error: ${err.message}`, "engine");
      });
      res.json({ message: "Swarm execution started" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/swarms/:id", async (req, res) => {
    const swarm = await storage.getSwarm(req.params.id);
    if (!swarm) return res.status(404).json({ message: "Swarm not found" });

    for (const agentId of swarm.agentIds) {
      await storage.deleteAgent(agentId);
    }
    await storage.deleteSwarm(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/chat", async (_req, res) => {
    const messages = await storage.getChatHistory();
    res.json(messages);
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ message: "Message required" });
      }
      const result = await chatWithNami(message);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/chat", async (_req, res) => {
    await storage.clearChatHistory();
    res.json({ success: true });
  });

  app.get("/api/thoughts", async (_req, res) => {
    const thoughts = await storage.getThoughts();
    res.json(thoughts);
  });

  app.delete("/api/thoughts", async (_req, res) => {
    await storage.clearThoughts();
    res.json({ success: true });
  });

  app.get("/api/memories", async (_req, res) => {
    const memories = await storage.getMemories();
    res.json(memories);
  });

  app.post("/api/memories", async (req, res) => {
    try {
      const { content, category, importance } = req.body;
      if (!content || !category) return res.status(400).json({ message: "Content and category required" });
      const memory = await storage.addMemory({ content, category, importance: importance || 0 });
      res.status(201).json(memory);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/memories/:id", async (req, res) => {
    const deleted = await storage.deleteMemory(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Memory not found" });
    res.json({ success: true });
  });

  const SKILLS_FILE_PATH = path.join(process.cwd(), "Skills.md");

  app.get("/api/skills/file", async (_req, res) => {
    try {
      if (fs.existsSync(SKILLS_FILE_PATH)) {
        const content = fs.readFileSync(SKILLS_FILE_PATH, "utf-8");
        const stats = fs.statSync(SKILLS_FILE_PATH);
        res.json({ content, updatedAt: stats.mtime.toISOString() });
      } else {
        res.json({ content: "", updatedAt: null });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/skills/file", async (req, res) => {
    try {
      const { content } = req.body;
      if (typeof content !== "string") {
        return res.status(400).json({ message: "content must be a string" });
      }
      fs.writeFileSync(SKILLS_FILE_PATH, content, "utf-8");
      const stats = fs.statSync(SKILLS_FILE_PATH);
      res.json({ content, updatedAt: stats.mtime.toISOString() });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/docs", async (_req, res) => {
    const docs = await storage.getDocs();
    res.json(docs);
  });

  app.get("/api/docs/:slug", async (req, res) => {
    const doc = await storage.getDoc(req.params.slug);
    if (!doc) return res.status(404).json({ message: "Doc not found" });
    res.json(doc);
  });

  app.post("/api/docs", async (req, res) => {
    try {
      const data = insertDocPageSchema.parse(req.body);
      const doc = await storage.upsertDoc(data);
      res.status(201).json(doc);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/docs/:slug", async (req, res) => {
    try {
      const data = insertDocPageSchema.parse({ ...req.body, slug: req.params.slug });
      const doc = await storage.upsertDoc(data);
      res.json(doc);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/docs/:slug", async (req, res) => {
    const deleted = await storage.deleteDoc(req.params.slug);
    if (!deleted) return res.status(404).json({ message: "Doc not found" });
    res.json({ success: true });
  });

  app.get("/api/pinned-chats", async (_req, res) => {
    const pins = await storage.getPinnedChats();
    res.json(pins);
  });

  app.post("/api/pinned-chats", async (req, res) => {
    try {
      const data = insertPinnedChatSchema.parse(req.body);
      const pin = await storage.addPinnedChat(data);
      res.json(pin);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/pinned-chats/:id", async (req, res) => {
    const deleted = await storage.deletePinnedChat(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Pinned chat not found" });
    res.json({ success: true });
  });

  app.get("/api/heartbeat", async (_req, res) => {
    const config = await storage.getHeartbeatConfig();
    res.json(config);
  });

  app.get("/api/heartbeat/logs", async (_req, res) => {
    const logs = await storage.getHeartbeatLogs();
    res.json(logs);
  });

  app.put("/api/heartbeat", async (req, res) => {
    try {
      const config = await storage.updateHeartbeatConfig(req.body);
      const engineState = await storage.getEngineState();
      if (config.enabled && engineState === "running") {
        startHeartbeat();
      } else {
        stopHeartbeat();
      }
      res.json(config);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/events", async (_req, res) => {
    const events = await storage.getEvents();
    res.json(events);
  });

  app.get("/api/usage", async (req, res) => {
    const swarmId = req.query.swarmId as string | undefined;
    const records = await storage.getUsageRecords(swarmId);
    res.json(records);
  });

  app.get("/api/usage/summary", async (_req, res) => {
    const records = await storage.getUsageRecords();
    const totalCost = records.reduce((sum, r) => sum + r.cost, 0);
    const totalTokens = records.reduce((sum, r) => sum + r.totalTokens, 0);
    const bySource: Record<string, { cost: number; tokens: number; count: number }> = {};
    const byModel: Record<string, { cost: number; tokens: number; count: number }> = {};
    const bySwarm: Record<string, { cost: number; tokens: number; count: number; name?: string }> = {};

    for (const r of records) {
      if (!bySource[r.source]) bySource[r.source] = { cost: 0, tokens: 0, count: 0 };
      bySource[r.source].cost += r.cost;
      bySource[r.source].tokens += r.totalTokens;
      bySource[r.source].count++;

      if (!byModel[r.model]) byModel[r.model] = { cost: 0, tokens: 0, count: 0 };
      byModel[r.model].cost += r.cost;
      byModel[r.model].tokens += r.totalTokens;
      byModel[r.model].count++;

      if (r.swarmId) {
        if (!bySwarm[r.swarmId]) bySwarm[r.swarmId] = { cost: 0, tokens: 0, count: 0 };
        bySwarm[r.swarmId].cost += r.cost;
        bySwarm[r.swarmId].tokens += r.totalTokens;
        bySwarm[r.swarmId].count++;
      }
    }

    const swarms = await storage.getSwarms();
    for (const [id, entry] of Object.entries(bySwarm)) {
      const swarm = swarms.find((s) => s.id === id);
      if (swarm) entry.name = swarm.name;
    }

    res.json({ totalCost, totalTokens, totalCalls: records.length, bySource, byModel, bySwarm });
  });

  app.delete("/api/usage", async (_req, res) => {
    await storage.clearUsageRecords();
    res.json({ success: true });
  });

  app.get("/api/config", async (_req, res) => {
    const config = await storage.getConfig();
    const safeConfig = { ...config, openRouterApiKey: config.openRouterApiKey ? "sk-or-v1-****" : "" };
    res.json(safeConfig);
  });

  app.put("/api/config", async (req, res) => {
    try {
      const updates = { ...req.body };
      if (!updates.openRouterApiKey || updates.openRouterApiKey === "sk-or-v1-****" || updates.openRouterApiKey.length < 10) {
        delete updates.openRouterApiKey;
      }
      const config = await storage.updateConfig(updates);
      const safeConfig = { ...config, openRouterApiKey: config.openRouterApiKey ? "sk-or-v1-****" : "" };
      res.json(safeConfig);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/config/test", async (_req, res) => {
    try {
      const result = await testConnection();
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/models", async (_req, res) => {
    try {
      const config = await storage.getConfig();
      const apiKey = config.openRouterApiKey || process.env.OPENROUTER_API_KEY;
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      if (!response.ok) {
        throw new Error(`OpenRouter API returned ${response.status}`);
      }
      const data = await response.json() as { data: any[] };
      const models = (data.data || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        context_length: m.context_length,
        pricing: m.pricing,
      }));
      models.sort((a: any, b: any) => (a.name || a.id).localeCompare(b.name || b.id));
      res.json(models);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/messages", async (req, res) => {
    const { agentId, swarmId } = req.query;
    const messages = await storage.getMessages(agentId as string, swarmId as string);
    res.json(messages);
  });

  app.get("/api/tools", async (_req, res) => {
    const tools = getTools().map((t) => ({
      name: t.name,
      description: t.description,
      category: t.category,
      enabled: t.enabled,
      parameters: t.parameters,
    }));
    res.json(tools);
  });

  app.put("/api/tools/:name/toggle", async (req, res) => {
    const { name } = req.params;
    const { enabled } = req.body;
    const success = setToolEnabled(name, enabled);
    if (!success) {
      res.status(404).json({ message: `Tool '${name}' not found` });
      return;
    }
    res.json({ name, enabled });
  });

  app.get("/api/tools/permissions", async (_req, res) => {
    res.json(getPermissions());
  });

  app.put("/api/tools/permissions", async (req, res) => {
    const updated = updatePermissions(req.body);
    res.json(updated);
  });

  app.patch("/api/swarms/:id/schedule", async (req, res) => {
    const { id } = req.params;
    const swarm = await storage.getSwarm(id);
    if (!swarm) {
      res.status(404).json({ message: "Swarm not found" });
      return;
    }

    const parsed = swarmScheduleSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid schedule data", errors: parsed.error.flatten() });
      return;
    }

    const currentSchedule = swarm.schedule || {
      enabled: false,
      type: "interval" as const,
      intervalHours: 24,
      dailyTime: "09:00",
      weeklyDays: [1],
      nextRunAt: null,
      lastRunAt: null,
      runCount: 0,
    };

    const updatedSchedule = { ...currentSchedule, ...parsed.data };
    const updated = await storage.updateSwarm(id, { schedule: updatedSchedule });

    if (updatedSchedule.enabled && swarm.status === "completed") {
      const { transitionSwarmToSleeping } = await import("./engine");
      await transitionSwarmToSleeping(id);
    }

    res.json(updated);
  });

  app.get("/api/swarms/:id/messages", async (req, res) => {
    const { id } = req.params;
    const swarm = await storage.getSwarm(id);
    if (!swarm) {
      res.status(404).json({ message: "Swarm not found" });
      return;
    }
    const messages = await storage.getSwarmMessages(id);
    res.json(messages);
  });

  app.get("/api/engine-mind/status", async (_req, res) => {
    res.json(engineMind.getStatus());
  });

  app.post("/api/engine-mind/initialize", async (_req, res) => {
    try {
      const ok = await engineMind.initialize();
      res.json({ success: ok, message: ok ? "Engine Mind initialized" : "Engine Mind disabled or missing API key" });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/engine-mind/shutdown", async (_req, res) => {
    await engineMind.shutdown();
    res.json({ success: true, message: "Engine Mind shut down" });
  });

  app.post("/api/engine-mind/reinitialize", async (_req, res) => {
    try {
      const ok = await engineMind.reinitialize();
      res.json({ success: ok, message: ok ? "Engine Mind reinitialized" : "Engine Mind disabled or missing API key" });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/engine-mind/diagnostic", async (_req, res) => {
    try {
      const result = await engineMind.runDiagnostic();
      res.json({ result });
    } catch (err: any) {
      res.status(500).json({ result: `Error: ${err.message}` });
    }
  });

  app.post("/api/engine-mind/compact", async (_req, res) => {
    try {
      const result = await engineMind.compactChatHistory();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ compacted: false, error: err.message });
    }
  });

  return httpServer;
}
