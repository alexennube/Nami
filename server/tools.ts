import * as fs from "fs";
import * as path from "path";
import { exec, execFile } from "child_process";
import { log } from "./index";

const WORKSPACE_ROOT = process.cwd();

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
}

export interface NamiTool {
  name: string;
  description: string;
  category: "filesystem" | "execution" | "system" | "browser" | "google" | "mcp";
  enabled: boolean;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required: string[];
  };
  execute: (args: Record<string, any>) => Promise<string>;
}

export interface ToolPermissions {
  fileRead: boolean;
  fileWrite: boolean;
  fileList: boolean;
  shellExec: boolean;
  maxFileSize: number;
  allowedWritePaths: string[];
  blockedPaths: string[];
  shellTimeout: number;
}

const DEFAULT_PERMISSIONS: ToolPermissions = {
  fileRead: true,
  fileWrite: true,
  fileList: true,
  shellExec: true,
  maxFileSize: 100000,
  allowedWritePaths: ["."],
  blockedPaths: ["node_modules", ".git", ".nami-data"],
  shellTimeout: 10000,
};

let permissions: ToolPermissions = { ...DEFAULT_PERMISSIONS };

export function getPermissions(): ToolPermissions {
  return { ...permissions };
}

export function updatePermissions(updates: Partial<ToolPermissions>): ToolPermissions {
  if (typeof updates.fileRead === "boolean") permissions.fileRead = updates.fileRead;
  if (typeof updates.fileWrite === "boolean") permissions.fileWrite = updates.fileWrite;
  if (typeof updates.fileList === "boolean") permissions.fileList = updates.fileList;
  if (typeof updates.shellExec === "boolean") permissions.shellExec = updates.shellExec;
  if (typeof updates.maxFileSize === "number" && updates.maxFileSize > 0) permissions.maxFileSize = updates.maxFileSize;
  if (typeof updates.shellTimeout === "number" && updates.shellTimeout > 0) permissions.shellTimeout = Math.min(updates.shellTimeout, 30000);
  if (Array.isArray(updates.blockedPaths)) permissions.blockedPaths = updates.blockedPaths;
  if (Array.isArray(updates.allowedWritePaths)) permissions.allowedWritePaths = updates.allowedWritePaths;
  return { ...permissions };
}

function resolveAndValidate(filePath: string): { resolved: string; relative: string } | null {
  const normalized = path.normalize(filePath);
  const resolved = path.resolve(WORKSPACE_ROOT, normalized);

  if (!resolved.startsWith(WORKSPACE_ROOT + path.sep) && resolved !== WORKSPACE_ROOT) {
    return null;
  }

  const relative = path.relative(WORKSPACE_ROOT, resolved);
  if (relative.startsWith("..")) return null;

  return { resolved, relative };
}

function isPathBlocked(filePath: string): boolean {
  const result = resolveAndValidate(filePath);
  if (!result) return true;

  return permissions.blockedPaths.some((blocked) =>
    result.relative.startsWith(blocked + path.sep) || result.relative === blocked
  );
}

function isWriteAllowed(filePath: string): boolean {
  const result = resolveAndValidate(filePath);
  if (!result) return false;

  if (isPathBlocked(filePath)) return false;

  return permissions.allowedWritePaths.some((allowed) => {
    if (allowed === ".") return true;
    return result.relative.startsWith(allowed + path.sep) || result.relative === allowed;
  });
}

function resolvePath(filePath: string): string {
  return path.resolve(WORKSPACE_ROOT, filePath);
}

const fileReadTool: NamiTool = {
  name: "file_read",
  description: "Read the contents of a file in the workspace. Use this to inspect source code, configuration, data files, or any text file. Returns the file content as text.",
  category: "filesystem",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file from the workspace root (e.g., 'server/engine.ts', 'shared/schema.ts', 'package.json')",
      },
      max_lines: {
        type: "number",
        description: "Maximum number of lines to read. Defaults to 200. Use for large files.",
      },
    },
    required: ["path"],
  },
  execute: async (args) => {
    if (!permissions.fileRead) return "Error: file_read permission is disabled.";

    const filePath = args.path as string;
    if (isPathBlocked(filePath)) return `Error: Access to '${filePath}' is restricted.`;

    const resolved = resolvePath(filePath);
    if (!fs.existsSync(resolved)) return `Error: File '${filePath}' not found.`;

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) return `Error: '${filePath}' is a directory, not a file. Use file_list instead.`;
    if (stat.size > permissions.maxFileSize) return `Error: File too large (${stat.size} bytes, max ${permissions.maxFileSize}).`;

    const content = fs.readFileSync(resolved, "utf-8");
    const maxLines = (args.max_lines as number) || 200;
    const lines = content.split("\n");

    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join("\n") + `\n\n... (truncated, ${lines.length - maxLines} more lines)`;
    }

    return content;
  },
};

