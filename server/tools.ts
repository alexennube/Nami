import * as fs from "fs";
import * as path from "path";
import { exec, execFile } from "child_process";
import { log } from "./index";
import { storage } from "./storage";
import { dbSaveWorkspaceFile, dbDeleteWorkspaceFile, dbGetKanbanCards, dbGetKanbanComments, dbAddKanbanComment, dbGetKanbanColumns, dbUpsertKanbanCard, dbDeleteKanbanCard, dbUpsertKanbanColumn, dbDeleteKanbanColumn, dbGetCrmContacts, dbGetCrmContact, dbGetCrmActivities, dbAddCrmActivity, dbGetCrmContactComments, dbAddCrmContactComment, dbUpsertCrmContact } from "./db-persist";
import crypto from "crypto";

type EngineFunctions = {
  createSwarmWithQueen: (data: { name: string; goal: string; objective: string; maxCycles?: number }) => Promise<any>;
  createSpawn: (data: { name: string; model: string; systemPrompt: string; parentId: string | null; swarmId: string | null }) => Promise<any>;
  swarmAction: (swarmId: string, action: string) => Promise<any>;
  runSwarmQueen: (swarmId: string, maxCycles?: number) => Promise<void>;
  getSwarmStatus: (swarmId: string) => Promise<string>;
  getSwarm: (swarmId: string) => Promise<any>;
};

let _engine: EngineFunctions | null = null;

export function registerEngine(engine: EngineFunctions) {
  _engine = engine;
}

function getEngine(): EngineFunctions {
  if (!_engine) throw new Error("Engine not registered. Call registerEngine() first.");
  return _engine;
}

const WORKSPACE_ROOT = process.cwd();

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
}

export interface NamiTool {
  name: string;
  description: string;
  category: "filesystem" | "execution" | "system" | "browser" | "google" | "mcp" | "social";
  enabled: boolean;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required: string[];
  };
  execute: (args: Record<string, any>, agentContext?: { agentName?: string; agentRole?: string }) => Promise<string>;
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

    const finalContent = fs.readFileSync(resolved, "utf-8");
    const validated = resolveAndValidate(filePath);
    if (validated) {
      dbSaveWorkspaceFile(validated.relative, finalContent).catch((e: any) =>
        console.error(`[tools] DB persist file FAILED for ${validated.relative}: ${e.message}`)
      );
    }

    return `Successfully ${append ? "appended to" : "wrote"} '${filePath}' (${content.length} characters).`;
  },
};

const fileEditTool: NamiTool = {
  name: "file_edit",
  description: "Make a targeted edit to a specific section of a file by finding and replacing text. Much safer than file_write for modifying existing files because it only changes the targeted section. Use this for surgical code changes like adding imports, modifying functions, updating config values, or inserting new code blocks. Always use file_read first to see the exact text you want to replace.",
  category: "filesystem",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file from the workspace root",
      },
      old_text: {
        type: "string",
        description: "The exact text to find in the file (must match precisely, including whitespace and indentation). Include enough surrounding context (5+ lines) to ensure a unique match.",
      },
      new_text: {
        type: "string",
        description: "The replacement text. Use empty string to delete the matched section.",
      },
      replace_all: {
        type: "boolean",
        description: "If true, replace ALL occurrences. If false (default), replace only the first occurrence and fail if old_text appears multiple times.",
      },
    },
    required: ["path", "old_text", "new_text"],
  },
  execute: async (args) => {
    if (!permissions.fileWrite) return "Error: file_write permission is disabled.";

    const filePath = args.path as string;
    if (!isWriteAllowed(filePath)) return `Error: Write access to '${filePath}' is restricted.`;

    const resolved = resolvePath(filePath);
    if (!fs.existsSync(resolved)) return `Error: File '${filePath}' not found. Use file_write to create new files.`;

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) return `Error: '${filePath}' is a directory.`;
    if (stat.size > permissions.maxFileSize) return `Error: File too large for editing (${stat.size} bytes, max ${permissions.maxFileSize}). Use file_write for large files.`;

    const content = fs.readFileSync(resolved, "utf-8");
    const oldText = args.old_text as string;
    const newText = args.new_text as string;
    const replaceAll = (args.replace_all as boolean) || false;

    if (oldText === newText) return "Error: old_text and new_text are identical. No changes needed.";

    const occurrences = content.split(oldText).length - 1;

    if (occurrences === 0) {
      const trimmed = oldText.trim();
      const fuzzyCount = content.split(trimmed).length - 1;
      if (fuzzyCount > 0) {
        return `Error: Exact match not found, but found ${fuzzyCount} occurrence(s) of the trimmed text. Check whitespace/indentation. Use file_read to see the exact content first.`;
      }
      return `Error: old_text not found in '${filePath}'. Use file_read to verify the exact content of the file.`;
    }

    if (occurrences > 1 && !replaceAll) {
      return `Error: old_text appears ${occurrences} times in '${filePath}'. Include more surrounding context to make it unique, or set replace_all=true to replace all occurrences.`;
    }

    let updated: string;
    if (replaceAll) {
      updated = content.split(oldText).join(newText);
    } else {
      const idx = content.indexOf(oldText);
      updated = content.substring(0, idx) + newText + content.substring(idx + oldText.length);
    }

    fs.writeFileSync(resolved, updated, "utf-8");

    const validated = resolveAndValidate(filePath);
    if (validated) {
      dbSaveWorkspaceFile(validated.relative, updated).catch((e: any) =>
        console.error(`[tools] DB persist file FAILED for ${validated.relative}: ${e.message}`)
      );
    }

    const replacements = replaceAll ? occurrences : 1;
    log(`Tool file_edit: edited ${filePath} (${replacements} replacement${replacements > 1 ? "s" : ""})`, "tools");
    return `Successfully edited '${filePath}': replaced ${replacements} occurrence${replacements > 1 ? "s" : ""}. ${newText ? `Replaced ${oldText.length} chars with ${newText.length} chars.` : `Deleted ${oldText.length} chars.`}`;
  },
};

