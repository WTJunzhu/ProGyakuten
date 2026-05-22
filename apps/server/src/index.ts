import http from "node:http";
import { createGame, getPlayerHand, toPublicState } from "@pro-gyakuten/core";
import type { ClientEvent } from "@pro-gyakuten/protocol";
import { WebSocketServer } from "ws";
import type { PlayerConn, RoomState } from "./types.js";
import { PORT, HOST, TURN_TIMEOUT_MS, RECONNECT_GRACE_MS } from "./types.js";
import { connections, playersById, send } from "./state.js";
import { roomManager } from "./room-manager.js";
import { broadcastToLobby, getLobbyStateEvent, roomSnapshot, getTeammateHands } from "./broadcast.js";
import { broadcastRoomSnapshot, leaveRoom } from "./room.js";
import { getAllowedActions } from "./actions.js";
import { setPhase } from "./phase.js";
import { handleAction } from "./handler.js";
import { handleReconnect, handleDisconnect } from "./connection.js";
import { persistence, db } from "./db.js";
import { register, login, verifyToken, setTokenCharacter } from "./auth.js";
import { listCharacters, createCharacter } from "./character.js";

const MAX_CHARACTERS = 3;

// Restore rooms on startup
async function restoreRooms(): Promise<void> {
  await persistence.init();

  const rooms = await persistence.loadAllRooms();
  const restoredRoomIds: string[] = [];
  for (const room of rooms) {
    if (room.status === "in_game") {
      const snapshot = await persistence.loadGameSnapshot(room.roomId);
      if (snapshot) {
        room.game = snapshot.game;
        room.phase = snapshot.phase;
        room.phaseToken = 0;
        room.drawnCardWindow = undefined;
        roomManager.set(room.roomId, room);
        restoredRoomIds.push(room.roomId);
        console.log(`[restore] Room ${room.roomId}: status=${room.status}, players=${room.players}, game.turnId=${room.game.turnId}, game.currentPlayerIndex=${room.game.currentPlayerIndex}, phase=${room.phase?.phase}, drawPile=${room.game.drawPile.length}, discardPile=${room.game.discardPile.length}`);
        continue;
      }
      console.log(`[restore] Room ${room.roomId}: no game snapshot found, falling back to lobby`);
      room.status = "lobby";
      room.game = undefined;
    }
    roomManager.set(room.roomId, room);
  }
  if (restoredRoomIds.length > 0) {
    console.log(`[restore] Restored ${restoredRoomIds.length} game(s). Waiting ${RECONNECT_GRACE_MS / 1000}s for reconnections...`);
    setTimeout(async () => {
      for (const roomId of restoredRoomIds) {
        const room = roomManager.get(roomId);
        if (!room) continue;
        const hasConnected = room.players.some((pid) => {
          const conn = playersById.get(pid);
          return conn && !conn.disconnectedAt;
        });
        if (!hasConnected) {
          console.log(`[cleanup] Room ${roomId}: no players reconnected within grace period, dissolving`);
          room.players = [];
          roomManager.delete(roomId);
          await persistence.deleteRoom(roomId);
          await persistence.deleteGameSnapshot(roomId);
        }
      }
      broadcastToLobby(getLobbyStateEvent());
    }, RECONNECT_GRACE_MS + 500);
  }
}

