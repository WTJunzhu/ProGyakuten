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

/** Check if a room's owner is AI — if so, dissolve immediately */
export function checkAiOwnerAndDissolve(room: RoomState): boolean {
  if ((room.aiPlayers ?? []).includes(room.ownerPlayerId)) {
    console.log(`[ai-owner] Room ${room.roomId}: owner is AI (${room.ownerPlayerId}), dissolving`);
    for (const pid of room.players) {
      if ((room.aiPlayers ?? []).includes(pid)) continue;
      const conn = playersById.get(pid);
      if (conn && !conn.disconnectedAt) {
        conn.roomId = undefined;
        conn.isInLobby = true;
        send(conn.ws, { type: "actionRejected", code: "INVALID_ACTION", message: "房间已自动解散" });
      }
    }
    room.aiPlayers = [];
    room.players = [];
    room.game = undefined;
    room.phase = undefined;
    roomManager.delete(room.roomId);
    persistence.deleteRoom(room.roomId);
    persistence.deleteGameSnapshot(room.roomId);
    broadcastToLobby(getLobbyStateEvent());
    return true;
  }
  return false;
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

  if (room.status === "lobby" || room.status === "game_over" ||
      room.status === "character_selection" || room.status === "game_intro") {
    removePlayerFromLobbyRoom(room, playerId);

    // If AI became owner after human left, dissolve immediately
    if (checkAiOwnerAndDissolve(room)) return;

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

    if (room.status === "game_over" ||
        room.status === "character_selection" ||
        room.status === "game_intro") {
      room.status = "lobby";
      room.game = undefined;
      room.characterDraft = undefined;
    }
    await persistence.saveRoom(room);
    broadcastRoomSnapshot(room);
    broadcastToLobby(getLobbyStateEvent());
    return;
  }

  if (room.status === "in_game") {
    setGamePlayerConnected(room, playerId, false);
    broadcastGameState(room, `Player ${playerId} left the room.`);

    const humanPlayerIds = room.players.filter(pid => !room.aiPlayers?.includes(pid));
    const connectedHumans = humanPlayerIds.filter((pid) => {
      const c = playersById.get(pid);
      return c && !c.disconnectedAt;
    });
    if (connectedHumans.length === 0) {
      await dissolveRoom(room, "对局中无人类玩家，房间已自动解散");
      return;
    }

    // Transfer ownership if leaving player was owner
    if (room.ownerPlayerId === playerId) {
      room.ownerPlayerId = connectedHumans[0] ?? room.players[0] ?? "";
      // If AI became owner, dissolve (swept by periodic check too, but dissolve now)
      if ((room.aiPlayers ?? []).includes(room.ownerPlayerId)) {
        await dissolveRoom(room, "对局中无人类玩家，房间已自动解散");
        return;
      }
    }

    broadcastToLobby(getLobbyStateEvent());
  }
}