const fileWriteTool: NamiTool = {
  name: "file_write",
  description: "Write content to a file in the workspace. Creates the file if it doesn't exist, or overwrites it. Use for creating scripts, config files, data files, or modifying existing files.",
  category: "filesystem",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file from the workspace root",
      },
      content: {
        type: "string",
        description: "The content to write to the file",
      },
      append: {
        type: "boolean",
        description: "If true, append to the file instead of overwriting. Defaults to false.",
      },
    },
    required: ["path", "content"],
  },
  execute: async (args) => {
    if (!permissions.fileWrite) return "Error: file_write permission is disabled.";

    const filePath = args.path as string;
    if (!isWriteAllowed(filePath)) return `Error: Write access to '${filePath}' is restricted.`;

    const resolved = resolvePath(filePath);
    const dir = path.dirname(resolved);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const content = args.content as string;
    const append = args.append as boolean || false;

    if (append) {
      fs.appendFileSync(resolved, content, "utf-8");
      log(`Tool file_write: appended to ${filePath}`, "tools");
    } else {
      fs.writeFileSync(resolved, content, "utf-8");
      log(`Tool file_write: wrote ${filePath} (${content.length} chars)`, "tools");
    }

    return `Successfully ${append ? "appended to" : "wrote"} '${filePath}' (${content.length} characters).`;
  },
};

const fileListTool: NamiTool = {
  name: "file_list",
  description: "List files and directories in a workspace directory. Returns file names, sizes, and types. Use this to explore the project structure.",
  category: "filesystem",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the directory from the workspace root. Use '.' for root.",
      },
      recursive: {
        type: "boolean",
        description: "If true, list files recursively (up to 3 levels deep). Defaults to false.",
      },
    },
    required: ["path"],
  },
  execute: async (args) => {
    if (!permissions.fileList) return "Error: file_list permission is disabled.";

    const dirPath = args.path as string || ".";
    if (isPathBlocked(dirPath)) return `Error: Access to '${dirPath}' is restricted.`;

    const resolved = resolvePath(dirPath);
    if (!fs.existsSync(resolved)) return `Error: Directory '${dirPath}' not found.`;
    if (!fs.statSync(resolved).isDirectory()) return `Error: '${dirPath}' is a file, not a directory.`;

    const recursive = args.recursive as boolean || false;
    const results: string[] = [];

    function listDir(dir: string, prefix: string, depth: number) {
      if (depth > 3) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const relative = path.relative(WORKSPACE_ROOT, path.join(dir, entry.name));
        if (permissions.blockedPaths.some((b) => relative.startsWith(b))) continue;

        if (entry.isDirectory()) {
          results.push(`${prefix}${entry.name}/`);
          if (recursive) listDir(path.join(dir, entry.name), prefix + "  ", depth + 1);
        } else {
          const stat = fs.statSync(path.join(dir, entry.name));
          const size = stat.size < 1024 ? `${stat.size}B` : `${(stat.size / 1024).toFixed(1)}KB`;
          results.push(`${prefix}${entry.name} (${size})`);
        }
      }
    }

    listDir(resolved, "", 0);

    if (results.length === 0) return `Directory '${dirPath}' is empty.`;
    return results.join("\n");
  },
};

