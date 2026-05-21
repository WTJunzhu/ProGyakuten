import type { RoomState } from "./types.js";
import { playersById, send } from "./state.js";
import { broadcastToLobby, getLobbyStateEvent, roomSnapshot } from "./broadcast.js";
import { broadcastRoomSnapshot, removePlayerFromLobbyRoom } from "./room.js";

export class RoomManager {
  private rooms = new Map<string, RoomState>();

  get(roomId: string): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  has(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  set(roomId: string, room: RoomState): void {
    this.rooms.set(roomId, room);
  }

  delete(roomId: string): void {
    this.rooms.delete(roomId);
  }

  values(): IterableIterator<RoomState> {
    return this.rooms.values();
  }

  createRoom(roomId: string, playerId: string): RoomState {
    const room: RoomState = {
      roomId,
      players: [playerId],
      ownerPlayerId: playerId,
      status: "lobby",
      teams: { teamA: [playerId], teamB: [] },
      phaseToken: 0
    };
    this.rooms.set(roomId, room);
    return room;
  }

  addPlayer(room: RoomState, playerId: string): void {
    room.players.push(playerId);
    if (room.teams.teamA.length <= room.teams.teamB.length) {
      room.teams.teamA.push(playerId);
    } else {
      room.teams.teamB.push(playerId);
    }
  }

  removePlayer(room: RoomState, playerId: string): void {
    removePlayerFromLobbyRoom(room, playerId);
  }

  transferOwnership(room: RoomState): void {
    if (room.ownerPlayerId && !room.players.includes(room.ownerPlayerId)) {
      room.ownerPlayerId = room.players[0] ?? "";
    }
  }

  dissolveRoom(room: RoomState, reason: string): void {
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
    this.rooms.delete(room.roomId);
    broadcastToLobby(getLobbyStateEvent());
  }

  /** Remove a disconnected player after grace period. Dissolves room if needed. */
  cleanupDisconnectedPlayer(playerId: string): void {
    const conn = playersById.get(playerId);
    if (!conn?.roomId) return;
    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    if (room.status === "lobby" || room.status === "game_over") {
      removePlayerFromLobbyRoom(room, playerId);
      if (room.players.length === 0) {
        this.rooms.delete(room.roomId);
      } else if (room.players.length === 1) {
        const lastPid = room.players[0];
        const lastConn = playersById.get(lastPid);
        if (lastConn) {
          lastConn.roomId = undefined;
          lastConn.isInLobby = true;
          send(lastConn.ws, { type: "actionRejected", code: "INVALID_ACTION", message: "房间人数不足，已自动解散" });
        }
        room.players = [];
        this.rooms.delete(room.roomId);
      } else {
        if (room.status === "game_over") {
          room.status = "lobby";
          room.game = undefined;
        }
        broadcastRoomSnapshot(room);
      }
      broadcastToLobby(getLobbyStateEvent());
    }
  }
}

export const roomManager = new RoomManager();
