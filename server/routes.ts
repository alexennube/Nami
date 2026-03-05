import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { eventBus, createSpawn, createSwarmWithQueen, agentAction, swarmAction, runAgentInference, chatWithNami, runSwarmSteps, startEngine, pauseEngine, stopEngine, startHeartbeat, stopHeartbeat } from "./engine";
import { testConnection } from "./openrouter";
import { fetchGeminiModels, testGeminiConnection, getGoogleAuthUrl, exchangeCodeForTokens, saveRefreshToken, hasValidGeminiCredentials, syncGogCLI, getGogCLIStatus, getGoogleUserInfo, getAccessTokenForRefreshToken } from "./gemini";
import { insertAgentSchema, insertSwarmSchema, skillSchema, swarmScheduleSchema, insertDocPageSchema } from "@shared/schema";
import { log, activeSessions, hashToken } from "./index";
import { getTools, setToolEnabled, getPermissions, updatePermissions } from "./tools";
import { dbGet, dbSet, getGoogleAccounts, upsertGoogleAccount, deleteGoogleAccount, setDefaultGoogleAccount, getDefaultGoogleAccount, dbSaveWorkspaceFile, dbDeleteWorkspaceFile, dbGetKanbanColumns, dbGetKanbanCards, dbUpsertKanbanColumn, dbDeleteKanbanColumn, dbUpsertKanbanCard, dbDeleteKanbanCard, dbSaveKanbanBoard, dbGetKanbanComments, dbAddKanbanComment, dbDeleteKanbanComment, dbDeleteKanbanCommentsByCard, dbGetCrmAccounts, dbGetCrmAccount, dbUpsertCrmAccount, dbDeleteCrmAccount, dbGetCrmContacts, dbGetCrmContactsByAccount, dbGetCrmContact, dbUpsertCrmContact, dbDeleteCrmContact, dbGetCrmContactComments, dbAddCrmContactComment, dbDeleteCrmContactComment, dbGetCrmActivities, dbAddCrmActivity, dbGetCrmSequences, dbGetCrmSequence, dbUpsertCrmSequence, dbDeleteCrmSequence } from "./db-persist";
import crypto from "crypto";
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

  const { addBrowserClient, getBrowserStatus } = await import("./namiextend");
  const namiextendWss = new WebSocketServer({ server: httpServer, path: "/ws/namiextend" });

  namiextendWss.on("connection", (ws) => {
    log("Namiextend connection attempt", "namiextend");
    let authenticated = false;

    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        ws.close(4003, "Auth timeout");
        log("Namiextend auth timeout — disconnected", "namiextend");
      }
    }, 10000);

    ws.on("message", async (data) => {
      if (authenticated) return;

      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "auth" && msg.token) {
          const stored = await dbGet<string>("namiextend_token");
          if (!stored) {
            ws.close(4003, "No token configured");
            clearTimeout(authTimeout);
            log("Namiextend rejected: no token configured on server", "namiextend");
            return;
          }
          if (msg.token !== stored) {
            ws.close(4003, "Unauthorized");
            clearTimeout(authTimeout);
            log("Namiextend rejected: invalid token", "namiextend");
            return;
          }

          authenticated = true;
          clearTimeout(authTimeout);
          addBrowserClient(ws);
          ws.send(JSON.stringify({ type: "auth_ok" }));
          log("Namiextend authenticated and connected", "namiextend");
        }
      } catch {
        ws.close(4003, "Invalid message");
        clearTimeout(authTimeout);
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimeout);
      if (authenticated) {
        log("Namiextend disconnected", "namiextend");
      }
    });
  });

  app.get("/api/namiextend/status", async (_req, res) => {
    const status = getBrowserStatus();
    const host = _req.headers.host || "localhost:5000";
    const protocol = _req.secure || _req.headers["x-forwarded-proto"] === "https" ? "wss" : "ws";
    res.json({ ...status, wsUrl: `${protocol}://${host}/ws/namiextend` });
  });

  app.get("/api/namiextend/token", async (_req, res) => {
    const stored = await dbGet<string>("namiextend_token");
    res.json({ hasToken: !!stored });
  });

  app.get("/api/namiextend/logs", async (_req, res) => {
    const { getRecentBrowserLogs } = await import("./namiextend");
    const logs = await getRecentBrowserLogs(20);
    res.json(logs);
  });

  app.put("/api/namiextend/token", async (req, res) => {
    const { token } = req.body;
    if (!token || typeof token !== "string" || token.trim().length < 4) {
      return res.status(400).json({ message: "Token must be at least 4 characters." });
    }
    await dbSet("namiextend_token", token.trim());
    res.json({ success: true });
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
        maxCycles: data.maxCycles,
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

  app.get("/api/chat/sessions", async (_req, res) => {
    const sessions = await storage.getChatSessions();
    res.json(sessions);
  });

  app.get("/api/chat/sessions/active", async (_req, res) => {
    res.json({ sessionId: storage.getActiveChatSessionId() });
  });

  app.post("/api/chat/sessions", async (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ message: "Session name required" });
    }
    const session = await storage.createChatSession(name.trim());
    storage.setActiveChatSessionId(session.id);
    res.json(session);
  });

  app.patch("/api/chat/sessions/:id", async (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ message: "Name required" });
    }
    const session = await storage.renameChatSession(req.params.id, name.trim());
    if (!session) return res.status(404).json({ message: "Session not found" });
    res.json(session);
  });

  app.post("/api/chat/sessions/:id/activate", async (req, res) => {
    const session = await storage.getChatSession(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    storage.setActiveChatSessionId(session.id);
    res.json({ sessionId: session.id });
  });

  app.delete("/api/chat/sessions/:id", async (req, res) => {
    if (req.params.id === "default") {
      return res.status(400).json({ message: "Cannot delete the default session" });
    }
    const deleted = await storage.deleteChatSession(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Session not found" });
    res.json({ success: true });
  });

  app.get("/api/chat", async (req, res) => {
    const sessionId = (req.query.sessionId as string) || undefined;
    const messages = await storage.getChatHistory(sessionId);
    res.json(messages);
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { message, sessionId } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ message: "Message required" });
      }
      if (sessionId) {
        const session = await storage.getChatSession(sessionId);
        if (!session) {
          return res.status(404).json({ message: "Chat session not found" });
        }
        storage.setActiveChatSessionId(sessionId);
      }
      const activeSessionId = sessionId || storage.getActiveChatSessionId();
      res.json({ accepted: true, message: "Processing...", sessionId: activeSessionId });

      chatWithNami(message, activeSessionId).catch((err) => {
        log(`Chat inference error: ${err.message}`, "engine");
        eventBus.broadcast("chat_stream", {
          streamType: "error",
          error: err.message,
          sessionId: activeSessionId,
        }, "nami");
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/chat", async (req, res) => {
    const sessionId = (req.query.sessionId as string) || undefined;
    await storage.clearChatHistory(sessionId);
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

  const SKILLS_FILE_PATH = path.join(process.cwd(), "skills.md");

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
    const safeConfig = {
      ...config,
      openRouterApiKey: config.openRouterApiKey ? "sk-or-v1-****" : "",
      geminiApiKey: config.geminiApiKey ? "****" : "",
    };
    res.json(safeConfig);
  });

  app.put("/api/config", async (req, res) => {
    try {
      const updates = { ...req.body };
      if (!updates.openRouterApiKey || updates.openRouterApiKey === "sk-or-v1-****" || updates.openRouterApiKey.length < 10) {
        delete updates.openRouterApiKey;
      }
      if (!updates.geminiApiKey || updates.geminiApiKey === "****" || updates.geminiApiKey.length < 5) {
        delete updates.geminiApiKey;
      }
      if (updates.swarmQueenModel !== undefined) {
        delete updates.swarmQueenModel;
      }
      const config = await storage.updateConfig(updates);
      const safeConfig = {
        ...config,
        openRouterApiKey: config.openRouterApiKey ? "sk-or-v1-****" : "",
        geminiApiKey: config.geminiApiKey ? "****" : "",
      };
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

  app.get("/api/models/gemini", async (_req, res) => {
    try {
      const models = await fetchGeminiModels();
      res.json(models);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/config/test-gemini", async (_req, res) => {
    try {
      const result = await testGeminiConnection();
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/config/queen-prompt", async (_req, res) => {
    try {
      const prompt = await dbGet<string>("swarm_queen_prompt");
      res.json({ prompt: prompt || "" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/config/queen-prompt", async (req, res) => {
    try {
      const { prompt } = req.body;
      if (typeof prompt !== "string") return res.status(400).json({ message: "Prompt must be a string" });
      await dbSet("swarm_queen_prompt", prompt);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/auth/google/status", async (_req, res) => {
    const creds = await hasValidGeminiCredentials();
    const gogStatus = await getGogCLIStatus();
    res.json({ authenticated: creds.valid, missing: creds.missing, gogCLI: gogStatus });
  });

  app.get("/api/auth/google", async (req, res) => {
    try {
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || req.hostname;
      const redirectUri = `${protocol}://${host}/api/auth/google/callback`;
      const authUrl = getGoogleAuthUrl(redirectUri);
      res.json({ authUrl, redirectUri });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code, error: authError } = req.query;

    if (authError) {
      log(`Google OAuth error: ${authError}`, "gemini");
      return res.redirect("/integrations?google_auth=error&message=" + encodeURIComponent(String(authError)));
    }

    if (!code || typeof code !== "string") {
      return res.redirect("/integrations?google_auth=error&message=" + encodeURIComponent("No authorization code received"));
    }

    try {
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || req.hostname;
      const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

      const tokens = await exchangeCodeForTokens(code, redirectUri);

      await saveRefreshToken(tokens.refresh_token);

      const userInfo = await getGoogleUserInfo(tokens.access_token);
      if (!userInfo) {
        return res.redirect("/integrations?google_auth=error&message=" + encodeURIComponent("Could not retrieve Google account info"));
      }

      const existingAccounts = await getGoogleAccounts();
      const isFirst = existingAccounts.length === 0;
      const existing = existingAccounts.find(a => a.email === userInfo.email);

      await upsertGoogleAccount({
        id: existing?.id || crypto.randomUUID(),
        email: userInfo.email,
        refresh_token: tokens.refresh_token,
        is_default: existing?.is_default ?? isFirst,
        display_name: userInfo.name || null,
        avatar_url: userInfo.picture || null,
      });

      log(`Google account added/updated: ${userInfo.email} (default=${existing?.is_default ?? isFirst})`, "gemini");

      syncGogCLI(tokens.refresh_token, tokens.access_token).then((result) => {
        if (result.success) {
          log(`gogCLI synced with Google account: ${result.email}`, "gemini");
        } else {
          log(`gogCLI sync warning: ${result.error}`, "gemini");
        }
      }).catch((err) => {
        log(`gogCLI sync error: ${err.message}`, "gemini");
      });

      res.redirect("/integrations?google_auth=success");
    } catch (err: any) {
      log(`Google OAuth callback error: ${err.message}`, "gemini");
      res.redirect("/integrations?google_auth=error&message=" + encodeURIComponent(err.message));
    }
  });

  app.get("/api/integrations/google/accounts", async (_req, res) => {
    try {
      const accounts = await getGoogleAccounts();
      const safeAccounts = accounts.map(({ refresh_token, ...rest }) => rest);
      res.json(safeAccounts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/integrations/google/auth", async (req, res) => {
    try {
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || req.hostname;
      const redirectUri = `${protocol}://${host}/api/auth/google/callback`;
      const authUrl = getGoogleAuthUrl(redirectUri);
      res.json({ authUrl, redirectUri });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/integrations/google/accounts/:id/default", async (req, res) => {
    try {
      const success = await setDefaultGoogleAccount(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Account not found" });
      }
      log(`Default Google account changed to: ${req.params.id}`, "gemini");

      const account = (await getGoogleAccounts()).find(a => a.id === req.params.id);
      if (account) {
        await saveRefreshToken(account.refresh_token);
        getAccessTokenForRefreshToken(account.refresh_token).then(tokenData => {
          syncGogCLI(account.refresh_token, tokenData.access_token).then(result => {
            if (result.success) log(`gogCLI re-synced with new default: ${result.email}`, "gemini");
          });
        }).catch(err => log(`gogCLI re-sync skipped: ${err.message}`, "gemini"));
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/integrations/google/accounts/:id", async (req, res) => {
    try {
      const accounts = await getGoogleAccounts();
      const account = accounts.find(a => a.id === req.params.id);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      if (account.is_default && accounts.length > 1) {
        return res.status(400).json({ message: "Cannot delete the default account. Set another account as default first." });
      }
      await deleteGoogleAccount(req.params.id);
      log(`Google account removed: ${account.email}`, "gemini");

      const remaining = await getGoogleAccounts();
      if (remaining.length === 0) {
        process.env.GOOGLE_REFRESH_TOKEN = "";
        await dbSet("google_refresh_token", "");
        log("All Google accounts removed — cleared legacy token", "gemini");
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/integrations/google/accounts/:id/test", async (req, res) => {
    try {
      const accounts = await getGoogleAccounts();
      const account = accounts.find(a => a.id === req.params.id);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      const tokenData = await getAccessTokenForRefreshToken(account.refresh_token);
      const userInfo = await getGoogleUserInfo(tokenData.access_token);
      res.json({
        success: true,
        message: `Connection OK — authenticated as ${userInfo?.email || account.email}`,
      });
    } catch (error: any) {
      res.json({ success: false, message: `Connection failed: ${error.message}` });
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

  const WORKSPACE_ROOT = process.cwd();
  const BLOCKED_BROWSE = ["node_modules", ".git", ".cache", "dist", ".upm", ".config", ".local"];

  function isBlockedBrowse(relative: string): boolean {
    return BLOCKED_BROWSE.some((b) => relative === b || relative.startsWith(b + "/"));
  }

  app.get("/api/files", async (req, res) => {
    const dir = (req.query.path as string) || ".";
    const resolved = path.resolve(WORKSPACE_ROOT, dir);
    if (!resolved.startsWith(WORKSPACE_ROOT)) return res.status(403).json({ message: "Access denied" });

    try {
      const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
      const relative = path.relative(WORKSPACE_ROOT, resolved);
      const items = entries
        .map((e) => {
          const entryRelative = relative ? `${relative}/${e.name}` : e.name;
          if (isBlockedBrowse(entryRelative)) return null;
          if (e.name.startsWith(".") && e.isDirectory()) return null;
          return {
            name: e.name,
            path: entryRelative,
            isDirectory: e.isDirectory(),
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      res.json({ path: relative || ".", items });
    } catch (err: any) {
      res.status(404).json({ message: "Directory not found" });
    }
  });

  app.get("/api/files/read", async (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ message: "Path required" });

    const resolved = path.resolve(WORKSPACE_ROOT, filePath);
    if (!resolved.startsWith(WORKSPACE_ROOT)) return res.status(403).json({ message: "Access denied" });

    const relative = path.relative(WORKSPACE_ROOT, resolved);
    if (isBlockedBrowse(relative)) return res.status(403).json({ message: "Access denied" });

    try {
      const stat = await fs.promises.stat(resolved);
      if (stat.isDirectory()) return res.status(400).json({ message: "Cannot read a directory" });
      if (stat.size > 500000) return res.status(413).json({ message: "File too large (>500KB)" });

      const ext = path.extname(resolved).toLowerCase();
      const binaryExts = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".pdf", ".zip", ".tar", ".gz", ".exe", ".bin"];
      if (binaryExts.includes(ext)) {
        return res.json({ path: filePath, binary: true, size: stat.size, extension: ext });
      }

      const content = await fs.promises.readFile(resolved, "utf-8");
      res.json({
        path: filePath,
        content,
        size: stat.size,
        extension: ext,
        lastModified: stat.mtime.toISOString(),
      });
    } catch (err: any) {
      res.status(404).json({ message: "File not found" });
    }
  });

  app.get("/api/files/download", async (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ message: "Path required" });

    const resolved = path.resolve(WORKSPACE_ROOT, filePath);
    if (!resolved.startsWith(WORKSPACE_ROOT)) return res.status(403).json({ message: "Access denied" });

    const relative = path.relative(WORKSPACE_ROOT, resolved);
    if (isBlockedBrowse(relative)) return res.status(403).json({ message: "Access denied" });

    try {
      const stat = await fs.promises.stat(resolved);
      if (stat.isDirectory()) return res.status(400).json({ message: "Cannot download a directory" });

      const filename = path.basename(resolved);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", stat.size);
      const stream = fs.createReadStream(resolved);
      stream.pipe(res);
    } catch (err: any) {
      res.status(404).json({ message: "File not found" });
    }
  });

  app.put("/api/files", async (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath || typeof content !== "string") return res.status(400).json({ message: "Path and content required" });

    const resolved = path.resolve(WORKSPACE_ROOT, filePath);
    if (!resolved.startsWith(WORKSPACE_ROOT)) return res.status(403).json({ message: "Access denied" });

    const relative = path.relative(WORKSPACE_ROOT, resolved);
    if (isBlockedBrowse(relative)) return res.status(403).json({ message: "Cannot edit system files" });

    try {
      const dir = path.dirname(resolved);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(resolved, content, "utf-8");
      dbSaveWorkspaceFile(relative, content).catch((e: any) =>
        console.error(`[routes] DB persist file FAILED for ${relative}: ${e.message}`)
      );
      res.json({ success: true, path: filePath });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/files", async (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ message: "Path required" });

    const resolved = path.resolve(WORKSPACE_ROOT, filePath);
    if (!resolved.startsWith(WORKSPACE_ROOT) || resolved === WORKSPACE_ROOT) return res.status(403).json({ message: "Access denied" });

    const relative = path.relative(WORKSPACE_ROOT, resolved);
    if (isBlockedBrowse(relative)) return res.status(403).json({ message: "Cannot delete system files" });

    try {
      const stat = await fs.promises.stat(resolved);
      if (stat.isDirectory()) {
        await fs.promises.rm(resolved, { recursive: true });
        const { dbDeleteWorkspaceFilesUnderDir } = await import("./db-persist");
        dbDeleteWorkspaceFilesUnderDir(relative).catch((e: any) =>
          console.error(`[routes] DB delete dir files FAILED for ${relative}: ${e.message}`)
        );
      } else {
        await fs.promises.unlink(resolved);
        dbDeleteWorkspaceFile(relative).catch((e: any) =>
          console.error(`[routes] DB delete file FAILED for ${relative}: ${e.message}`)
        );
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(404).json({ message: "File not found" });
    }
  });

  app.get("/api/x/status", async (_req, res) => {
    const { getXStatus } = await import("./x-api");
    res.json(getXStatus());
  });

  app.post("/api/x/test", async (_req, res) => {
    const { postToX, hasXCredentials } = await import("./x-api");
    if (!hasXCredentials()) {
      return res.status(400).json({ success: false, error: "X credentials not configured" });
    }
    const testText = `Nami agent system test - ${new Date().toISOString().slice(0, 16)}`;
    const result = await postToX(testText);
    res.json(result);
  });

  app.post("/api/x/post", async (req, res) => {
    const { postToX, hasXCredentials } = await import("./x-api");
    if (!hasXCredentials()) {
      return res.status(400).json({ success: false, error: "X credentials not configured" });
    }
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ success: false, error: "text is required" });
    }
    const result = await postToX(text);
    res.json(result);
  });

  app.post("/api/x/delete", async (req, res) => {
    const { deleteFromX, hasXCredentials } = await import("./x-api");
    if (!hasXCredentials()) {
      return res.status(400).json({ success: false, error: "X credentials not configured" });
    }
    const { tweetId } = req.body;
    if (!tweetId || typeof tweetId !== "string") {
      return res.status(400).json({ success: false, error: "tweetId is required" });
    }
    const result = await deleteFromX(tweetId);
    res.json(result);
  });

  app.get("/api/kanban", async (_req, res) => {
    try {
      const columns = await dbGetKanbanColumns();
      const cards = await dbGetKanbanCards();
      if (columns.length === 0) {
        const defaultColumns = [
          { id: crypto.randomUUID(), title: "To Do", order: 0 },
          { id: crypto.randomUUID(), title: "In Progress", order: 1 },
          { id: crypto.randomUUID(), title: "Done", order: 2 },
        ];
        for (const col of defaultColumns) await dbUpsertKanbanColumn(col);
        res.json({ columns: defaultColumns, cards: [] });
      } else {
        res.json({ columns, cards });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kanban/columns", async (req, res) => {
    try {
      const { title } = req.body;
      if (!title) return res.status(400).json({ error: "title required" });
      const columns = await dbGetKanbanColumns();
      const col = { id: crypto.randomUUID(), title, order: columns.length };
      await dbUpsertKanbanColumn(col);
      res.json(col);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/kanban/columns/:id", async (req, res) => {
    try {
      const columns = await dbGetKanbanColumns();
      const col = columns.find(c => c.id === req.params.id);
      if (!col) return res.status(404).json({ error: "Column not found" });
      const updated = { ...col, ...req.body, id: req.params.id };
      await dbUpsertKanbanColumn(updated);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/kanban/columns/:id", async (req, res) => {
    try {
      await dbDeleteKanbanColumn(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kanban/cards", async (req, res) => {
    try {
      const { columnId, title, description, priority, labels } = req.body;
      if (!columnId || !title) return res.status(400).json({ error: "columnId and title required" });
      const cards = await dbGetKanbanCards();
      const colCards = cards.filter(c => c.columnId === columnId);
      const now = new Date().toISOString();
      const card = {
        id: crypto.randomUUID(),
        columnId,
        title,
        description: description || "",
        order: colCards.length,
        priority: priority || "medium",
        status: req.body.status || "not_started",
        labels: labels || [],
        createdAt: now,
        updatedAt: now,
      };
      await dbUpsertKanbanCard(card);
      res.json(card);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/kanban/cards/:id", async (req, res) => {
    try {
      const cards = await dbGetKanbanCards();
      const card = cards.find(c => c.id === req.params.id);
      if (!card) return res.status(404).json({ error: "Card not found" });
      const updated = { ...card, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
      await dbUpsertKanbanCard(updated);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/kanban/cards/:id", async (req, res) => {
    try {
      await dbDeleteKanbanCommentsByCard(req.params.id);
      await dbDeleteKanbanCard(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/kanban/cards/:id/comments", async (req, res) => {
    try {
      const comments = await dbGetKanbanComments(req.params.id);
      res.json(comments);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kanban/cards/:id/comments", async (req, res) => {
    try {
      const { author, authorType, content } = req.body;
      if (!content || !author) return res.status(400).json({ error: "author and content required" });
      const validTypes = ["user", "agent", "queen"];
      const safeAuthorType = validTypes.includes(authorType) ? authorType : "user";
      const cards = await dbGetKanbanCards();
      if (!cards.find((c: any) => c.id === req.params.id)) {
        return res.status(404).json({ error: "Card not found" });
      }
      const comment = {
        id: crypto.randomUUID(),
        cardId: req.params.id,
        author: String(author).substring(0, 100),
        authorType: safeAuthorType,
        content: String(content).substring(0, 10000),
        createdAt: new Date().toISOString(),
      };
      await dbAddKanbanComment(comment);
      res.json(comment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/kanban/comments/:id", async (req, res) => {
    try {
      await dbDeleteKanbanComment(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/kanban/cards/:id/move", async (req, res) => {
    try {
      const { columnId, order } = req.body;
      if (!columnId || order === undefined) return res.status(400).json({ error: "columnId and order required" });
      const cards = await dbGetKanbanCards();
      const card = cards.find(c => c.id === req.params.id);
      if (!card) return res.status(404).json({ error: "Card not found" });
      const targetCards = cards.filter(c => c.columnId === columnId && c.id !== req.params.id).sort((a, b) => a.order - b.order);
      targetCards.splice(order, 0, { ...card, columnId, updatedAt: new Date().toISOString() });
      for (let i = 0; i < targetCards.length; i++) {
        targetCards[i].order = i;
        await dbUpsertKanbanCard(targetCards[i]);
      }
      if (card.columnId !== columnId) {
        const oldCards = cards.filter(c => c.columnId === card.columnId && c.id !== req.params.id).sort((a, b) => a.order - b.order);
        for (let i = 0; i < oldCards.length; i++) {
          oldCards[i].order = i;
          await dbUpsertKanbanCard(oldCards[i]);
        }
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/kanban/columns/reorder", async (req, res) => {
    try {
      const { columnIds } = req.body;
      if (!columnIds || !Array.isArray(columnIds)) return res.status(400).json({ error: "columnIds array required" });
      const columns = await dbGetKanbanColumns();
      for (let i = 0; i < columnIds.length; i++) {
        const col = columns.find(c => c.id === columnIds[i]);
        if (col) {
          col.order = i;
          await dbUpsertKanbanColumn(col);
        }
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/crm/accounts", async (_req, res) => {
    try {
      const accounts = await dbGetCrmAccounts();
      res.json(accounts);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/accounts/:id", async (req, res) => {
    try {
      const account = await dbGetCrmAccount(req.params.id);
      if (!account) return res.status(404).json({ error: "Account not found" });
      res.json(account);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/accounts", async (req, res) => {
    try {
      const { name, domain, industry, description, website, size } = req.body;
      if (!name) return res.status(400).json({ error: "name required" });
      const now = new Date().toISOString();
      const account = { id: crypto.randomUUID(), name, domain: domain || "", industry: industry || "", description: description || "", website: website || "", size: size || "", createdAt: now, updatedAt: now };
      await dbUpsertCrmAccount(account);
      res.status(201).json(account);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/crm/accounts/:id", async (req, res) => {
    try {
      const existing = await dbGetCrmAccount(req.params.id);
      if (!existing) return res.status(404).json({ error: "Account not found" });
      const updated = { ...existing, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
      await dbUpsertCrmAccount(updated);
      res.json(updated);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/crm/accounts/:id", async (req, res) => {
    try {
      await dbDeleteCrmAccount(req.params.id);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/contacts", async (req, res) => {
    try {
      const accountId = req.query.accountId as string;
      const contacts = accountId ? await dbGetCrmContactsByAccount(accountId) : await dbGetCrmContacts();
      res.json(contacts);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/contacts/:id", async (req, res) => {
    try {
      const contact = await dbGetCrmContact(req.params.id);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      res.json(contact);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/contacts", async (req, res) => {
    try {
      const { firstName, lastName } = req.body;
      if (!firstName || !lastName) return res.status(400).json({ error: "firstName and lastName required" });
      const now = new Date().toISOString();
      const contact = {
        id: crypto.randomUUID(),
        accountId: req.body.accountId || null,
        firstName, lastName,
        email: req.body.email || "", phone: req.body.phone || "",
        title: req.body.title || "", company: req.body.company || "",
        linkedIn: req.body.linkedIn || "", twitter: req.body.twitter || "",
        website: req.body.website || "", notes: req.body.notes || "",
        tags: req.body.tags || [], stage: req.body.stage || "lead",
        sequenceId: null, sequenceStep: null,
        createdAt: now, updatedAt: now,
      };
      await dbUpsertCrmContact(contact);
      res.status(201).json(contact);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/crm/contacts/:id", async (req, res) => {
    try {
      const existing = await dbGetCrmContact(req.params.id);
      if (!existing) return res.status(404).json({ error: "Contact not found" });
      const updated = { ...existing, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
      await dbUpsertCrmContact(updated);
      res.json(updated);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/crm/contacts/:id", async (req, res) => {
    try {
      await dbDeleteCrmContact(req.params.id);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/contacts/:id/comments", async (req, res) => {
    try {
      const comments = await dbGetCrmContactComments(req.params.id);
      res.json(comments);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/contacts/:id/comments", async (req, res) => {
    try {
      const { author, authorType, content } = req.body;
      if (!content || !author) return res.status(400).json({ error: "author and content required" });
      const validTypes = ["user", "agent", "queen"];
      const comment = {
        id: crypto.randomUUID(), contactId: req.params.id,
        author: String(author).substring(0, 100),
        authorType: validTypes.includes(authorType) ? authorType : "user",
        content: String(content).substring(0, 10000),
        createdAt: new Date().toISOString(),
      };
      await dbAddCrmContactComment(comment);
      res.json(comment);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/crm/comments/:id", async (req, res) => {
    try {
      await dbDeleteCrmContactComment(req.params.id);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/contacts/:id/activities", async (req, res) => {
    try {
      const activities = await dbGetCrmActivities(req.params.id);
      res.json(activities);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/contacts/:id/activities", async (req, res) => {
    try {
      const { type, title, description, metadata, agentName } = req.body;
      if (!type || !title) return res.status(400).json({ error: "type and title required" });
      const activity = {
        id: crypto.randomUUID(), contactId: req.params.id,
        type, title, description: description || "",
        metadata: metadata || {}, agentName: agentName || "",
        createdAt: new Date().toISOString(),
      };
      await dbAddCrmActivity(activity);
      res.json(activity);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/sequences", async (_req, res) => {
    try {
      const sequences = await dbGetCrmSequences();
      res.json(sequences);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/crm/sequences/:id", async (req, res) => {
    try {
      const seq = await dbGetCrmSequence(req.params.id);
      if (!seq) return res.status(404).json({ error: "Sequence not found" });
      res.json(seq);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/sequences", async (req, res) => {
    try {
      const { name, description, steps } = req.body;
      if (!name) return res.status(400).json({ error: "name required" });
      const now = new Date().toISOString();
      const seq = {
        id: crypto.randomUUID(), name, description: description || "",
        status: "draft" as const, steps: steps || [],
        contactIds: [], createdAt: now, updatedAt: now,
      };
      await dbUpsertCrmSequence(seq);
      res.status(201).json(seq);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/crm/sequences/:id", async (req, res) => {
    try {
      const existing = await dbGetCrmSequence(req.params.id);
      if (!existing) return res.status(404).json({ error: "Sequence not found" });
      const updated = { ...existing, ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
      await dbUpsertCrmSequence(updated);
      res.json(updated);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/crm/sequences/:id", async (req, res) => {
    try {
      await dbDeleteCrmSequence(req.params.id);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/sequences/:id/enroll", async (req, res) => {
    try {
      const { contactIds } = req.body;
      if (!contactIds || !Array.isArray(contactIds)) return res.status(400).json({ error: "contactIds array required" });
      const seq = await dbGetCrmSequence(req.params.id);
      if (!seq) return res.status(404).json({ error: "Sequence not found" });
      const existing = seq.contactIds || [];
      const newIds = contactIds.filter((id: string) => !existing.includes(id));
      seq.contactIds = [...existing, ...newIds];
      seq.updatedAt = new Date().toISOString();
      await dbUpsertCrmSequence(seq);
      for (const cid of newIds) {
        const contact = await dbGetCrmContact(cid);
        if (contact) {
          contact.sequenceId = seq.id;
          contact.sequenceStep = 0;
          contact.updatedAt = new Date().toISOString();
          await dbUpsertCrmContact(contact);
        }
      }
      res.json({ enrolled: newIds.length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/crm/sequences/:id/unenroll", async (req, res) => {
    try {
      const { contactIds } = req.body;
      if (!contactIds || !Array.isArray(contactIds)) return res.status(400).json({ error: "contactIds array required" });
      const seq = await dbGetCrmSequence(req.params.id);
      if (!seq) return res.status(404).json({ error: "Sequence not found" });
      seq.contactIds = (seq.contactIds || []).filter((id: string) => !contactIds.includes(id));
      seq.updatedAt = new Date().toISOString();
      await dbUpsertCrmSequence(seq);
      for (const cid of contactIds) {
        const contact = await dbGetCrmContact(cid);
        if (contact && contact.sequenceId === seq.id) {
          contact.sequenceId = null;
          contact.sequenceStep = null;
          contact.updatedAt = new Date().toISOString();
          await dbUpsertCrmContact(contact);
        }
      }
      res.json({ unenrolled: contactIds.length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  return httpServer;
}