// --- HTTP + WebSocket Server ---
const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const conn: PlayerConn = { playerId: "", ws, lastSeenAt: Date.now(), isInLobby: true };
  connections.set(ws, conn);
  send(ws, getLobbyStateEvent());

  ws.on("message", async (raw) => {
    let event: ClientEvent;
    try {
      event = JSON.parse(raw.toString()) as ClientEvent;
    } catch {
      send(ws, { type: "actionRejected", code: "INVALID_ACTION", message: "Invalid JSON" });
      return;
    }

    conn.lastSeenAt = Date.now();

    // --- Connection-level events ---
    if (event.type === "requestLobbyState") {
      send(ws, getLobbyStateEvent());
      return;
    }

    // --- Auth events ---
    if (event.type === "register") {
      const result = await register(event.username, event.password);
      if (result.ok) {
        conn.token = result.token;
        conn.accountId = result.accountId;
      }
      send(ws, { type: "authResult", ok: result.ok, token: result.token, accountId: result.accountId, error: result.error });
      return;
    }

    if (event.type === "login") {
      const result = await login(event.username, event.password);
      if (result.ok) {
        conn.token = result.token;
        conn.accountId = result.accountId;
      }
      send(ws, { type: "authResult", ok: result.ok, token: result.token, accountId: result.accountId, error: result.error });
      return;
    }

    // --- Character events (require auth) ---
    if (event.type === "listCharacters") {
      if (!conn.accountId) {
        send(ws, { type: "characterList", characters: [], maxSlots: MAX_CHARACTERS });
        return;
      }
      const characters = await listCharacters(conn.accountId);
      send(ws, { type: "characterList", characters, maxSlots: MAX_CHARACTERS });
      return;
    }

    if (event.type === "createCharacter") {
      if (!conn.accountId) {
        send(ws, { type: "characterCreated", ok: false, error: "未登录" });
        return;
      }
      const result = await createCharacter(conn.accountId, event.displayName, event.overwriteSlotIndex);
      if (result.ok && result.character) {
        send(ws, { type: "characterCreated", ok: true, character: result.character });
      } else {
        send(ws, { type: "characterCreated", ok: false, error: result.error, slotFull: result.error === "SLOT_FULL" });
      }
      return;
    }

    if (event.type === "selectCharacter") {
      if (!conn.accountId || !conn.token) {
        send(ws, { type: "characterSelected", ok: false, error: "未登录" });
        return;
      }
      const characters = await listCharacters(conn.accountId);
      const character = characters.find(c => c.characterId === event.characterId);
      if (!character) {
        send(ws, { type: "characterSelected", ok: false, error: "角色不存在" });
        return;
      }
      conn.characterId = character.characterId;
      conn.characterName = character.displayName;
      setTokenCharacter(conn.token, character.characterId);
      send(ws, { type: "characterSelected", ok: true, characterId: character.characterId, displayName: character.displayName });
      return;
    }

    if (event.type === "leaveRoom") {
      if (!conn.playerId) {
        send(ws, { type: "actionRejected", code: "INVALID_ACTION", message: "Not in a room" });
        return;
      }
      await leaveRoom(conn, conn.playerId);
      send(ws, getLobbyStateEvent());
      return;
    }

    if (event.type === "createRoom") {
      if (!conn.characterId || !conn.characterName) {
        send(ws, { type: "actionRejected", code: "INVALID_ACTION", message: "请先选择角色" });
        return;
      }
      if (roomManager.has(event.roomId)) {
        send(ws, { type: "actionRejected", code: "INVALID_ACTION", message: "Room ID already exists" });
        return;
      }

      const playerId = conn.characterName;
      conn.playerId = playerId;
      conn.roomId = event.roomId;
      conn.isInLobby = false;
      conn.disconnectedAt = undefined;
      playersById.set(playerId, conn);

      const room = roomManager.createRoom(event.roomId, playerId);
      roomManager.set(room.roomId, room);
      await persistence.saveRoom(room);
      await persistence.savePlayerSession(playerId, event.roomId);
      send(ws, roomSnapshot(room));
      broadcastToLobby(getLobbyStateEvent());
      return;
    }

    if (event.type === "joinRoom") {
      if (!conn.characterId || !conn.characterName) {
        send(ws, { type: "actionRejected", code: "INVALID_ACTION", message: "请先选择角色" });
        return;
      }
      const room = roomManager.get(event.roomId);
      if (!room) {
        send(ws, { type: "actionRejected", code: "INVALID_ACTION", message: "Room not found" });
        return;
      }
      if (room.status !== "lobby") {
        send(ws, { type: "actionRejected", code: "INVALID_ACTION", message: "Game already started" });
        return;
      }
      const playerId = conn.characterName;
      if (room.players.includes(playerId)) {
        send(ws, { type: "actionRejected", code: "INVALID_ACTION", message: "Already joined" });
        return;
      }
      if (room.players.length >= 6) {
        send(ws, { type: "actionRejected", code: "INVALID_ACTION", message: "Room is full" });
        return;
      }

      conn.playerId = playerId;
      conn.roomId = event.roomId;
      conn.isInLobby = false;
      conn.disconnectedAt = undefined;
      playersById.set(playerId, conn);

      roomManager.addPlayer(room, playerId);
      await persistence.saveRoom(room);
      await persistence.savePlayerSession(playerId, event.roomId);
      broadcastRoomSnapshot(room);
      broadcastToLobby(getLobbyStateEvent());
      return;
    }

    if (event.type === "reconnect") {
      handleReconnect(conn, ws, event.roomId, event.playerId);
      await persistence.savePlayerSession(event.playerId, event.roomId);
      return;
    }

    // --- Room-level events (require active room) ---
    const roomId = conn.roomId;
    if (!roomId) {
      console.log(`[action] Player ${conn.playerId} sent ${event.type} but conn.roomId is undefined`);
      send(ws, { type: "actionRejected", code: "INVALID_ACTION", message: "Not in a room" });
      return;
    }

    const room = roomManager.get(roomId);
    if (!room) {
      send(ws, { type: "actionRejected", code: "INVALID_ACTION", message: "Room not found" });
      return;
    }

    if (event.type === "startGame") {
      if (room.ownerPlayerId !== conn.playerId) {
        send(ws, { type: "actionRejected", code: "INVALID_ACTION", message: "Only owner can start" });
        return;
      }
      if (![2, 4, 6].includes(room.players.length)) {
        send(ws, { type: "actionRejected", code: "INVALID_ACTION", message: "Need exactly 2, 4, or 6 players" });
        return;
      }

      room.game = createGame(room.roomId, room.players);
      room.status = "in_game";
      room.phaseToken = 0;
      room.drawnCardWindow = undefined;
      setPhase(room, "turn_main", room.game.players[room.game.currentPlayerIndex].playerId, TURN_TIMEOUT_MS);

      for (const playerId of room.players) {
        const roomConn = playersById.get(playerId);
        if (!roomConn) continue;
        send(roomConn.ws, {
          type: "gameStart",
          state: toPublicState(room.game),
          phase: room.phase!,
          hand: getPlayerHand(room.game, playerId),
          teammateHands: getTeammateHands(room, playerId),
          lastSeq: room.game.players.find((player) => player.playerId === playerId)?.lastSeq,
          allowedActions: getAllowedActions(room, playerId),
          playableDrawnCardId: undefined
        });
      }

      await persistence.saveRoom(room);
      await persistence.saveGameSnapshot(room.roomId, room.game, room.phase);
      broadcastToLobby(getLobbyStateEvent());
      return;
    }

    // Game actions
    handleAction(room, event);

    // Persist game state after action
    if (room.game) {
      await persistence.saveGameSnapshot(room.roomId, room.game, room.phase);
      if (room.status !== "in_game") {
        await persistence.saveRoom(room);
      }
    }
  });

  ws.on("close", async () => {
    if (conn.playerId) {
      await persistence.savePlayerSession(conn.playerId, null);
    }
    handleDisconnect(conn);
  });
});

// Start server
(async () => {
  await restoreRooms();
  httpServer.listen(PORT, HOST, () => {
    console.log(`pro-gyakuten server running on http://${HOST}:${PORT}`);
  });
})();
