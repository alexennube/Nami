import type { NamiEvent } from "@shared/schema";

type EventHandler = (event: NamiEvent) => void;
type ReconnectHandler = () => void;

class NamiWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<EventHandler> = new Set();
  private reconnectHandlers: Set<ReconnectHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private hasConnectedBefore = false;

  connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) return;
    this.isConnecting = true;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    this.ws.onopen = () => {
      this.isConnecting = false;
      if (this.hasConnectedBefore) {
        console.log("[Nami WS] Reconnected — refreshing all data");
        this.reconnectHandlers.forEach((handler) => handler());
      } else {
        console.log("[Nami WS] Connected");
      }
      this.hasConnectedBefore = true;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as NamiEvent;
        this.handlers.forEach((handler) => handler(data));
      } catch (e) {
        console.error("[Nami WS] Parse error:", e);
      }
    };

    this.ws.onclose = () => {
      this.isConnecting = false;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.isConnecting = false;
      this.ws?.close();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 3000);
  }

  subscribe(handler: EventHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onReconnect(handler: ReconnectHandler) {
    this.reconnectHandlers.add(handler);
    return () => this.reconnectHandlers.delete(handler);
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const namiWs = new NamiWebSocket();
