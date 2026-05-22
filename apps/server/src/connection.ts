import type { PlayerConn, RoomState } from "./types.js";
import { RECONNECT_GRACE_MS } from "./types.js";
import { connections, playersById, send } from "./state.js";
import { roomManager } from "./room-manager.js";
import { persistence } from "./db.js";
import { broadcastToLobby, getLobbyStateEvent, buildStateEvent, roomSnapshot } from "./broadcast.js";
import {
  setGamePlayerConnected,
  removePlayerFromLobbyRoom,
  broadcastRoomSnapshot
} from "./room.js";

export function markDisconnected(playerId: string): void {
  const conn = playersById.get(playerId);
  if (!conn) return;
  conn.disconnectedAt = Date.now();
  if (conn.roomId) {
    const room = roomManager.get(conn.roomId);
    if (room?.status === "in_game") {
      setGamePlayerConnected(room, playerId, false);
      broadcastGameState(room, `Player ${playerId} disconnected.`);
    }
  }

  setTimeout(async () => {
    const latest = playersById.get(playerId);
    if (!latest || !latest.disconnectedAt || Date.now() - latest.disconnectedAt < RECONNECT_GRACE_MS) return;

    playersById.delete(playerId);
    await persistence.deletePlayerSession(playerId);
    if (!latest.roomId) return;
    const room = roomManager.get(latest.roomId);
    if (!room) return;

    if (room.status === "lobby" || room.status === "game_over") {
      removePlayerFromLobbyRoom(room, playerId);
      if (room.players.length === 0) {
        roomManager.delete(room.roomId);
        await persistence.deleteRoom(room.roomId);
        await persistence.deleteGameSnapshot(room.roomId);
      } else if (room.players.length === 1) {
        const lastPid = room.players[0];
        const lastConn = playersById.get(lastPid);
        if (lastConn) {
          lastConn.roomId = undefined;
          lastConn.isInLobby = true;
          send(lastConn.ws, { type: "actionRejected", code: "INVALID_ACTION", message: "房间人数不足，已自动解散" });
        }
        room.players = [];
        roomManager.delete(room.roomId);
        await persistence.deleteRoom(room.roomId);
        await persistence.deleteGameSnapshot(room.roomId);
      } else {
        if (room.status === "game_over") {
          room.status = "lobby";
          room.game = undefined;
        }
        broadcastRoomSnapshot(room);
      }
      broadcastToLobby(getLobbyStateEvent());
    }
  }, RECONNECT_GRACE_MS + 100);
}

export function handleReconnect(conn: PlayerConn, ws: import("ws").WebSocket, roomId: string, playerId: string): void {
  const existing = playersById.get(playerId);
  if (existing) connections.delete(existing.ws);

  conn.playerId = playerId;
  conn.characterName = playerId;
  conn.roomId = roomId;
  conn.isInLobby = false;
  conn.disconnectedAt = undefined;
  playersById.set(playerId, conn);

  const room = roomManager.get(roomId);
  if (!room) {
    console.log(`[reconnect] Room ${roomId} not found for player ${playerId}`);
    send(ws, { type: "actionRejected", code: "INVALID_ACTION", message: "Room no longer exists. Returned to lobby." });
    send(ws, getLobbyStateEvent());
    return;
  }

  setGamePlayerConnected(room, playerId, true);

  send(ws, roomSnapshot(room));
  if (room.game && room.phase) {
    send(ws, buildStateEvent(room, playerId, "已恢复连接"));
  }
  broadcastToLobby(getLobbyStateEvent());
}

export function handleDisconnect(conn: PlayerConn): void {
  connections.delete(conn.ws);
  if (conn.playerId) markDisconnected(conn.playerId);
}

// Re-use broadcast.ts buildStateEvent for inline broadcast (avoids circular import)
function broadcastGameState(room: RoomState, message?: string): void {
  for (const playerId of room.players) {
    const conn = playersById.get(playerId);
    if (!conn || conn.roomId !== room.roomId) continue;
    send(conn.ws, buildStateEvent(room, playerId, message));
  }
}