const shellExecTool: NamiTool = {
  name: "shell_exec",
  description: "Execute a shell command in the workspace directory. Use for running scripts, checking system state, or performing operations. Commands run with a timeout.",
  category: "execution",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute (e.g., 'ls -la', 'cat file.txt', 'node script.js')",
      },
    },
    required: ["command"],
  },
  execute: async (args) => {
    if (!permissions.shellExec) return "Error: shell_exec permission is disabled.";

    const command = args.command as string;

    const dangerousPatterns = [
      /rm\s+(-\w*r\w*|-\w*f\w*)\s+\//,
      /mkfs/,
      /dd\s+if=/,
      />\s*\/dev\//,
      /:\(\)\{.*\};/,
      /chmod\s+777/,
      /curl\s.*\|\s*(bash|sh)/,
      /wget\s.*\|\s*(bash|sh)/,
      /eval\s/,
      /\$\(.*\)/,
      /`.*`/,
      /sudo\s/,
      /kill\s+-9\s+1\b/,
      /shutdown/,
      /reboot/,
      /init\s+0/,
    ];
    if (dangerousPatterns.some((p) => p.test(command))) {
      return "Error: Command blocked for safety reasons. Dangerous patterns detected.";
    }

    return new Promise((resolve) => {
      exec(command, { cwd: WORKSPACE_ROOT, timeout: permissions.shellTimeout, maxBuffer: 1024 * 512 }, (error, stdout, stderr) => {
        const output: string[] = [];
        if (stdout.trim()) output.push(stdout.trim());
        if (stderr.trim()) output.push(`STDERR: ${stderr.trim()}`);
        if (error && error.killed) output.push("Error: Command timed out.");
        else if (error) output.push(`Exit code: ${error.code}`);

        const result = output.join("\n") || "(no output)";
        log(`Tool shell_exec: '${command.substring(0, 50)}' -> ${result.length} chars`, "tools");
        resolve(result.length > 5000 ? result.substring(0, 5000) + "\n... (truncated)" : result);
      });
    });
  },
};

const selfInspectTool: NamiTool = {
  name: "self_inspect",
  description: "Inspect Nami's own internal state: current config, heartbeat settings, engine state, agent count, and swarm count. Use this to understand your own operational status.",
  category: "system",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      aspect: {
        type: "string",
        description: "What to inspect: 'config', 'heartbeat', 'engine', 'agents', 'swarms', 'all'",
        enum: ["config", "heartbeat", "engine", "agents", "swarms", "all"],
      },
    },
    required: ["aspect"],
  },
  execute: async (args) => {
    const { storage } = await import("./storage");
    const aspect = args.aspect as string;
    const parts: string[] = [];

    if (aspect === "config" || aspect === "all") {
      const config = await storage.getConfig();
      parts.push(`CONFIG:\n  Model: ${config.defaultModel}\n  Max Agents: ${config.maxConcurrentAgents}\n  Max Tokens: ${config.maxTokensPerRequest}\n  Temperature: ${config.temperature}\n  API Key: ${config.openRouterApiKey ? "configured" : "NOT SET"}`);
    }

    if (aspect === "heartbeat" || aspect === "all") {
      const hb = await storage.getHeartbeatConfig();
      parts.push(`HEARTBEAT:\n  Enabled: ${hb.enabled}\n  Interval: ${hb.intervalSeconds}s\n  Total Beats: ${hb.totalBeats}\n  Max Beats: ${hb.maxBeats || "unlimited"}\n  Instruction: ${hb.instruction}`);
    }

    if (aspect === "engine" || aspect === "all") {
      const state = await storage.getEngineState();
      parts.push(`ENGINE:\n  State: ${state}`);
    }

    if (aspect === "agents" || aspect === "all") {
      const agents = await storage.getAgents();
      if (agents.length === 0) {
        parts.push("AGENTS: None created");
      } else {
        const lines = agents.map((a) => `  - ${a.name} (${a.role}) [${a.status}] model=${a.model}`);
        parts.push(`AGENTS (${agents.length}):\n${lines.join("\n")}`);
      }
    }

    if (aspect === "swarms" || aspect === "all") {
      const swarms = await storage.getSwarms();
      if (swarms.length === 0) {
        parts.push("SWARMS: None created");
      } else {
        const lines = swarms.map((s) => `  - ${s.name} [${s.status}] goal="${s.goal}" steps=${s.steps.length}`);
        parts.push(`SWARMS (${swarms.length}):\n${lines.join("\n")}`);
      }
    }

    return parts.join("\n\n");
  },
};

const CHROMIUM_PATH = "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const GOG_CLI_PATH = path.join(WORKSPACE_ROOT, ".local/bin/gog");

