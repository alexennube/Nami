import {
  createAgentSession,
  type AgentSession,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  codingTools,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import type { Model } from "@mariozechner/pi-ai";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import { storage } from "./storage";
import { log } from "./index";
import { executeToolCall } from "./tools";
import type { EngineMindStatus } from "@shared/schema";

function extractTextFromMessages(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && msg.role === "assistant" && msg.content) {
      if (typeof msg.content === "string") return msg.content;
      if (Array.isArray(msg.content)) {
        const textPart = msg.content.find((c: any) => c.type === "text" && c.text);
        if (textPart) return textPart.text;
      }
    }
  }
  return "";
}

interface EngineMindStats {
  totalPrompts: number;
  totalCompactions: number;
  totalToolExecutions: number;
  totalSelfHeals: number;
  lastActivity: string | null;
  errors: Array<{ timestamp: string; message: string; recovered: boolean }>;
}

class EngineMind {
  private session: AgentSession | null = null;
  private initialized = false;
  private currentModel = "";
  private stats: EngineMindStats = {
    totalPrompts: 0,
    totalCompactions: 0,
    totalToolExecutions: 0,
    totalSelfHeals: 0,
    lastActivity: null,
    errors: [],
  };

  async initialize(): Promise<boolean> {
    try {
      const config = await storage.getConfig();
      if (!config.engineMindEnabled) {
        log("Engine Mind disabled in config", "engine-mind");
        return false;
      }

      const engineProvider = config.engineProvider || "openrouter";
      let apiKey: string | undefined;

      if (engineProvider === "gemini") {
        const { getGeminiAccessToken } = await import("./gemini");
        try {
          apiKey = await getGeminiAccessToken();
        } catch (err: any) {
          log(`Engine Mind: Failed to get Gemini access token: ${err.message}`, "engine-mind");
          return false;
        }
      } else {
        apiKey = config.openRouterApiKey || process.env.OPENROUTER_API_KEY;
      }

      if (!apiKey) {
        log(`Engine Mind: No API key available for provider ${engineProvider}`, "engine-mind");
        return false;
      }

      const modelId = config.engineMindModel || config.defaultModel;
      this.currentModel = modelId;

      const authStorage = AuthStorage.inMemory();
      const piProvider = engineProvider === "gemini" ? "google" : "openrouter";
      authStorage.setRuntimeApiKey(piProvider, apiKey);

      const modelRegistry = new ModelRegistry(authStorage);

      let model: Model<any>;
      try {
        const found = modelRegistry.find(piProvider, modelId);
        if (found) {
          model = found;
        } else {
          model = getModel(piProvider as any, (engineProvider === "gemini" ? "gemini-2.0-flash" : "openrouter/auto") as any);
        }
      } catch {
        model = getModel(piProvider as any, (engineProvider === "gemini" ? "gemini-2.0-flash" : "openrouter/auto") as any);
      }

      const { session } = await createAgentSession({
        cwd: process.cwd(),
        model,
        thinkingLevel: "medium",
        tools: codingTools,
        sessionManager: SessionManager.inMemory(),
        authStorage,
        modelRegistry,
      });

      session.subscribe((event: AgentSessionEvent) => {
        this.handleSessionEvent(event);
      });

      this.session = session;
      this.initialized = true;
      this.stats.lastActivity = new Date().toISOString();

      log(`Engine Mind initialized with model: ${modelId}`, "engine-mind");

      await storage.addThought({
        content: `Engine Mind (Pi) initialized. Model: ${modelId}. Self-healing and validation active.`,
        source: "engine-mind",
        type: "observation",
      });

      return true;
    } catch (err: any) {
      log(`Engine Mind init error: ${err.message}`, "engine-mind");
      this.stats.errors.push({
        timestamp: new Date().toISOString(),
        message: `Init failed: ${err.message}`,
        recovered: false,
      });
      return false;
    }
  }

  async shutdown(): Promise<void> {
    if (this.session) {
      try {
        this.session.dispose();
      } catch (err: any) {
        log(`Engine Mind dispose error: ${err.message}`, "engine-mind");
      }
      this.session = null;
      this.initialized = false;
      log("Engine Mind shut down", "engine-mind");
    }
  }

  async reinitialize(): Promise<boolean> {
    await this.shutdown();
    return this.initialize();
  }

