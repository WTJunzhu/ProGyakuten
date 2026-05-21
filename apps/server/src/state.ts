import type { PlayerConn } from "./types.js";
import { WebSocket } from "ws";
import type { ServerEvent } from "@pro-gyakuten/protocol";

// Global mutable state — singletons for the server instance
export const connections = new Map<WebSocket, PlayerConn>();
export const playersById = new Map<string, PlayerConn>();

export function send(ws: WebSocket, event: ServerEvent): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(event));
}
