import * as fs from "fs";
import * as path from "path";
import { exec, execFile } from "child_process";
import { log } from "./index";
import { storage } from "./storage";
import { dbSaveWorkspaceFile, dbDeleteWorkspaceFile, dbGetKanbanCards, dbGetKanbanComments, dbAddKanbanComment, dbGetKanbanColumns, dbUpsertKanbanCard, dbDeleteKanbanCard, dbUpsertKanbanColumn, dbDeleteKanbanColumn, dbGetCrmContacts, dbGetCrmContact, dbGetCrmActivities, dbAddCrmActivity, dbGetCrmContactComments, dbAddCrmContactComment, dbUpsertCrmContact, dbDeleteCrmContact, dbGetCrmAccounts, dbGetCrmAccount, dbUpsertCrmAccount, dbDeleteCrmAccount, dbGetCrmSequences, dbGetCrmSequence, dbUpsertCrmSequence, dbDeleteCrmSequence } from "./db-persist";
import crypto from "crypto";
import { logAudit } from "./audit";

type EngineFunctions = {
  createSwarmWithQueen: (data: { name: string; goal: string; objective: string; maxCycles?: number }) => Promise<any>;
  createSpawn: (data: { name: string; model: string; systemPrompt: string; parentId: string | null; swarmId: string | null }) => Promise<any>;
  swarmAction: (swarmId: string, action: string) => Promise<any>;
  runSwarmQueen: (swarmId: string, maxCycles?: number) => Promise<void>;
  getSwarmStatus: (swarmId: string) => Promise<string>;
  getSwarm: (swarmId: string) => Promise<any>;
  runContactIntelligenceAnalysis?: (contact: any) => Promise<any>;
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
          createdBy: authorName,
          lastModifiedBy: authorName,
        };
        await dbUpsertKanbanCard(card);
        logAudit("created", "kanban_card", card.id, title, { actorType: "agent", actorName: authorName }, `Card "${title}" created by ${authorName}`);
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
          lastModifiedBy: authorName,
        };
        await dbUpsertKanbanCard(updated);
        logAudit("updated", "kanban_card", cardId, updated.title, { actorType: "agent", actorName: authorName }, `Card "${updated.title}" updated by ${authorName}`);
        return `Card updated: **${updated.title}** (ID: ${cardId}).`;
      }

      if (action === "delete_card") {
        if (!cardId) return "Error: card_id is required for delete_card.";
        const cards = await dbGetKanbanCards();
        const deletedCard = cards.find((c: any) => c.id === cardId);
        await dbDeleteKanbanCard(cardId);
        logAudit("deleted", "kanban_card", cardId, deletedCard?.title || cardId, { actorType: "agent", actorName: authorName }, `Card "${deletedCard?.title || cardId}" deleted by ${authorName}`);
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
  description: `Interact with the CRM system. Full control over contacts, accounts, sequences, and agent-driven outreach.

CONTACTS: create_contact, list_contacts, get_contact, search_contacts, update_contact, delete_contact
ACCOUNTS: create_account, list_accounts, get_account, update_account, delete_account
ACTIVITIES & COMMENTS: log_activity, add_comment, get_activities, get_comments
SEQUENCES: list_sequences, get_sequence, create_sequence, update_sequence, delete_sequence
ENROLLMENT: enroll_contacts, unenroll_contacts, pause_contact, resume_contact, advance_contact, complete_contact
AGENT STEP ACTIONS: save_step_draft (save personalized draft for a contact at a step), get_step_context (get current step + draft + intelligence), mark_step_done (record action taken, log activity, advance)

The sequence model is a task list for agents: the sequence defines step types and order, but agents plan the specific action for each contact, draft content, and mark steps complete.`,
  category: "system",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "Action to perform",
        enum: [
          "create_contact", "list_contacts", "get_contact", "search_contacts", "update_contact", "delete_contact",
          "create_account", "list_accounts", "get_account", "update_account", "delete_account",
          "log_activity", "add_comment", "get_activities", "get_comments",
          "list_sequences", "get_sequence", "create_sequence", "update_sequence", "delete_sequence",
          "enroll_contacts", "unenroll_contacts", "pause_contact", "resume_contact", "advance_contact", "complete_contact",
          "save_step_draft", "get_step_context", "mark_step_done",
        ],
      },
      contact_id: {
        type: "string",
        description: "Contact ID (required for get/update/delete_contact, log_activity, add_comment, get_activities, get_comments, pause/resume/advance/complete_contact, save_step_draft, get_step_context, mark_step_done)",
      },
      contact_ids: {
        type: "array",
        description: "Array of contact IDs (for enroll_contacts, unenroll_contacts)",
        items: { type: "string" },
      },
      sequence_id: {
        type: "string",
        description: "Sequence ID (required for get/update/delete_sequence, enroll/unenroll_contacts, pause/resume/advance/complete_contact, save_step_draft, get_step_context, mark_step_done)",
      },
      step_id: {
        type: "string",
        description: "Step ID within a sequence (required for save_step_draft, mark_step_done)",
      },
      query: {
        type: "string",
        description: "Search query for search_contacts (searches name, email, company, tags)",
      },
      first_name: {
        type: "string",
        description: "First name (required for create_contact)",
      },
      last_name: {
        type: "string",
        description: "Last name (required for create_contact)",
      },
      email: {
        type: "string",
        description: "Email address (for create_contact)",
      },
      phone: {
        type: "string",
        description: "Phone number (for create_contact)",
      },
      company: {
        type: "string",
        description: "Company name (for create_contact, or name for create_account)",
      },
      account_id: {
        type: "string",
        description: "Account ID to associate a contact with (for create_contact, create_sequence), or target account (for get_account, delete_account)",
      },
      updates: {
        type: "object",
        description: "Fields to update (for update_contact, update_account, or update_sequence). For contacts: notes, tags, stage, title, company, linkedIn, twitter, etc. For accounts: name, domain, industry, description, website, size, etc. For sequences: name, description, status, steps, sequenceType, etc.",
      },
      activity_type: {
        type: "string",
        description: "Type of activity for log_activity: email_sent, email_received, profile_visit, note, call, meeting, research, sequence_step, engagement, other",
      },
      title: {
        type: "string",
        description: "Title/subject for activity (log_activity) or sequence name (create_sequence)",
      },
      content: {
        type: "string",
        description: "Content/description for log_activity, add_comment, or sequence description (create_sequence)",
      },
      metadata: {
        type: "object",
        description: "Optional metadata for activity, account details, or mark_step_done action details",
      },
      steps: {
        type: "array",
        description: "Array of sequence steps for create_sequence. Each step: { id, order, type ('email'|'phone_call'|'linkedin'|'social_media'|'research'|'wait'|'task'), subject?, content?, delayDays?, instruction? }",
      },
      name: {
        type: "string",
        description: "Name for create_sequence (alternative to title)",
      },
      description: {
        type: "string",
        description: "Description for create_sequence (alternative to content)",
      },
      sequence_type: {
        type: "string",
        description: "Sequence type for create_sequence: 'contact' or 'account'",
      },
      draft_type: {
        type: "string",
        description: "Type of draft for save_step_draft: 'email', 'linkedin', 'interaction'",
      },
      subject: {
        type: "string",
        description: "Subject line for save_step_draft (email drafts)",
      },
      body: {
        type: "string",
        description: "Body content for save_step_draft",
      },
      notes: {
        type: "string",
        description: "Notes for save_step_draft or mark_step_done",
      },
      action_taken: {
        type: "string",
        description: "Description of what was done for mark_step_done (e.g., 'Email sent', 'LinkedIn connection request sent')",
      },
    },
    required: ["action"],
  },
  execute: async (args, agentContext) => {
    const action = args.action as string;
    const contactId = args.contact_id as string;
    const sequenceId = args.sequence_id as string;
    const authorName = agentContext?.agentName || "Nami";
    const authorType = (agentContext?.agentRole === "queen" || agentContext?.agentRole === "swarm_queen") ? "queen" : "agent";

    try {
      if (action === "create_contact") {
        const firstName = args.first_name as string;
        const lastName = args.last_name as string;
        if (!firstName || !lastName) return "Error: first_name and last_name are required.";
        const now = new Date().toISOString();
        const contact = {
          id: crypto.randomUUID(),
          accountId: (args.account_id as string) || null,
          firstName, lastName,
          email: (args.email as string) || "",
          phone: (args.phone as string) || "",
          title: (args.title as string) || "",
          company: (args.company as string) || "",
          linkedIn: "", twitter: "", website: "",
          notes: (args.content as string) || "",
          tags: [] as string[], stage: "lead",
          sequenceId: null, sequenceStep: null,
          createdAt: now, updatedAt: now,
          createdBy: authorName, lastModifiedBy: authorName,
        };
        await dbUpsertCrmContact(contact);
        logAudit("created", "crm_contact", contact.id, `${firstName} ${lastName}`, { actorType: "agent", actorName: authorName }, `CRM contact "${firstName} ${lastName}" created by ${authorName}`);
        return `Contact created: **${firstName} ${lastName}** (${contact.id.substring(0, 8)}…) | ${contact.email || "no email"} | ${contact.company || "no company"}`;
      }

      if (action === "delete_contact") {
        if (!contactId) return "Error: contact_id required.";
        const c = await dbGetCrmContact(contactId);
        if (!c) return "Error: Contact not found.";
        await dbDeleteCrmContact(contactId);
        logAudit("deleted", "crm_contact", contactId, `${c.firstName} ${c.lastName}`, { actorType: "agent", actorName: authorName }, `CRM contact "${c.firstName} ${c.lastName}" deleted by ${authorName}`);
        return `Contact deleted: **${c.firstName} ${c.lastName}** (${contactId.substring(0, 8)}…)`;
      }

      if (action === "create_account") {
        const name = (args.company as string) || (args.title as string);
        if (!name) return "Error: company (account name) is required.";
        const now = new Date().toISOString();
        const account = {
          id: crypto.randomUUID(),
          name,
          domain: (args.metadata as any)?.domain || "",
          industry: (args.metadata as any)?.industry || "",
          description: (args.content as string) || "",
          website: (args.metadata as any)?.website || "",
          size: (args.metadata as any)?.size || "",
          createdAt: now, updatedAt: now,
          createdBy: authorName, lastModifiedBy: authorName,
        };
        await dbUpsertCrmAccount(account);
        logAudit("created", "crm_account", account.id, name, { actorType: "agent", actorName: authorName }, `CRM account "${name}" created by ${authorName}`);
        return `Account created: **${name}** (${account.id.substring(0, 8)}…)`;
      }

      if (action === "delete_account") {
        const accId = args.account_id as string;
        if (!accId) return "Error: account_id required.";
        const a = await dbGetCrmAccount(accId);
        if (!a) return "Error: Account not found.";
        await dbDeleteCrmAccount(accId);
        logAudit("deleted", "crm_account", accId, a.name, { actorType: "agent", actorName: authorName }, `CRM account "${a.name}" deleted by ${authorName}`);
        return `Account deleted: **${a.name}** (${accId.substring(0, 8)}…). Associated contacts have been unlinked.`;
      }

      if (action === "list_accounts") {
        const accounts = await dbGetCrmAccounts();
        if (accounts.length === 0) return "No accounts in CRM.";
        return accounts.slice(0, 50).map((a: any) =>
          `- **${a.name}** (${a.id.substring(0, 8)}…) | ${a.industry || "no industry"} | ${a.domain || "no domain"}`
        ).join("\n");
      }

      if (action === "update_account") {
        const accId = args.account_id as string;
        if (!accId) return "Error: account_id required.";
        const a = await dbGetCrmAccount(accId);
        if (!a) return "Error: Account not found.";
        const updates = args.updates as Record<string, any> || {};
        const updated = { ...a, ...updates, id: accId, updatedAt: new Date().toISOString(), lastModifiedBy: authorName };
        await dbUpsertCrmAccount(updated);
        logAudit("updated", "crm_account", accId, a.name, { actorType: "agent", actorName: authorName }, `CRM account "${a.name}" updated by ${authorName}`);
        return `Account **${a.name}** updated.`;
      }

      if (action === "get_account") {
        const accId = (args.account_id as string) || (args.contact_id as string);
        if (!accId) return "Error: account_id required.";
        const a = await dbGetCrmAccount(accId);
        if (!a) return "Error: Account not found.";
        return `**${a.name}**\nDomain: ${a.domain}\nIndustry: ${a.industry}\nSize: ${a.size}\nWebsite: ${a.website}\nDescription: ${a.description}\nCreated: ${a.createdAt}`;
      }

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
        return `**${c.firstName} ${c.lastName}**\nEmail: ${c.email}\nPhone: ${c.phone}\nTitle: ${c.title}\nCompany: ${c.company}\nStage: ${c.stage}\nLinkedIn: ${c.linkedIn}\nTwitter: ${c.twitter}\nTags: ${(c.tags || []).join(", ")}\nNotes: ${c.notes || "(none)"}\nSequence: ${c.sequenceId || "none"} | Step: ${c.sequenceStep ?? "n/a"} | Status: ${c.sequenceStatus || "n/a"}\nCreated: ${c.createdAt}`;
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
        const updated = { ...c, ...updates, id: contactId, updatedAt: new Date().toISOString(), lastModifiedBy: authorName };
        await dbUpsertCrmContact(updated);
        logAudit("updated", "crm_contact", contactId, `${c.firstName} ${c.lastName}`, { actorType: "agent", actorName: authorName }, `CRM contact "${c.firstName} ${c.lastName}" updated by ${authorName}`);
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

      if (action === "list_sequences") {
        const sequences = await dbGetCrmSequences();
        if (sequences.length === 0) return "No sequences in CRM.";
        return sequences.slice(0, 50).map((s: any) =>
          `- **${s.name}** (${s.id.substring(0, 8)}…) | Status: ${s.status} | Steps: ${(s.steps || []).length} | Enrolled: ${(s.contactIds || []).length} | Type: ${s.sequenceType || "contact"}`
        ).join("\n");
      }

      if (action === "get_sequence") {
        if (!sequenceId) return "Error: sequence_id required.";
        const s = await dbGetCrmSequence(sequenceId);
        if (!s) return "Error: Sequence not found.";
        const stepsDetail = (s.steps || []).map((step: any, i: number) =>
          `  ${i + 1}. [${step.type}] ${step.subject || step.instruction || "(no subject)"} (ID: ${step.id})${step.delayDays ? ` — delay: ${step.delayDays}d` : ""}`
        ).join("\n");
        return `**${s.name}** (${s.id})\nDescription: ${s.description || "(none)"}\nStatus: ${s.status}\nType: ${s.sequenceType || "contact"}\nAccount: ${s.accountId || "none"}\nEnrolled contacts: ${(s.contactIds || []).length}\nSteps:\n${stepsDetail}\nCreated: ${s.createdAt}`;
      }

      if (action === "create_sequence") {
        const name = (args.name as string) || (args.title as string) || (args.company as string);
        if (!name) return "Error: name (sequence name) is required.";
        const steps = (args.steps as any[]) || [];
        const now = new Date().toISOString();
        const sequence = {
          id: crypto.randomUUID(),
          name,
          description: (args.description as string) || (args.content as string) || "",
          status: "draft" as const,
          sequenceType: (args.sequence_type as string) || "contact",
          accountId: (args.account_id as string) || undefined,
          steps: steps.map((s: any, i: number) => ({
            id: s.id || crypto.randomUUID(),
            order: s.order ?? i,
            type: s.type || "email",
            subject: s.subject || "",
            content: s.content || "",
            delayDays: s.delayDays || 0,
            instruction: s.instruction || "",
          })),
          contactIds: [] as string[],
          createdAt: now,
          updatedAt: now,
          createdBy: authorName,
          lastModifiedBy: authorName,
        };
        await dbUpsertCrmSequence(sequence);
        logAudit("created", "crm_sequence", sequence.id, name, { actorType: "agent", actorName: authorName }, `CRM sequence "${name}" created by ${authorName}`);
        return `Sequence created: **${name}** (${sequence.id.substring(0, 8)}…) | ${steps.length} steps | Status: draft`;
      }

      if (action === "update_sequence") {
        if (!sequenceId) return "Error: sequence_id required.";
        const s = await dbGetCrmSequence(sequenceId);
        if (!s) return "Error: Sequence not found.";
        const updates = args.updates as Record<string, any> || {};
        const updated = { ...s, ...updates, id: sequenceId, updatedAt: new Date().toISOString(), lastModifiedBy: authorName };
        await dbUpsertCrmSequence(updated);
        logAudit("updated", "crm_sequence", sequenceId, s.name, { actorType: "agent", actorName: authorName }, `CRM sequence "${s.name}" updated by ${authorName}`);
        return `Sequence **${s.name}** updated.`;
      }

      if (action === "delete_sequence") {
        if (!sequenceId) return "Error: sequence_id required.";
        const s = await dbGetCrmSequence(sequenceId);
        if (!s) return "Error: Sequence not found.";
        for (const cid of (s.contactIds || [])) {
          const contact = await dbGetCrmContact(cid);
          if (contact && contact.sequenceId === sequenceId) {
            contact.sequenceId = null;
            contact.sequenceStep = null;
            contact.sequenceStatus = undefined;
            contact.lastStepCompletedAt = undefined;
            contact.sequenceMetadata = undefined;
            contact.updatedAt = new Date().toISOString();
            await dbUpsertCrmContact(contact);
          }
        }
        await dbDeleteCrmSequence(sequenceId);
        logAudit("deleted", "crm_sequence", sequenceId, s.name, { actorType: "agent", actorName: authorName }, `CRM sequence "${s.name}" deleted by ${authorName}`);
        return `Sequence deleted: **${s.name}** (${sequenceId.substring(0, 8)}…). Enrolled contacts have been unenrolled.`;
      }

      if (action === "enroll_contacts") {
        if (!sequenceId) return "Error: sequence_id required.";
        const contactIds = args.contact_ids as string[];
        if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) return "Error: contact_ids array required.";
        const seq = await dbGetCrmSequence(sequenceId);
        if (!seq) return "Error: Sequence not found.";
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
            contact.sequenceStatus = "active";
            contact.lastStepCompletedAt = new Date().toISOString();
            contact.updatedAt = new Date().toISOString();
            await dbUpsertCrmContact(contact);
            if (_engine?.runContactIntelligenceAnalysis) {
              _engine.runContactIntelligenceAnalysis(contact).then(async (intel) => {
                contact.contactIntelligence = intel;
                contact.updatedAt = new Date().toISOString();
                await dbUpsertCrmContact(contact);
              }).catch(() => {});
            }
          }
        }
        return `Enrolled ${newIds.length} contact(s) in sequence **${seq.name}**. Intelligence analysis triggered.`;
      }

      if (action === "unenroll_contacts") {
        if (!sequenceId) return "Error: sequence_id required.";
        const contactIds = args.contact_ids as string[];
        if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) return "Error: contact_ids array required.";
        const seq = await dbGetCrmSequence(sequenceId);
        if (!seq) return "Error: Sequence not found.";
        seq.contactIds = (seq.contactIds || []).filter((id: string) => !contactIds.includes(id));
        seq.updatedAt = new Date().toISOString();
        await dbUpsertCrmSequence(seq);
        for (const cid of contactIds) {
          const contact = await dbGetCrmContact(cid);
          if (contact && contact.sequenceId === seq.id) {
            contact.sequenceId = null;
            contact.sequenceStep = null;
            contact.sequenceStatus = undefined;
            contact.lastStepCompletedAt = undefined;
            contact.sequenceMetadata = undefined;
            contact.updatedAt = new Date().toISOString();
            await dbUpsertCrmContact(contact);
          }
        }
        return `Unenrolled ${contactIds.length} contact(s) from sequence **${seq.name}**.`;
      }

      if (action === "pause_contact") {
        if (!contactId) return "Error: contact_id required.";
        const contact = await dbGetCrmContact(contactId);
        if (!contact) return "Error: Contact not found.";
        if (sequenceId && contact.sequenceId !== sequenceId) return "Error: Contact is not enrolled in the specified sequence.";
        if (!contact.sequenceId) return "Error: Contact is not enrolled in any sequence.";
        contact.sequenceStatus = "paused";
        contact.updatedAt = new Date().toISOString();
        await dbUpsertCrmContact(contact);
        return `Contact ${contact.firstName} ${contact.lastName} paused in sequence.`;
      }

      if (action === "resume_contact") {
        if (!contactId) return "Error: contact_id required.";
        const contact = await dbGetCrmContact(contactId);
        if (!contact) return "Error: Contact not found.";
        if (sequenceId && contact.sequenceId !== sequenceId) return "Error: Contact is not enrolled in the specified sequence.";
        if (!contact.sequenceId) return "Error: Contact is not enrolled in any sequence.";
        contact.sequenceStatus = "active";
        contact.updatedAt = new Date().toISOString();
        await dbUpsertCrmContact(contact);
        return `Contact ${contact.firstName} ${contact.lastName} resumed in sequence.`;
      }

      if (action === "advance_contact") {
        if (!sequenceId) return "Error: sequence_id required.";
        if (!contactId) return "Error: contact_id required.";
        const seq = await dbGetCrmSequence(sequenceId);
        if (!seq) return "Error: Sequence not found.";
        const contact = await dbGetCrmContact(contactId);
        if (!contact) return "Error: Contact not found.";
        if (contact.sequenceId !== sequenceId) return "Error: Contact is not enrolled in this sequence.";
        const currentIdx = contact.sequenceStep || 0;
        const nextStep = currentIdx + 1;
        if (nextStep >= seq.steps.length) {
          contact.sequenceStatus = "completed";
          contact.sequenceStep = currentIdx;
        } else {
          contact.sequenceStep = nextStep;
        }
        contact.lastStepCompletedAt = new Date().toISOString();
        contact.updatedAt = new Date().toISOString();
        await dbUpsertCrmContact(contact);
        const stepDisplay = contact.sequenceStatus === "completed" ? "completed" : `step ${(contact.sequenceStep || 0) + 1}`;
        return `Contact ${contact.firstName} ${contact.lastName} advanced to ${stepDisplay} (status: ${contact.sequenceStatus}).`;
      }

      if (action === "complete_contact") {
        if (!contactId) return "Error: contact_id required.";
        const contact = await dbGetCrmContact(contactId);
        if (!contact) return "Error: Contact not found.";
        if (sequenceId && contact.sequenceId !== sequenceId) return "Error: Contact is not enrolled in the specified sequence.";
        if (!contact.sequenceId) return "Error: Contact is not enrolled in any sequence.";
        contact.sequenceStatus = "completed";
        contact.updatedAt = new Date().toISOString();
        await dbUpsertCrmContact(contact);
        return `Contact ${contact.firstName} ${contact.lastName} marked as completed in sequence.`;
      }

      if (action === "save_step_draft") {
        if (!contactId) return "Error: contact_id required.";
        if (!sequenceId) return "Error: sequence_id required.";
        const stepId = args.step_id as string;
        if (!stepId) return "Error: step_id required.";
        const contact = await dbGetCrmContact(contactId);
        if (!contact) return "Error: Contact not found.";
        if (contact.sequenceId !== sequenceId) return "Error: Contact is not enrolled in this sequence.";
        const draftType = (args.draft_type as string) || "email";
        const draft = {
          draft_type: draftType,
          subject: (args.subject as string) || "",
          body: (args.body as string) || "",
          notes: (args.notes as string) || "",
          savedAt: new Date().toISOString(),
          savedBy: authorName,
        };
        contact.sequenceMetadata = {
          ...(contact.sequenceMetadata || {}),
          [stepId]: { ...(contact.sequenceMetadata?.[stepId] || {}), draft },
        };
        contact.updatedAt = new Date().toISOString();
        await dbUpsertCrmContact(contact);
        return `Draft saved for contact ${contact.firstName} ${contact.lastName} at step ${stepId} (${draftType}).`;
      }

      if (action === "get_step_context") {
        if (!contactId) return "Error: contact_id required.";
        if (!sequenceId) return "Error: sequence_id required.";
        const contact = await dbGetCrmContact(contactId);
        if (!contact) return "Error: Contact not found.";
        if (contact.sequenceId !== sequenceId) return "Error: Contact is not enrolled in this sequence.";
        const seq = await dbGetCrmSequence(sequenceId);
        if (!seq) return "Error: Sequence not found.";
        const currentStepIndex = contact.sequenceStep ?? 0;
        const step = seq.steps[currentStepIndex];
        if (!step) return `Error: No step found at index ${currentStepIndex} in sequence.`;
        const stepMeta = contact.sequenceMetadata?.[step.id] || {};
        const draft = stepMeta.draft || null;
        const intel = contact.contactIntelligence || null;
        let result = `**Contact:** ${contact.firstName} ${contact.lastName} (${contact.email || "no email"})\n`;
        result += `**Company:** ${contact.company || "none"} | **Stage:** ${contact.stage || "lead"}\n`;
        result += `**Sequence:** ${seq.name} | **Step ${currentStepIndex + 1}/${seq.steps.length}:** [${step.type}] ${step.subject || step.instruction || "(no subject)"}\n`;
        result += `**Step ID:** ${step.id}\n`;
        if (step.content) result += `**Step Template Content:** ${step.content}\n`;
        if (step.instruction) result += `**Step Instruction:** ${step.instruction}\n`;
        if (step.delayDays) result += `**Delay:** ${step.delayDays} days\n`;
        result += `**Sequence Status:** ${contact.sequenceStatus || "n/a"}\n`;
        if (draft) {
          result += `\n--- SAVED DRAFT ---\n`;
          result += `Type: ${draft.draft_type} | Subject: ${draft.subject || "(none)"}\n`;
          result += `Body: ${draft.body || "(empty)"}\n`;
          if (draft.notes) result += `Notes: ${draft.notes}\n`;
          result += `Saved by: ${draft.savedBy} at ${draft.savedAt}\n`;
        } else {
          result += `\n--- NO DRAFT SAVED YET ---\n`;
        }
        if (intel) {
          result += `\n--- INTELLIGENCE REPORT ---\n`;
          result += typeof intel === "string" ? intel : JSON.stringify(intel, null, 2);
          result += `\n`;
        }
        return result;
      }

      if (action === "mark_step_done") {
        if (!contactId) return "Error: contact_id required.";
        if (!sequenceId) return "Error: sequence_id required.";
        const stepId = args.step_id as string;
        if (!stepId) return "Error: step_id required.";
        const contact = await dbGetCrmContact(contactId);
        if (!contact) return "Error: Contact not found.";
        if (contact.sequenceId !== sequenceId) return "Error: Contact is not enrolled in this sequence.";
        const seq = await dbGetCrmSequence(sequenceId);
        if (!seq) return "Error: Sequence not found.";
        const currentStepIndex = contact.sequenceStep ?? 0;
        const currentStepObj = seq.steps[currentStepIndex];
        if (!currentStepObj || currentStepObj.id !== stepId) {
          return `Error: step_id "${stepId}" does not match the contact's current step (step ${currentStepIndex + 1}, id: ${currentStepObj?.id || "none"}). Complete steps in order.`;
        }
        const actionTaken = (args.action_taken as string) || "Step completed";
        const notesText = (args.notes as string) || "";
        const activity = {
          id: crypto.randomUUID(),
          contactId,
          type: "sequence_step" as const,
          title: `Step done: ${currentStepObj.type} — ${actionTaken}`,
          description: notesText || `Step ${stepId} marked done by ${authorName}. Action: ${actionTaken}`,
          metadata: {
            sequenceId: seq.id,
            stepId,
            stepType: currentStepObj.type,
            actionTaken,
            ...(args.metadata as Record<string, any> || {}),
          },
          agentName: authorName,
          createdAt: new Date().toISOString(),
        };
        await dbAddCrmActivity(activity);
        contact.sequenceMetadata = {
          ...(contact.sequenceMetadata || {}),
          [stepId]: {
            ...(contact.sequenceMetadata?.[stepId] || {}),
            completedAt: new Date().toISOString(),
            completedBy: authorName,
            actionTaken,
          },
        };
        const nextStep = currentStepIndex + 1;
        if (nextStep >= seq.steps.length) {
          contact.sequenceStatus = "completed";
          contact.sequenceStep = currentStepIndex;
        } else {
          contact.sequenceStep = nextStep;
        }
        contact.lastStepCompletedAt = new Date().toISOString();
        contact.updatedAt = new Date().toISOString();
        await dbUpsertCrmContact(contact);
        return `Step marked done for ${contact.firstName} ${contact.lastName}. Action: ${actionTaken}. Advanced to step ${contact.sequenceStep ?? "completed"} (status: ${contact.sequenceStatus}).`;
      }

      return "Error: Invalid action.";
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};

const allTools: NamiTool[] = [fileReadTool, fileWriteTool, fileEditTool, fileSearchTool, fileListTool, shellExecTool, serverRestartTool, selfInspectTool, webBrowseTool, webSearchTool, googleWorkspaceTool, createSwarmTool, manageSwarmTool, docsReadTool, docsWriteTool, xPostTweetTool, xDeleteTweetTool, xGetStatusTool, browserControlTool, kanbanTool, crmTool];

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