  private handleSessionEvent(event: AgentSessionEvent): void {
    switch (event.type) {
      case "auto_compaction_start":
        this.stats.totalCompactions++;
        log(`Engine Mind auto-compaction started: ${event.reason}`, "engine-mind");
        break;
      case "auto_compaction_end":
        if (event.errorMessage) {
          log(`Engine Mind compaction error: ${event.errorMessage}`, "engine-mind");
        } else {
          log("Engine Mind compaction completed", "engine-mind");
        }
        break;
      case "auto_retry_start":
        this.stats.totalSelfHeals++;
        log(`Engine Mind self-heal retry ${event.attempt}/${event.maxAttempts}: ${event.errorMessage}`, "engine-mind");
        break;
      case "auto_retry_end":
        if (event.success) {
          log(`Engine Mind self-heal succeeded on attempt ${event.attempt}`, "engine-mind");
        } else {
          log(`Engine Mind self-heal failed: ${event.finalError}`, "engine-mind");
          this.stats.errors.push({
            timestamp: new Date().toISOString(),
            message: `Self-heal failed: ${event.finalError}`,
            recovered: false,
          });
        }
        break;
    }
  }

  async executeWithHealing(
    toolName: string,
    args: Record<string, any>,
  ): Promise<{ result: string; healed: boolean; healDetails?: string }> {
    if (!this.initialized || !this.session) {
      const directResult = await executeToolCall(toolName, args);
      return { result: directResult, healed: false };
    }

    let result;
    try {
      result = await executeToolCall(toolName, args);
    } catch (err: any) {
      log(`Engine Mind execution error on ${toolName}: ${err.message}`, "engine-mind");
      result = `Error: ${err.message}`;
    }

    try {
      if (!result.startsWith("Error:")) {
        this.stats.totalToolExecutions++;
        return { result, healed: false };
      }

      this.stats.totalSelfHeals++;
      this.stats.totalToolExecutions++;
      this.stats.lastActivity = new Date().toISOString();

      const healPrompt = `[HEAL] A Nami tool execution failed. Analyze the error and attempt to fix the underlying issue using your workspace tools (read, write, edit, bash).

Tool: "${toolName}"
Arguments: ${JSON.stringify(args)}
Error: ${result}

Steps:
1. Diagnose why this failed
2. If it's a file not found, path issue, or permission problem, try to fix it
3. Report what you found and what you fixed

Be concise.`;

      await this.session.prompt(healPrompt);
      this.stats.totalPrompts++;

      const healDetails = extractTextFromMessages(this.session.messages as any[]);

      await storage.addThought({
        content: `[Engine Mind HEAL] Tool "${toolName}" failed. Recovery attempted: ${healDetails.substring(0, 200)}`,
        source: "engine-mind",
        type: "action",
      });

      const retryResult = await executeToolCall(toolName, args);
      const recovered = !retryResult.startsWith("Error:");

      this.stats.errors.push({
        timestamp: new Date().toISOString(),
        message: `${recovered ? "Healed" : "Failed"}: ${toolName} - ${result.substring(0, 100)}`,
        recovered,
      });

      return {
        result: recovered ? retryResult : result,
        healed: recovered,
        healDetails,
      };
    } catch (err: any) {
      log(`Engine Mind healing error: ${err.message}`, "engine-mind");
      const directResult = await executeToolCall(toolName, args);
      return { result: directResult, healed: false };
    }
  }

  async validateSpawn(spawnConfig: {
    name: string;
    model: string;
    systemPrompt: string;
    parentId: string | null;
    swarmId: string | null;
  }): Promise<{ valid: boolean; issues: string[]; suggestions: string[] }> {
    if (!this.initialized || !this.session) {
      return { valid: true, issues: [], suggestions: [] };
    }

    try {
      this.stats.totalPrompts++;
      this.stats.lastActivity = new Date().toISOString();

      const validatePrompt = `[VALIDATE] Validate this spawn agent configuration before creation:

Name: ${spawnConfig.name}
Model: ${spawnConfig.model}
System Prompt: ${spawnConfig.systemPrompt}
Parent ID: ${spawnConfig.parentId || "none"}
Swarm ID: ${spawnConfig.swarmId || "none"}

Check:
1. Is the system prompt specific and actionable (not too generic)?
2. Is the model ID a valid OpenRouter model format (provider/model-name)?
3. Are there any potential conflicts?

Respond in this exact format:
VALID: true/false
ISSUES: issue1 | issue2 (or "none")
SUGGESTIONS: suggestion1 | suggestion2 (or "none")`;

      await this.session.prompt(validatePrompt);

      const responseText = extractTextFromMessages(this.session.messages as any[]);

      const valid = !responseText.toLowerCase().includes("valid: false");
      const issuesMatch = responseText.match(/ISSUES:\s*(.+?)(?:\n|$)/i);
      const suggestionsMatch = responseText.match(/SUGGESTIONS:\s*(.+?)(?:\n|$)/i);

      const issues = issuesMatch && issuesMatch[1].trim().toLowerCase() !== "none"
        ? issuesMatch[1].split("|").map(s => s.trim()).filter(Boolean)
        : [];

      const suggestions = suggestionsMatch && suggestionsMatch[1].trim().toLowerCase() !== "none"
        ? suggestionsMatch[1].split("|").map(s => s.trim()).filter(Boolean)
        : [];

      await storage.addThought({
        content: `[Engine Mind VALIDATE] Spawn "${spawnConfig.name}": ${valid ? "valid" : "issues found"} - ${issues.join(", ") || "no issues"}`,
        source: "engine-mind",
        type: "observation",
      });

      return { valid, issues, suggestions };
    } catch (err: any) {
      log(`Engine Mind validation error: ${err.message}`, "engine-mind");
      return { valid: true, issues: [], suggestions: [`Validation skipped: ${err.message}`] };
    }
  }