const fileSearchTool: NamiTool = {
  name: "file_search",
  description: "Search for text patterns across files in the workspace using regex or plain text. Like grep. Use this to find where specific code, functions, variables, or patterns exist before editing. Returns matching lines with file paths and line numbers.",
  category: "filesystem",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Text or regex pattern to search for (e.g., 'function handleSubmit', 'import.*React', 'TODO')",
      },
      path: {
        type: "string",
        description: "Directory or file to search in. Defaults to '.' (entire workspace).",
      },
      file_pattern: {
        type: "string",
        description: "File extension filter (e.g., '*.ts', '*.tsx', '*.json'). Supports simple patterns like '*.ext' or 'prefix*.ext'. Defaults to all files.",
      },
      max_results: {
        type: "number",
        description: "Maximum number of matching lines to return. Defaults to 50.",
      },
      case_sensitive: {
        type: "boolean",
        description: "Whether search is case-sensitive. Defaults to true.",
      },
    },
    required: ["pattern"],
  },
  execute: async (args) => {
    if (!permissions.fileRead) return "Error: file_read permission is disabled.";

    const pattern = args.pattern as string;
    const searchPath = (args.path as string) || ".";
    const filePattern = args.file_pattern as string | undefined;
    const maxResults = (args.max_results as number) || 50;
    const caseSensitive = args.case_sensitive !== false;

    if (isPathBlocked(searchPath)) return `Error: Access to '${searchPath}' is restricted.`;

    const resolved = resolvePath(searchPath);
    if (!fs.existsSync(resolved)) return `Error: Path '${searchPath}' not found.`;

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, caseSensitive ? "g" : "gi");
    } catch (e: any) {
      return `Error: Invalid regex pattern: ${e.message}`;
    }

    const results: string[] = [];

    function searchFile(filePath: string) {
      if (results.length >= maxResults) return;
      const relative = path.relative(WORKSPACE_ROOT, filePath);
      if (permissions.blockedPaths.some((b) => relative.startsWith(b + path.sep) || relative === b)) return;
      if (filePattern) {
        const name = path.basename(filePath);
        const parts = filePattern.replace(/\*\*/g, "").split("*").filter(Boolean);
        if (parts.length === 1) {
          if (!name.endsWith(parts[0]) && !name.startsWith(parts[0])) return;
        } else if (parts.length >= 2) {
          if (!name.startsWith(parts[0]) || !name.endsWith(parts[parts.length - 1])) return;
        }
      }

      try {
        const stat = fs.statSync(filePath);
        if (stat.size > 500000) return;
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
          regex.lastIndex = 0;
          if (regex.test(lines[i])) {
            results.push(`${relative}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      } catch {}
    }

    function walkDir(dir: string, depth: number) {
      if (depth > 5 || results.length >= maxResults) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= maxResults) break;
          const fullPath = path.join(dir, entry.name);
          const relative = path.relative(WORKSPACE_ROOT, fullPath);
          if (permissions.blockedPaths.some((b) => relative.startsWith(b + path.sep) || relative === b)) continue;
          if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

          if (entry.isDirectory()) {
            walkDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            searchFile(fullPath);
          }
        }
      } catch {}
    }

    const stat = fs.statSync(resolved);
    if (stat.isFile()) {
      searchFile(resolved);
    } else {
      walkDir(resolved, 0);
    }

    if (results.length === 0) return `No matches found for '${pattern}' in '${searchPath}'.`;
    const header = `Found ${results.length}${results.length >= maxResults ? "+" : ""} match(es) for '${pattern}':`;
    return header + "\n" + results.join("\n");
  },
};

let lastRestartTime = 0;
const RESTART_COOLDOWN_MS = 30000;

const serverRestartTool: NamiTool = {
  name: "server_restart",
  description: "Restart the Nami application server to apply code changes. Use this after modifying source files (TypeScript, config) to make changes take effect. The server will restart and reconnect automatically. Has a 30-second cooldown between restarts.",
  category: "execution",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Brief description of why the restart is needed (e.g., 'applied UI changes to settings page')",
      },
    },
    required: ["reason"],
  },
  execute: async (args) => {
    if (!permissions.shellExec) return "Error: shell_exec permission is disabled (server_restart requires it).";

    const now = Date.now();
    const elapsed = now - lastRestartTime;
    if (elapsed < RESTART_COOLDOWN_MS) {
      const remaining = Math.ceil((RESTART_COOLDOWN_MS - elapsed) / 1000);
      return `Error: Server restart on cooldown. Wait ${remaining} more seconds before restarting again.`;
    }

    const reason = (args.reason as string) || "manual restart";
    lastRestartTime = now;
    log(`Tool server_restart: restarting server - ${reason}`, "tools");

    setTimeout(() => {
      log("Server restart triggered by agent tool", "tools");
      process.exit(0);
    }, 1000);

    return `Server restart initiated. Reason: ${reason}. The server will restart in ~1 second and reconnect automatically. Wait a few seconds before making further requests.`;
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

    const chromiumArgs = ["--headless", "--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-software-rasterizer", "--disable-dev-shm-usage", "--single-process", "--no-zygote", "--dump-dom", `--timeout=${waitSeconds * 1000}`, parsedUrl.href];

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
          const ssArgs = ["--headless", "--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-software-rasterizer", "--disable-dev-shm-usage", "--single-process", "--no-zygote", `--screenshot=${screenshotPath}`, "--window-size=1280,720", parsedUrl.href];
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
      const gogEnv = { ...process.env, GOG_KEYRING_PASSWORD: "nami-keyring" };
      execFile(GOG_CLI_PATH, cmdParts, { cwd: WORKSPACE_ROOT, timeout: 30000, maxBuffer: 1024 * 512, env: gogEnv }, (error, stdout, stderr) => {
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

const webSearchTool: NamiTool = {
  name: "web_search",
  description: "Search the web using Perplexity AI via OpenRouter for real-time information. Use this to find current data, research topics, look up documentation, check news, or answer questions requiring up-to-date knowledge from the internet.",
  category: "browser",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query or question to research (e.g., 'latest Node.js LTS version', 'Salesforce API rate limits 2025', 'how to use Drizzle ORM with PostgreSQL')",
      },
      detailed: {
        type: "string",
        description: "If 'true', request a more detailed/comprehensive answer. Defaults to 'false' for concise results.",
      },
    },
    required: ["query"],
  },
  execute: async (args) => {
    const query = args.query as string;
    if (!query) return "Error: Please provide a search query.";

    const { getApiKey } = await import("./openrouter");
    let apiKey: string;
    try {
      apiKey = await getApiKey();
    } catch {
      return "Error: OpenRouter API key not configured. Set it in Settings or as OPENROUTER_API_KEY environment variable.";
    }

    const detailed = args.detailed === "true";
    const maxTokens = detailed ? 2048 : 1024;

    const body = {
      model: "perplexity/sonar",
      messages: [
        {
          role: "system",
          content: detailed
            ? "You are a research assistant. Provide comprehensive, well-structured answers with sources when available. Include relevant details, examples, and context."
            : "You are a research assistant. Provide concise, accurate answers. Be direct and factual.",
        },
        { role: "user", content: query },
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
    };

    try {
      const config = await storage.getConfig();
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": config.siteUrl || "https://agentnami.com",
          "X-Title": config.siteName || "Nami Agent",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text();
        return `Error: Web search failed (${response.status}): ${errBody}`;
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content;
      if (!content) return "Error: No search results returned.";

      const tokens = data.usage?.total_tokens || 0;
      log(`Tool web_search: "${query.substring(0, 50)}" -> ${content.length} chars, ${tokens} tokens`, "tools");

      return content.length > 8000
        ? content.substring(0, 8000) + "\n... (truncated)"
        : content;
    } catch (err: any) {
      return `Error performing web search: ${err.message}`;
    }
  },
};

const createSwarmTool: NamiTool = {
  name: "create_swarm",
  description: "Create a new swarm (workflow) with an autonomous SwarmQueen. The queen will independently manage the swarm's objective by spawning agents, delegating tasks, monitoring progress, and reviewing results before completing. Pass a clear goal and objective - the queen cannot change her primary objective once set.",
  category: "system",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name for the swarm (e.g., 'Data Enrichment Swarm', 'Research Swarm')",
      },
      goal: {
        type: "string",
        description: "High-level goal of the swarm. This becomes the queen's immutable primary objective.",
      },
      objective: {
        type: "string",
        description: "Detailed description of what the swarm should accomplish, including any specific requirements, constraints, or success criteria.",
      },
      auto_start: {
        type: "boolean",
        description: "If true (default), immediately activate the swarm and start the queen's autonomous loop. If false, create in pending state.",
      },
      max_cycles: {
        type: "number",
        description: "Maximum number of queen cycles before auto-completing. Default is 20. Use higher values (30-50) for complex objectives with many sub-tasks.",
      },
    },
    required: ["name", "goal", "objective"],
  },
  execute: async (args) => {
    const name = args.name as string;
    const goal = args.goal as string;
    const objective = args.objective as string;
    const autoStart = args.auto_start !== false;
    const maxCycles = typeof args.max_cycles === "number" ? Math.max(1, Math.min(args.max_cycles, 100)) : undefined;

    try {
      const engine = getEngine();
      const { swarm, queen } = await engine.createSwarmWithQueen({ name, goal, objective, maxCycles });

      const verified = await engine.getSwarm(swarm.id);
      if (!verified) {
        return `Error: Swarm creation failed - swarm not found in storage after creation.`;
      }

      let result = `Swarm "${verified.name}" created successfully.\n- ID: ${verified.id}\n- Goal: ${verified.goal}\n- Queen: ${queen.name} (${queen.id})\n- Status: ${verified.status}`;

      if (autoStart) {
        await engine.swarmAction(swarm.id, "activate");
        engine.runSwarmQueen(swarm.id, maxCycles).catch((err: any) => {
          log(`SwarmQueen autonomous loop error for ${swarm.id}: ${err.message}`, "engine");
        });
        result += `\n- Auto-started: Queen is now autonomously working on the objective.`;
        if (maxCycles) result += `\n- Max cycles: ${maxCycles}`;
      }

      return result;
    } catch (err: any) {
      return `Error creating swarm: ${err.message}`;
    }
  },
};

const manageSwarmTool: NamiTool = {
  name: "manage_swarm",
  description: "Manage an existing swarm. Actions: 'status' (get swarm details), 'activate' (start/resume queen), 'pause' (pause queen), 'complete' (force complete), 'list' (list all swarms), 'add_spawn' (manually add a spawn agent to the swarm).",
  category: "system",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "Action to perform: 'status', 'activate', 'pause', 'complete', 'list', 'add_spawn'",
        enum: ["status", "activate", "pause", "complete", "list", "add_spawn"],
      },
      swarm_id: {
        type: "string",
        description: "ID of the swarm (required for all actions except 'list')",
      },
      spawn_name: {
        type: "string",
        description: "Name for the new spawn agent (only for 'add_spawn' action)",
      },
      spawn_prompt: {
        type: "string",
        description: "System prompt / instructions for the new spawn (only for 'add_spawn' action)",
      },
    },
    required: ["action"],
  },
  execute: async (args) => {
    // Guard clause - ensure we have a proper tool invocation
    if (!args || typeof args !== 'object') {
      return "Error: Invalid arguments provided to manage_swarm tool.";
    }

    const action = args.action as string;
    const swarmId = args.swarm_id as string;

    // Validate that we have an action
    if (!action) {
      return "Error: action is required for manage_swarm tool.";
    }

    try {
      if (action === "list") {
        const swarms = await storage.getSwarms();
        if (swarms.length === 0) return "No swarms exist yet.";
        return swarms.map((s) => {
          const agentCount = s.agentIds.length;
          return `- **${s.name}** (${s.id.substring(0, 8)})\n  Status: ${s.status} | Goal: ${s.goal}\n  Agents: ${agentCount} | Progress: ${s.progress}%`;
        }).join("\n\n");
      }

      // For non-list actions, swarm_id is required
      if (!swarmId) {
        return "Error: swarm_id is required for this action.";
      }

      const engine = getEngine();
      
      // Enhanced swarm lookup to handle UUID variations
      let swarm = null;
      
      // Try to find swarm by exact ID first
      swarm = await engine.getSwarm(swarmId);
      
      // If swarm not found by exact ID AND it looks like a truncated UUID, try to match by partial ID
      if (!swarm && swarmId.length === 8 && /^[a-f0-9]+$/.test(swarmId)) {
        const swarms = await storage.getSwarms();
        const matchingSwarms = swarms.filter(s => s.id.startsWith(swarmId));
        if (matchingSwarms.length === 1) {
          swarm = matchingSwarms[0];
        } else if (matchingSwarms.length > 1) {
          return `Error: Multiple swarms found with truncated ID '${swarmId}'. Please use full UUID.`;
        }
      }
      
      // If still not found, try name lookup
      if (!swarm) {
        const swarms = await storage.getSwarms();
        const foundSwarm = swarms.find(s => s.name === swarmId);
        if (foundSwarm) {
          swarm = foundSwarm;
        }
      }
      
      if (!swarm) {
        return `Error: Swarm '${swarmId}' not found. Available swarms:\n${(await storage.getSwarms()).map(s => `- ${s.name} (${s.id})`).join('\n')}`;
      }

      if (action === "status") {
        return await engine.getSwarmStatus(swarm.id);
      }

      if (action === "activate") {
        const swarmData = await engine.getSwarm(swarm.id);
        await engine.swarmAction(swarm.id, "activate");
        engine.runSwarmQueen(swarm.id, swarmData?.maxCycles).catch((err: any) => {
          log(`SwarmQueen autonomous loop error for ${swarm.id}: ${err.message}`, "engine");
        });
        return `Swarm ${swarm.id} activated. Queen is now running autonomously.`;
      }

      if (action === "pause") {
        await engine.swarmAction(swarm.id, "pause");
        return `Swarm ${swarm.id} paused. Queen and spawns paused.`;
      }

      if (action === "complete") {
        await engine.swarmAction(swarm.id, "complete");
        return `Swarm ${swarm.id} force-completed by Nami.`;
      }

      if (action === "add_spawn") {
        const spawnName = args.spawn_name as string || `Spawn-${Date.now()}`;
        const spawnPrompt = args.spawn_prompt as string || "You are a worker agent. Complete the task assigned to you.";
        const config = await storage.getConfig();
        const spawn = await engine.createSpawn({
          name: spawnName,
          model: config.defaultModel,
          systemPrompt: spawnPrompt,
          parentId: null,
          swarmId: swarm.id,
        });
        const updatedSwarm = await storage.getSwarm(swarm.id);
        if (updatedSwarm) {
          await storage.updateSwarm(swarm.id, { agentIds: [...updatedSwarm.agentIds, spawn.id] });
        }
        return `Spawn "${spawn.name}" (${spawn.id}) added to swarm ${swarm.id}.`;
      }

      return `Unknown action: ${action}`;
    } catch (err: any) {
      return `Error managing swarm: ${err.message}`;
    }
  },
};


const docsReadTool: NamiTool = {
  name: "docs_read",
  description: "Read documentation pages. Use without a slug to list all available pages, or with a slug to read a specific page. Documentation contains project knowledge, architecture decisions, runbooks, and reference material.",
  category: "system",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "The slug of the doc page to read. Omit to list all available doc pages with their slugs and titles.",
      },
    },
    required: [],
  },
  execute: async (args) => {
    const slug = args.slug as string | undefined;
    if (!slug) {
      const docs = await storage.getDocs();
      if (docs.length === 0) return "No documentation pages exist yet. Use docs_write to create one.";
      return "Available documentation pages:\n" + docs.map((d) => `- ${d.slug}: ${d.title} (last edited by ${d.lastEditedBy}, ${d.updatedAt})`).join("\n");
    }
    const doc = await storage.getDoc(slug);
    if (!doc) return `Error: Doc page '${slug}' not found. Use docs_read without a slug to list available pages.`;
    return `# ${doc.title}\n\n${doc.content}\n\n---\nSlug: ${doc.slug} | Last edited by: ${doc.lastEditedBy} | Updated: ${doc.updatedAt}`;
  },
};

const docsWriteTool: NamiTool = {
  name: "docs_write",
  description: "Create or update a documentation page. Use this to maintain project documentation, record architecture decisions, write runbooks, document APIs, or keep any reference material. If the slug already exists, the page will be updated. Use lowercase-hyphenated slugs (e.g., 'getting-started', 'api-reference', 'architecture').",
  category: "system",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "URL-friendly identifier for the page (e.g., 'getting-started', 'api-reference'). Use lowercase letters and hyphens only.",
      },
      title: {
        type: "string",
        description: "Human-readable title for the page (e.g., 'Getting Started', 'API Reference')",
      },
      content: {
        type: "string",
        description: "Full markdown content of the documentation page. Supports standard markdown formatting.",
      },
    },
    required: ["slug", "title", "content"],
  },
  execute: async (args) => {
    const slug = (args.slug as string).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    const title = args.title as string;
    const content = args.content as string;

    try {
      const doc = await storage.upsertDoc({ slug, title, content, lastEditedBy: "nami" });
      return `Documentation page "${title}" (${slug}) has been ${doc.createdAt === doc.updatedAt ? "created" : "updated"} successfully.`;
    } catch (err: any) {
      return `Error writing doc: ${err.message}`;
    }
  },
};