const webBrowseTool: NamiTool = {
  name: "web_browse",
  description: "Browse a web page using Chromium and return the page content as text. Use this to fetch web pages, check URLs, scrape content, or verify sites. Returns the text content of the page.",
  category: "browser",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to browse (e.g., 'https://example.com')",
      },
      screenshot: {
        type: "string",
        description: "If 'true', take a screenshot and save to workspace. Defaults to 'false'.",
      },
      wait_seconds: {
        type: "number",
        description: "Seconds to wait for page to load before capturing. Defaults to 3.",
      },
    },
    required: ["url"],
  },
  execute: async (args) => {
    const url = args.url as string;
    if (!url) return "Error: Please provide a URL.";

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return "Error: Invalid URL format.";
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return "Error: Only http:// and https:// URLs are supported.";
    }

    const hostname = parsedUrl.hostname;
    const blockedPatterns = [/^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^169\.254\./, /^::1$/, /^fc00:/i, /^fe80:/i, /^metadata\.google/i];
    if (blockedPatterns.some((p) => p.test(hostname))) {
      return "Error: Access to internal/private network addresses is blocked.";
    }

    const waitSeconds = (args.wait_seconds as number) || 3;
    const wantScreenshot = args.screenshot === "true";

    const chromiumArgs = ["--headless", "--no-sandbox", "--disable-gpu", "--disable-software-rasterizer", "--dump-dom", `--timeout=${waitSeconds * 1000}`, parsedUrl.href];

    return new Promise((resolve) => {
      execFile(CHROMIUM_PATH, chromiumArgs, { cwd: WORKSPACE_ROOT, timeout: (waitSeconds + 10) * 1000, maxBuffer: 1024 * 1024 }, async (error, stdout, stderr) => {
        let result = "";

        if (stdout.trim()) {
          const text = stdout
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          result = text.length > 8000 ? text.substring(0, 8000) + "\n... (truncated)" : text;
        }

        if (wantScreenshot) {
          const screenshotPath = path.join(WORKSPACE_ROOT, ".nami-data", `screenshot-${Date.now()}.png`);
          const ssArgs = ["--headless", "--no-sandbox", "--disable-gpu", "--disable-software-rasterizer", `--screenshot=${screenshotPath}`, "--window-size=1280,720", parsedUrl.href];
          execFile(CHROMIUM_PATH, ssArgs, { cwd: WORKSPACE_ROOT, timeout: (waitSeconds + 10) * 1000 }, (ssErr) => {
            if (!ssErr && fs.existsSync(screenshotPath)) {
              result += `\n\nScreenshot saved to: ${path.relative(WORKSPACE_ROOT, screenshotPath)}`;
            }
            log(`Tool web_browse: ${parsedUrl.href} -> ${result.length} chars`, "tools");
            resolve(result || "Error: Could not retrieve page content.");
          });
        } else {
          log(`Tool web_browse: ${parsedUrl.href} -> ${result.length} chars`, "tools");
          resolve(result || "Error: Could not retrieve page content.");
        }
      });
    });
  },
};

