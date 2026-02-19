import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { eventBus, createSpawn, createSwarmWithQueen, agentAction, swarmAction, runAgentInference, chatWithNami, runSwarmSteps, startEngine, pauseEngine, stopEngine, startHeartbeat, stopHeartbeat } from "./engine";
import { testConnection } from "./openrouter";
import { insertAgentSchema, insertSwarmSchema } from "@shared/schema";
import { log } from "./index";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
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

  return httpServer;
}