const xPostTweetTool: NamiTool = {
  name: "x_post_tweet",
  description: "Post a tweet to X (Twitter). Uses OAuth 1.0a to post to the authenticated account. Maximum 280 characters. Use this to share updates, announcements, or results on X.",
  category: "social",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The tweet text to post (max 280 characters)",
      },
    },
    required: ["text"],
  },
  execute: async (args) => {
    const { postToX, hasXCredentials, getMissingCredentials } = await import("./x-api");
    if (!hasXCredentials()) {
      return `Error: X (Twitter) credentials not configured. Missing: ${getMissingCredentials().join(", ")}. Set them in environment secrets.`;
    }
    const text = args.text as string;
    if (!text) return "Error: Tweet text is required.";
    const result = await postToX(text);
    if (result.success) {
      return `Tweet posted successfully! Tweet ID: ${result.tweetId}. URL: https://x.com/i/status/${result.tweetId}`;
    }
    return `Error posting tweet: ${result.error}`;
  },
};

const xDeleteTweetTool: NamiTool = {
  name: "x_delete_tweet",
  description: "Delete a tweet from X (Twitter) by its tweet ID. Use this to remove previously posted tweets.",
  category: "social",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      tweet_id: {
        type: "string",
        description: "The ID of the tweet to delete",
      },
    },
    required: ["tweet_id"],
  },
  execute: async (args) => {
    const { deleteFromX, hasXCredentials, getMissingCredentials } = await import("./x-api");
    if (!hasXCredentials()) {
      return `Error: X (Twitter) credentials not configured. Missing: ${getMissingCredentials().join(", ")}.`;
    }
    const tweetId = args.tweet_id as string;
    if (!tweetId) return "Error: Tweet ID is required.";
    const result = await deleteFromX(tweetId);
    if (result.success) {
      return `Tweet ${tweetId} deleted successfully.`;
    }
    return `Error deleting tweet: ${result.error}`;
  },
};