  async compactChatHistory(): Promise<{ compacted: boolean; summary?: string; originalCount: number; newCount: number }> {
    const chatHistory = await storage.getChatHistory();
    const originalCount = chatHistory.length;

    if (originalCount < 40) {
      return { compacted: false, originalCount, newCount: originalCount };
    }

    if (!this.initialized || !this.session) {
      return { compacted: false, originalCount, newCount: originalCount };
    }

    try {
      this.stats.totalPrompts++;
      this.stats.totalCompactions++;
      this.stats.lastActivity = new Date().toISOString();

      const cleanHistory = chatHistory.filter((m) => {
        if (m.role === "assistant" && m.content.includes("I'm currently **stopped**")) return false;
        if (m.role === "assistant" && m.content.includes("I'm currently **paused**")) return false;
        return true;
      });
      const oldMessages = cleanHistory.slice(0, cleanHistory.length - 20);
      const recentMessages = cleanHistory.slice(-20);

      const oldContent = oldMessages
        .map(m => `[${m.role}${m.autonomous ? " (auto)" : ""}]: ${m.content.substring(0, 200)}`)
        .join("\n");

      const compactPrompt = `[COMPACT] Summarize the following conversation history into a concise context summary. Preserve key decisions, configurations, task outcomes, and important facts. This summary will replace the older messages to prevent context overflow.

Old messages (${oldMessages.length} messages):
${oldContent}

Provide a single paragraph summary preserving the most important context.`;

      await this.session.prompt(compactPrompt);

      let summary = extractTextFromMessages(this.session.messages as any[]);
      if (!summary) summary = "Previous conversation context preserved.";

      await storage.clearChatHistory();

      await storage.addChatMessage({
        role: "assistant",
        content: `[Context Summary] ${summary}`,
        agentId: "engine-mind",
        agentName: "Engine Mind",
        tokensUsed: 0,
        autonomous: true,
      });

      for (const msg of recentMessages) {
        await storage.addChatMessage({
          role: msg.role,
          content: msg.content,
          agentId: msg.agentId,
          agentName: msg.agentName,
          tokensUsed: msg.tokensUsed,
          autonomous: msg.autonomous,
        });
      }

      await storage.addThought({
        content: `[Engine Mind COMPACT] Chat history compacted: ${originalCount} -> ${recentMessages.length + 1} messages`,
        source: "engine-mind",
        type: "action",
      });

      log(`Engine Mind compacted chat: ${originalCount} -> ${recentMessages.length + 1}`, "engine-mind");

      return {
        compacted: true,
        summary,
        originalCount,
        newCount: recentMessages.length + 1,
      };
    } catch (err: any) {
      log(`Engine Mind compaction error: ${err.message}`, "engine-mind");
      return { compacted: false, originalCount, newCount: originalCount };
    }
  }

  async runDiagnostic(): Promise<string> {
    if (!this.initialized || !this.session) {
      return "Engine Mind not initialized";
    }

    try {
      this.stats.totalPrompts++;
      this.stats.lastActivity = new Date().toISOString();

      const agents = await storage.getAgents();
      const swarms = await storage.getSwarms();
      const config = await storage.getConfig();

      const diagnosticPrompt = `Run a quick diagnostic check on the Nami system:
- ${agents.length} agents (${agents.filter(a => a.status === "running").length} running)
- ${swarms.length} swarms (${swarms.filter(s => s.status === "active").length} active)
- Model: ${config.defaultModel}
- Engine Mind model: ${config.engineMindModel || config.defaultModel}

Use bash to check disk usage and any obvious workspace issues. Report briefly.`;

      await this.session.prompt(diagnosticPrompt);

      return extractTextFromMessages(this.session.messages as any[]) || "Diagnostic completed.";
    } catch (err: any) {
      return `Diagnostic error: ${err.message}`;
    }
  }

  getStatus(): EngineMindStatus {
    return {
      initialized: this.initialized,
      sessionActive: this.session !== null,
      model: this.currentModel || "none",
      totalPrompts: this.stats.totalPrompts,
      totalCompactions: this.stats.totalCompactions,
      totalToolExecutions: this.stats.totalToolExecutions,
      totalSelfHeals: this.stats.totalSelfHeals,
      lastActivity: this.stats.lastActivity,
      errors: this.stats.errors.slice(-20),
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const engineMind = new EngineMind();
