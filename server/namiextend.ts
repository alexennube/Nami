import type WebSocket from "ws";
import { randomUUID } from "crypto";
import { pool, dbInit } from "./db-persist";

export const activeBrowserStack: WebSocket[] = [];

let pendingRequests = new Map<string, { resolve: (value: string) => void; timer: NodeJS.Timeout }>();

let latestPageState: { url: string; title: string; text: string; timestamp: number } | null = null;

async function logBrowserReport(payload: any): Promise<void> {
  try {
    await dbInit();
    await pool.query(
      "INSERT INTO nami_browser_logs (id, action, selector, content, created_at) VALUES ($1, $2, $3, $4, NOW())",
      [randomUUID(), "PAGE_SNAPSHOT", payload.url || "", JSON.stringify(payload)]
    );
  } catch {}
}

export function addBrowserClient(ws: WebSocket): void {
  activeBrowserStack.unshift(ws);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "response" && msg.requestId && pendingRequests.has(msg.requestId)) {
        const pending = pendingRequests.get(msg.requestId)!;
        clearTimeout(pending.timer);
        pendingRequests.delete(msg.requestId);
        pending.resolve(msg.result || msg.error || "Action completed");
      }

      if (msg.type === "BROWSER_REPORT" && msg.payload) {
        const p = msg.payload;
        latestPageState = {
          url: p.url || "",
          title: p.title || "",
          text: (p.text || p.bodyText || "").substring(0, 8000),
          timestamp: Date.now(),
        };
        logBrowserReport(p);

        if (msg.requestId && pendingRequests.has(msg.requestId)) {
          const pending = pendingRequests.get(msg.requestId)!;
          clearTimeout(pending.timer);
          pendingRequests.delete(msg.requestId);
          const summary = `Action completed. Page state:\nURL: ${latestPageState.url}\nTitle: ${latestPageState.title}\nContent preview: ${latestPageState.text.substring(0, 2000)}`;
          pending.resolve(summary);
        }
      }
    } catch {}
  });

  ws.on("close", () => {
    const index = activeBrowserStack.indexOf(ws);
    if (index > -1) activeBrowserStack.splice(index, 1);

    for (const [reqId, pending] of pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pendingRequests.delete(reqId);
      pending.resolve("Error: Browser extension disconnected before responding.");
    }
  });
}

export function getBrowserStatus(): { connected: boolean; clients: number } {
  const live = activeBrowserStack.filter((ws) => ws.readyState === 1);
  return { connected: live.length > 0, clients: live.length };
}

export function getLatestPageState() {
  return latestPageState;
}

export async function getRecentBrowserLogs(limit: number = 10): Promise<any[]> {
  try {
    await dbInit();
    const result = await pool.query(
      "SELECT id, action, selector, content, agent_id, created_at FROM nami_browser_logs ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function executeBrowserAction(
  action: string,
  selector: string,
  text: string = "",
  waitMs: number = 0
): Promise<string> {
  const live = activeBrowserStack.filter((ws) => ws.readyState === 1);
  if (live.length === 0) {
    return "Error: No browser extension connected. Ask the user to connect Namiextend from their browser.";
  }

  const ws = live[0];
  const requestId = randomUUID();
  const payload = { type: "action", requestId, action, selector, text, waitMs };

  try {
    await dbInit();
    await pool.query(
      "INSERT INTO nami_browser_logs (id, action, selector, content, created_at) VALUES ($1, $2, $3, $4, NOW())",
      [randomUUID(), action, selector || "", text || ""]
    );
  } catch {}

  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(`Error: Browser action timed out after 15 seconds. Action: ${action}, Selector: ${selector}`);
    }, 15000);

    pendingRequests.set(requestId, { resolve, timer });

    try {
      ws.send(JSON.stringify(payload));
    } catch (err: any) {
      clearTimeout(timer);
      pendingRequests.delete(requestId);
      resolve(`Error: Failed to send action to browser: ${err.message}`);
    }
  });
}
