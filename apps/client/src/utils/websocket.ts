import type { ClientEvent, ServerEvent } from "@pro-gyakuten/protocol";

type EventHandler = (event: ServerEvent) => void;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 8000;

export class GameWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: EventHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = RECONNECT_BASE_MS;
  private shouldReconnect = true;
  private onReconnectCallback: (() => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  onReconnect(callback: () => void): void {
    this.onReconnectCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.onReconnectCallback?.();
        resolve();
      };

      this.ws.onerror = (err) => {
        reject(err);
      };

      this.ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data as string) as ServerEvent;
          for (const handler of this.handlers) {
            handler(event);
          }
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onclose = () => {
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };
    });
  }

  onEvent(handler: EventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  send(event: ClientEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  close(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.onDisconnectCallback?.();
    const delay = this.reconnectDelay;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectDelay = RECONNECT_BASE_MS;
        this.onReconnectCallback?.();
      };

      this.ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data as string) as ServerEvent;
          for (const handler of this.handlers) {
            handler(event);
          }
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onclose = () => {
        if (this.shouldReconnect) {
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // onclose will fire after onerror
      };
    }, delay);
  }
}