const googleWorkspaceTool: NamiTool = {
  name: "google_workspace",
  description: "Interact with Google Workspace services (Gmail, Calendar, Drive, Contacts, Tasks, Sheets, Docs, Slides) using gogCLI. Run any gog command to access Google services. Requires prior authentication setup.",
  category: "google",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The gog CLI command to execute (e.g., 'gmail labels list', 'calendar events --max 5', 'drive ls --max 10'). Do NOT include 'gog' prefix.",
      },
      json_output: {
        type: "string",
        description: "If 'true', adds --json flag for structured output. Defaults to 'false'.",
      },
    },
    required: ["command"],
  },
  execute: async (args) => {
    const command = args.command as string;
    if (!command) return "Error: Please provide a gog command.";

    if (!fs.existsSync(GOG_CLI_PATH)) {
      return "Error: gogCLI is not installed. Binary not found at expected path.";
    }

    const cmdParts = command.split(/\s+/).filter(Boolean);
    const dangerousPatterns = [/[;&|`$(){}]/, /\.\./];
    for (const part of cmdParts) {
      if (dangerousPatterns.some((p) => p.test(part))) {
        return `Error: Argument contains disallowed characters: '${part}'`;
      }
    }

    if (args.json_output === "true") cmdParts.push("--json");

    return new Promise((resolve) => {
      execFile(GOG_CLI_PATH, cmdParts, { cwd: WORKSPACE_ROOT, timeout: 30000, maxBuffer: 1024 * 512 }, (error, stdout, stderr) => {
        const output: string[] = [];
        if (stdout.trim()) output.push(stdout.trim());
        if (stderr.trim()) output.push(`STDERR: ${stderr.trim()}`);
        if (error && error.killed) output.push("Error: Command timed out.");
        else if (error) output.push(`Exit code: ${error.code}`);

        const result = output.join("\n") || "(no output)";
        log(`Tool google_workspace: '${command}' -> ${result.length} chars`, "tools");
        resolve(result.length > 5000 ? result.substring(0, 5000) + "\n... (truncated)" : result);
      });
    });
  },
};

const ennubeMcpTool: NamiTool = {
  name: "ennube_mcp",
  description: "Call tools on the Ennube AI MCP server. Ennube provides AI-powered cloud infrastructure, deployment, and management capabilities. Use this to interact with Ennube's tool ecosystem.",
  category: "mcp",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      method: {
        type: "string",
        description: "The MCP method to call: 'tools/list' to see available tools, or 'tools/call' to invoke a specific tool.",
        enum: ["tools/list", "tools/call"],
      },
      tool_name: {
        type: "string",
        description: "When method is 'tools/call', the name of the tool to invoke.",
      },
      tool_args: {
        type: "string",
        description: "When method is 'tools/call', a JSON string of arguments to pass to the tool.",
      },
    },
    required: ["method"],
  },
  execute: async (args) => {
    const apiKey = process.env.ENNUBE_MCP_APIKEY;
    if (!apiKey) return "Error: ENNUBE_MCP_APIKEY not configured. Set it in environment variables.";

    const method = args.method as string;
    const mcpUrl = "https://dev.ennube.ai/api/tools/mcp";

    let body: any;
    if (method === "tools/list") {
      body = { jsonrpc: "2.0", id: 1, method: "tools/list" };
    } else if (method === "tools/call") {
      const toolName = args.tool_name as string;
      if (!toolName) return "Error: tool_name is required for tools/call method.";

      let toolArgs: Record<string, any> = {};
      if (args.tool_args) {
        try {
          toolArgs = JSON.parse(args.tool_args as string);
        } catch {
          return "Error: tool_args must be valid JSON.";
        }
      }

      body = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: toolName, arguments: toolArgs },
      };
    } else {
      return "Error: method must be 'tools/list' or 'tools/call'.";
    }

    try {
      const response = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text();
        return `Error: Ennube MCP returned ${response.status} ${response.statusText}: ${errBody}`;
      }

      const contentType = response.headers.get("content-type") || "";
      let data: any;

      if (contentType.includes("text/event-stream")) {
        const rawText = await response.text();
        const lines = rawText.split("\n");
        let jsonPayload = "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            jsonPayload += line.slice(6);
          }
        }
        if (!jsonPayload) return `Error: No data received from Ennube MCP SSE stream.`;
        data = JSON.parse(jsonPayload);
      } else {
        data = await response.json() as any;
      }

      if (data.error) {
        return `MCP Error: ${data.error.message || JSON.stringify(data.error)}`;
      }

      if (method === "tools/list" && data.result?.tools) {
        const toolSummaries = data.result.tools.map((t: any) => {
          const params = t.inputSchema?.properties
            ? Object.keys(t.inputSchema.properties).join(", ")
            : "none";
          return `- **${t.name}**: ${t.description || t.title || "No description"}\n  Parameters: ${params}`;
        });
        const summary = `Found ${data.result.tools.length} tools on Ennube MCP:\n\n${toolSummaries.join("\n\n")}`;
        log(`Tool ennube_mcp: ${method} -> ${data.result.tools.length} tools`, "tools");
        return summary;
      }

      const result = JSON.stringify(data.result, null, 2);
      log(`Tool ennube_mcp: ${method} -> ${result.length} chars`, "tools");
      return result.length > 10000 ? result.substring(0, 10000) + "\n... (truncated)" : result;
    } catch (err: any) {
      return `Error calling Ennube MCP: ${err.message}`;
    }
  },
};

const allTools: NamiTool[] = [fileReadTool, fileWriteTool, fileListTool, shellExecTool, selfInspectTool, webBrowseTool, googleWorkspaceTool, ennubeMcpTool];

export function getTools(): NamiTool[] {
  return allTools;
}

export function getEnabledTools(): NamiTool[] {
  return allTools.filter((t) => t.enabled);
}

export function getToolByName(name: string): NamiTool | undefined {
  return allTools.find((t) => t.name === name);
}

export function setToolEnabled(name: string, enabled: boolean): boolean {
  const tool = allTools.find((t) => t.name === name);
  if (!tool) return false;
  tool.enabled = enabled;
  return true;
}

export function getToolsForLLM(): Array<{ type: "function"; function: { name: string; description: string; parameters: any } }> {
  return getEnabledTools().map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export async function executeToolCall(name: string, args: Record<string, any>): Promise<string> {
  const tool = getToolByName(name);
  if (!tool) return `Error: Unknown tool '${name}'.`;
  if (!tool.enabled) return `Error: Tool '${name}' is currently disabled.`;

  log(`Executing tool: ${name}(${JSON.stringify(args).substring(0, 100)})`, "tools");

  try {
    const result = await tool.execute(args);
    return result;
  } catch (err: any) {
    log(`Tool ${name} execution failed: ${err.message}`, "tools");
    return `Error executing ${name}: ${err.message}`;
  }
}