const xGetStatusTool: NamiTool = {
  name: "x_get_status",
  description: "Check X (Twitter) integration status. Returns whether credentials are configured and which ones are missing.",
  category: "social",
  enabled: true,
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: async () => {
    const { getXStatus } = await import("./x-api");
    const status = getXStatus();
    if (status.configured) {
      return "X (Twitter) integration is fully configured and ready to post.";
    }
    return `X (Twitter) integration is NOT configured. Missing secrets: ${status.missing.join(", ")}. Add them to environment secrets.`;
  },
};

const browserControlTool: NamiTool = {
  name: "browser_control",
  description: "Control the user's browser via the Namiextend Chrome extension. Actions: click (CSS selector), type (text into element), scroll (element or page), navigate (go to URL), read_page (get page content), get_state (get latest page snapshot from browser), get_logs (view recent browser action history). After each action, the extension reports back the page URL, title, and text content so you can see what happened.",
  category: "browser",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", description: "The browser action to perform: click, type, scroll, navigate, read_page, get_state (latest page snapshot), or get_logs (recent action history)" },
      selector: { type: "string", description: "CSS selector of the target element (e.g. '#login-btn', '.search-input', 'button[type=submit]'). Not needed for navigate or read_page." },
      text: { type: "string", description: "Text to type (for 'type' action) or URL to navigate to (for 'navigate' action)" },
      wait_ms: { type: "string", description: "Milliseconds to wait after the action (default: 0)" },
    },
    required: ["action"],
  },
  execute: async (args) => {
    const { executeBrowserAction } = await import("./namiextend");
    const action = args.action || "";
    const selector = args.selector || "";
    const text = args.text || "";
    const waitMs = parseInt(args.wait_ms || "0", 10) || 0;

    const validActions = ["click", "type", "scroll", "navigate", "read_page", "get_state", "get_logs"];
    if (!validActions.includes(action)) {
      return `Error: Invalid action '${action}'. Valid actions: ${validActions.join(", ")}`;
    }

    if (action === "get_state") {
      const { getLatestPageState } = await import("./namiextend");
      const state = getLatestPageState();
      if (!state) return "No page state available yet. The browser extension has not reported any page data.";
      return `Current browser page state (captured ${new Date(state.timestamp).toISOString()}):\nURL: ${state.url}\nTitle: ${state.title}\nContent:\n${state.text}`;
    }

    if (action === "get_logs") {
      const { getRecentBrowserLogs } = await import("./namiextend");
      const logs = await getRecentBrowserLogs(10);
      if (logs.length === 0) return "No browser action logs found.";
      return logs.map((l: any) => `[${l.created_at}] ${l.action} | ${l.selector || ""} | ${(l.content || "").substring(0, 200)}`).join("\n");
    }

    if (["click", "type", "scroll"].includes(action) && !selector) {
      return `Error: '${action}' action requires a CSS selector.`;
    }

    if (action === "type" && !text) {
      return "Error: 'type' action requires text to type.";
    }

    if (action === "navigate" && !text) {
      return "Error: 'navigate' action requires a URL.";
    }

    return executeBrowserAction(action, selector, text, waitMs);
  },
};

