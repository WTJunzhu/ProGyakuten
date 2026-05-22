import type { PlayerConn, RoomState } from "./types.js";
import { playersById, send } from "./state.js";
import { roomManager } from "./room-manager.js";
import { persistence } from "./db.js";
import { broadcastToLobby, getLobbyStateEvent, broadcastGameState, roomSnapshot } from "./broadcast.js";

export function setGamePlayerConnected(room: RoomState, playerId: string, connected: boolean): void {
  const player = room.game?.players.find((entry) => entry.playerId === playerId);
  if (player) player.connected = connected;
}

export function removePlayerFromLobbyRoom(room: RoomState, playerId: string): void {
  room.players = room.players.filter((id) => id !== playerId);
  room.teams.teamA = room.teams.teamA.filter((id) => id !== playerId);
  room.teams.teamB = room.teams.teamB.filter((id) => id !== playerId);
  if (room.ownerPlayerId === playerId) {
    room.ownerPlayerId = room.players[0] ?? "";
  }
}

async function dissolveRoom(room: RoomState, reason: string): Promise<void> {
  for (const pid of room.players) {
    const conn = playersById.get(pid);
    if (conn) {
      conn.roomId = undefined;
      conn.isInLobby = true;
      send(conn.ws, { type: "actionRejected", code: "INVALID_ACTION", message: reason });
      send(conn.ws, roomSnapshot({ ...room, players: [], status: "lobby" }));
    }
  }
  room.players = [];
  roomManager.delete(room.roomId);
  await persistence.deleteRoom(room.roomId);
  await persistence.deleteGameSnapshot(room.roomId);
  broadcastToLobby(getLobbyStateEvent());
}

export function broadcastRoomSnapshot(room: RoomState): void {
  for (const roomPlayerId of room.players) {
    const roomConn = playersById.get(roomPlayerId);
    if (roomConn && roomConn.roomId === room.roomId) send(roomConn.ws, roomSnapshot(room));
  }
}

export async function leaveRoom(conn: PlayerConn, playerId: string): Promise<void> {
  const roomId = conn.roomId;
  conn.roomId = undefined;
  conn.isInLobby = true;
  conn.disconnectedAt = undefined;
  playersById.delete(playerId);
  await persistence.deletePlayerSession(playerId);

  if (!roomId) return;
  const room = roomManager.get(roomId);
  if (!room) return;

  if (room.status === "lobby" || room.status === "game_over") {
    removePlayerFromLobbyRoom(room, playerId);

    if (room.players.length === 0) {
      roomManager.delete(room.roomId);
      await persistence.deleteRoom(room.roomId);
      await persistence.deleteGameSnapshot(room.roomId);
      broadcastToLobby(getLobbyStateEvent());
      return;
    }

    if (room.players.length === 1) {
      await dissolveRoom(room, "房间人数不足，已自动解散");
      return;
    }

    if (room.status === "game_over") {
      room.status = "lobby";
      room.game = undefined;
    }
    await persistence.saveRoom(room);
    broadcastRoomSnapshot(room);
    broadcastToLobby(getLobbyStateEvent());
    return;
  }

  if (room.status === "in_game") {
    setGamePlayerConnected(room, playerId, false);
    broadcastGameState(room, `Player ${playerId} left the room.`);

    const connectedPlayers = room.players.filter((pid) => {
      const c = playersById.get(pid);
      return c && !c.disconnectedAt;
    });
    if (connectedPlayers.length <= 1) {
      await dissolveRoom(room, "对局中玩家不足，房间已自动解散");
      return;
    }
    broadcastToLobby(getLobbyStateEvent());
  }
}
