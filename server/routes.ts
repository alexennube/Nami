import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { eventBus, createSpawn, createSwarmWithQueen, agentAction, swarmAction, runAgentInference, runWorkflow } from "./engine";
import { testConnection } from "./openrouter";
import { insertAgentSchema, insertSwarmSchema, insertWorkflowSchema } from "@shared/schema";
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

  app.delete("/api/swarms/:id", async (req, res) => {
    const swarm = await storage.getSwarm(req.params.id);
    if (!swarm) return res.status(404).json({ message: "Swarm not found" });

    for (const agentId of swarm.agentIds) {
      await storage.deleteAgent(agentId);
    }
    await storage.deleteSwarm(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/workflows", async (_req, res) => {
    const workflows = await storage.getWorkflows();
    res.json(workflows);
  });

  app.get("/api/workflows/:id", async (req, res) => {
    const workflow = await storage.getWorkflow(req.params.id);
    if (!workflow) return res.status(404).json({ message: "Workflow not found" });
    res.json(workflow);
  });

  app.post("/api/workflows", async (req, res) => {
    try {
      const data = insertWorkflowSchema.parse(req.body);
      const workflow = await storage.createWorkflow(data);
      res.status(201).json(workflow);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/workflows/:id/run", async (req, res) => {
    try {
      runWorkflow(req.params.id).catch((err) => {
        log(`Workflow error: ${err.message}`, "engine");
      });
      res.json({ message: "Workflow started" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/workflows/:id", async (req, res) => {
    const deleted = await storage.deleteWorkflow(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Workflow not found" });
    res.json({ success: true });
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
      const config = await storage.updateConfig(req.body);
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

  app.get("/api/messages", async (req, res) => {
    const { agentId, swarmId } = req.query;
    const messages = await storage.getMessages(agentId as string, swarmId as string);
    res.json(messages);
  });

  return httpServer;
}