const kanbanTool: NamiTool = {
  name: "kanban",
  description: "Full Kanban board management. Create, update, delete, and move cards. Create, rename, and delete columns. List cards/columns, read and post comments. Use this to manage project tasks on the Kanban board.",
  category: "system",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "Action to perform on the Kanban board",
        enum: ["list_cards", "list_columns", "create_card", "update_card", "delete_card", "move_card", "create_column", "rename_column", "delete_column", "read_comments", "comment"],
      },
      card_id: {
        type: "string",
        description: "ID of the kanban card (required for update_card, delete_card, move_card, read_comments, comment)",
      },
      column_id: {
        type: "string",
        description: "ID of the column (required for create_card, move_card, rename_column, delete_column)",
      },
      title: {
        type: "string",
        description: "Title for card or column (required for create_card, create_column)",
      },
      description: {
        type: "string",
        description: "Description for the card (optional for create_card, update_card)",
      },
      priority: {
        type: "string",
        description: "Priority level: low, medium, high (optional for create_card, update_card)",
        enum: ["low", "medium", "high"],
      },
      status: {
        type: "string",
        description: "Status: not_started, in_progress, blocked, done (optional for create_card, update_card)",
        enum: ["not_started", "in_progress", "blocked", "done"],
      },
      labels: {
        type: "array",
        items: { type: "string" },
        description: "Labels for the card (optional for create_card, update_card)",
      },
      content: {
        type: "string",
        description: "Comment text to post (required for 'comment' action). Supports markdown.",
      },
    },
    required: ["action"],
  },
  execute: async (args, agentContext) => {
    const action = args.action as string;
    const cardId = args.card_id as string;
    const columnId = args.column_id as string;
    const title = args.title as string;
    const description = args.description as string | undefined;
    const priority = args.priority as string | undefined;
    const status = args.status as string | undefined;
    const labels = args.labels as string[] | undefined;
    const content = args.content as string;
    const authorName = agentContext?.agentName || "Nami";
    const authorType = (agentContext?.agentRole === "queen" || agentContext?.agentRole === "swarm_queen") ? "queen" : "agent";

    try {
      if (action === "list_columns") {
        const columns = await dbGetKanbanColumns();
        if (columns.length === 0) return "No kanban columns found. Create one first with create_column.";
        return columns.map((c: any) => `- **${c.title}** (ID: ${c.id}) | Order: ${c.order}`).join("\n");
      }

      if (action === "list_cards") {
        const cards = await dbGetKanbanCards();
        if (cards.length === 0) return "No kanban cards found.";
        return cards.map((c: any) => `- **${c.title}** (ID: ${c.id})\n  Column: ${c.columnId} | Priority: ${c.priority || "medium"} | Status: ${c.status || "not_started"}\n  ${c.description || "(no description)"}`).join("\n\n");
      }

      if (action === "create_card") {
        if (!columnId) return "Error: column_id is required for create_card.";
        if (!title) return "Error: title is required for create_card.";
        const cards = await dbGetKanbanCards();
        const colCards = cards.filter((c: any) => c.columnId === columnId);
        const now = new Date().toISOString();
        const card = {
          id: crypto.randomUUID(),
          columnId,
          title,
          description: description || "",
          order: colCards.length,
          priority: priority || "medium",
          status: status || "not_started",
          labels: labels || [],
          createdAt: now,
          updatedAt: now,
        };
        await dbUpsertKanbanCard(card);
        return `Card created: **${title}** (ID: ${card.id}) in column ${columnId}.`;
      }

      if (action === "update_card") {
        if (!cardId) return "Error: card_id is required for update_card.";
        const cards = await dbGetKanbanCards();
        const card = cards.find((c: any) => c.id === cardId);
        if (!card) return `Error: Card ${cardId} not found.`;
        const updated = {
          ...card,
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          ...(priority !== undefined && { priority }),
          ...(status !== undefined && { status }),
          ...(labels !== undefined && { labels }),
          updatedAt: new Date().toISOString(),
        };
        await dbUpsertKanbanCard(updated);
        return `Card updated: **${updated.title}** (ID: ${cardId}).`;
      }

      if (action === "delete_card") {
        if (!cardId) return "Error: card_id is required for delete_card.";
        await dbDeleteKanbanCard(cardId);
        return `Card ${cardId} deleted.`;
      }

      if (action === "move_card") {
        if (!cardId) return "Error: card_id is required for move_card.";
        if (!columnId) return "Error: column_id is required for move_card.";
        const cards = await dbGetKanbanCards();
        const card = cards.find((c: any) => c.id === cardId);
        if (!card) return `Error: Card ${cardId} not found.`;
        const targetCards = cards.filter((c: any) => c.columnId === columnId && c.id !== cardId).sort((a: any, b: any) => a.order - b.order);
        const movedCard = { ...card, columnId, order: targetCards.length, updatedAt: new Date().toISOString() };
        await dbUpsertKanbanCard(movedCard);
        return `Card **${card.title}** moved to column ${columnId}.`;
      }

      if (action === "create_column") {
        if (!title) return "Error: title is required for create_column.";
        const columns = await dbGetKanbanColumns();
        const col = {
          id: crypto.randomUUID(),
          title,
          order: columns.length,
        };
        await dbUpsertKanbanColumn(col);
        return `Column created: **${title}** (ID: ${col.id}).`;
      }

      if (action === "rename_column") {
        if (!columnId) return "Error: column_id is required for rename_column.";
        if (!title) return "Error: title is required for rename_column.";
        const columns = await dbGetKanbanColumns();
        const col = columns.find((c: any) => c.id === columnId);
        if (!col) return `Error: Column ${columnId} not found.`;
        const updated = { ...col, title };
        await dbUpsertKanbanColumn(updated);
        return `Column renamed to **${title}**.`;
      }

      if (action === "delete_column") {
        if (!columnId) return "Error: column_id is required for delete_column.";
        await dbDeleteKanbanColumn(columnId);
        return `Column ${columnId} deleted.`;
      }

      if (action === "read_comments") {
        if (!cardId) return "Error: card_id is required for read_comments.";
        const comments = await dbGetKanbanComments(cardId);
        if (comments.length === 0) return "No comments on this card yet.";
        return comments.map((c: any) => `**${c.author}** (${c.authorType}) — ${new Date(c.createdAt).toLocaleString()}:\n${c.content}`).join("\n\n---\n\n");
      }

      if (action === "comment") {
        if (!cardId) return "Error: card_id is required for comment.";
        if (!content) return "Error: content is required for comment.";
        const comment = {
          id: crypto.randomUUID(),
          cardId,
          author: authorName,
          authorType,
          content,
          createdAt: new Date().toISOString(),
        };
        await dbAddKanbanComment(comment);
        return `Comment posted on card ${cardId.substring(0, 8)}… by ${authorName}.`;
      }

      return "Error: Invalid action. Use list_cards, list_columns, create_card, update_card, delete_card, move_card, create_column, rename_column, delete_column, read_comments, or comment.";
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};

const crmTool: NamiTool = {
  name: "crm",
  description: "Interact with the CRM system. Manage contacts, log activities (emails sent, profile visits, research findings), post comments, and read contact intelligence. Use this to keep the CRM updated with all agent interactions and discoveries about contacts.",
  category: "system",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "Action: 'list_contacts', 'get_contact', 'search_contacts', 'update_contact', 'log_activity', 'add_comment', 'get_activities', 'get_comments'",
        enum: ["list_contacts", "get_contact", "search_contacts", "update_contact", "log_activity", "add_comment", "get_activities", "get_comments"],
      },
      contact_id: {
        type: "string",
        description: "Contact ID (required for get_contact, update_contact, log_activity, add_comment, get_activities, get_comments)",
      },
      query: {
        type: "string",
        description: "Search query for search_contacts (searches name, email, company, tags)",
      },
      updates: {
        type: "object",
        description: "Fields to update on a contact (for update_contact). Can include: notes, tags, stage, title, company, linkedIn, twitter, etc.",
      },
      activity_type: {
        type: "string",
        description: "Type of activity for log_activity: email_sent, email_received, profile_visit, note, call, meeting, research, sequence_step, engagement, other",
      },
      title: {
        type: "string",
        description: "Title/subject for the activity (required for log_activity)",
      },
      content: {
        type: "string",
        description: "Content/description for log_activity or add_comment",
      },
      metadata: {
        type: "object",
        description: "Optional metadata for activity (e.g., { url: '...', platform: 'linkedin' })",
      },
    },
    required: ["action"],
  },
  execute: async (args, agentContext) => {
    const action = args.action as string;
    const contactId = args.contact_id as string;
    const authorName = agentContext?.agentName || "Nami";
    const authorType = (agentContext?.agentRole === "queen" || agentContext?.agentRole === "swarm_queen") ? "queen" : "agent";

    try {
      if (action === "list_contacts") {
        const contacts = await dbGetCrmContacts();
        if (contacts.length === 0) return "No contacts in CRM.";
        return contacts.slice(0, 50).map((c: any) =>
          `- **${c.firstName} ${c.lastName}** (${c.id.substring(0, 8)}…) | ${c.email || "no email"} | ${c.company || "no company"} | Stage: ${c.stage || "lead"}`
        ).join("\n");
      }

      if (action === "get_contact") {
        if (!contactId) return "Error: contact_id required.";
        const c = await dbGetCrmContact(contactId);
        if (!c) return "Error: Contact not found.";
        return `**${c.firstName} ${c.lastName}**\nEmail: ${c.email}\nPhone: ${c.phone}\nTitle: ${c.title}\nCompany: ${c.company}\nStage: ${c.stage}\nLinkedIn: ${c.linkedIn}\nTwitter: ${c.twitter}\nTags: ${(c.tags || []).join(", ")}\nNotes: ${c.notes || "(none)"}\nCreated: ${c.createdAt}`;
      }

      if (action === "search_contacts") {
        const query = (args.query as string || "").toLowerCase();
        if (!query) return "Error: query required for search.";
        const contacts = await dbGetCrmContacts();
        const matches = contacts.filter((c: any) =>
          `${c.firstName} ${c.lastName} ${c.email} ${c.company} ${(c.tags || []).join(" ")}`.toLowerCase().includes(query)
        );
        if (matches.length === 0) return `No contacts matching "${query}".`;
        return matches.slice(0, 20).map((c: any) =>
          `- **${c.firstName} ${c.lastName}** (${c.id.substring(0, 8)}…) | ${c.email || "no email"} | ${c.company || ""}`
        ).join("\n");
      }

      if (action === "update_contact") {
        if (!contactId) return "Error: contact_id required.";
        const c = await dbGetCrmContact(contactId);
        if (!c) return "Error: Contact not found.";
        const updates = args.updates as Record<string, any> || {};
        const updated = { ...c, ...updates, id: contactId, updatedAt: new Date().toISOString() };
        await dbUpsertCrmContact(updated);
        return `Contact ${c.firstName} ${c.lastName} updated.`;
      }

      if (action === "log_activity") {
        if (!contactId) return "Error: contact_id required.";
        const actType = args.activity_type as string || "other";
        const title = args.title as string;
        if (!title) return "Error: title required for activity.";
        const activity = {
          id: crypto.randomUUID(), contactId,
          type: actType, title,
          description: (args.content as string) || "",
          metadata: (args.metadata as Record<string, any>) || {},
          agentName: authorName,
          createdAt: new Date().toISOString(),
        };
        await dbAddCrmActivity(activity);
        return `Activity logged for contact ${contactId.substring(0, 8)}…: ${title}`;
      }

      if (action === "add_comment") {
        if (!contactId) return "Error: contact_id required.";
        const content = args.content as string;
        if (!content) return "Error: content required.";
        const comment = {
          id: crypto.randomUUID(), contactId,
          author: authorName, authorType,
          content, createdAt: new Date().toISOString(),
        };
        await dbAddCrmContactComment(comment);
        return `Comment posted on contact ${contactId.substring(0, 8)}… by ${authorName}.`;
      }

      if (action === "get_activities") {
        if (!contactId) return "Error: contact_id required.";
        const activities = await dbGetCrmActivities(contactId);
        if (activities.length === 0) return "No activities for this contact.";
        return activities.slice(0, 30).map((a: any) =>
          `[${a.type}] ${a.title} — ${a.agentName || "system"} (${new Date(a.createdAt).toLocaleString()})\n${a.description || ""}`
        ).join("\n---\n");
      }

      if (action === "get_comments") {
        if (!contactId) return "Error: contact_id required.";
        const comments = await dbGetCrmContactComments(contactId);
        if (comments.length === 0) return "No comments for this contact.";
        return comments.map((c: any) =>
          `**${c.author}** (${c.authorType}) — ${new Date(c.createdAt).toLocaleString()}:\n${c.content}`
        ).join("\n---\n");
      }

      return "Error: Invalid action.";
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};

const allTools: NamiTool[] = [fileReadTool, fileWriteTool, fileEditTool, fileSearchTool, fileListTool, shellExecTool, serverRestartTool, selfInspectTool, webBrowseTool, webSearchTool, googleWorkspaceTool, ennubeMcpTool, createSwarmTool, manageSwarmTool, docsReadTool, docsWriteTool, xPostTweetTool, xDeleteTweetTool, xGetStatusTool, browserControlTool, kanbanTool, crmTool];

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

export async function executeToolCall(name: string, args: Record<string, any>, agentContext?: { agentName?: string; agentRole?: string }): Promise<string> {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return `Error: Invalid tool name provided. Tool name must be a non-empty string.`;
  }
  
  const tool = getToolByName(name);
  if (!tool) {
    if (["spawn", "assign", "review", "complete"].includes(name)) {
      return `Error: '${name}' is not an API function tool. You MUST use the markdown code block syntax (e.g., \`\`\`${name}\\n{...}\\n\`\`\`) in your regular message content as instructed in your system prompt. Do NOT use tool/function calling for swarm management.`;
    }
    return `Error: Unknown tool '${name}'.`;
  }
  if (!tool.enabled) return `Error: Tool '${name}' is currently disabled.`;

  log(`Executing tool: ${name}(${JSON.stringify(args).substring(0, 100)})`, "tools");

  try {
    const result = await tool.execute(args, agentContext);
    return result;
  } catch (err: any) {
    log(`Tool ${name} execution failed: ${err.message}`, "tools");
    return `Error executing ${name}: ${err.message}`;
  }
}
