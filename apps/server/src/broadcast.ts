import type { Card, ServerEvent, LobbyRoomInfo } from "@pro-gyakuten/protocol";
import { toPublicState, getPlayerHand } from "@pro-gyakuten/core";
import type { ActionResult } from "@pro-gyakuten/core";
import type { RoomState } from "./types.js";
import { connections, playersById, send } from "./state.js";
import { roomManager } from "./room-manager.js";
import { getAllowedActions } from "./actions.js";

export function getPlayerTeam(room: RoomState, playerId: string): "teamA" | "teamB" {
  return room.teams.teamA.includes(playerId) ? "teamA" : "teamB";
}

export function getTeammateHands(room: RoomState, playerId: string): { [playerId: string]: Card[] } {
  if (!room.game) return {};
  const team = getPlayerTeam(room, playerId);
  const teammates = team === "teamA" ? room.game.teams.teamA : room.game.teams.teamB;
  return teammates
    .filter((teammateId) => teammateId !== playerId)
    .reduce((acc, teammateId) => {
      acc[teammateId] = getPlayerHand(room.game!, teammateId);
      return acc;
    }, {} as { [playerId: string]: Card[] });
}

export function roomSnapshot(room: RoomState): ServerEvent {
  return {
    type: "roomSnapshot",
    roomId: room.roomId,
    status: room.status,
    players: room.players.map((playerId, seat) => ({
      playerId,
      seat,
      handCount: room.game?.players[seat]?.hand.length ?? 0,
      connected: !!playersById.get(playerId) && !playersById.get(playerId)?.disconnectedAt
    }))
  };
}

export function broadcastToLobby(event: ServerEvent): void {
  for (const conn of connections.values()) {
    if (conn.isInLobby) send(conn.ws, event);
  }
}

export function getLobbyStateEvent(): ServerEvent {
  const roomInfos: LobbyRoomInfo[] = Array.from(roomManager.values())
    .filter((room) => room.status !== "finished" && room.status !== "game_over")
    .map((room) => ({
      roomId: room.roomId,
      ownerPlayerId: room.ownerPlayerId,
      playerCount: room.players.length,
      status: (room.status === "lobby" ? "lobby" : "in_game") as "lobby" | "in_game"
    }));
  return { type: "lobbyState", rooms: roomInfos };
}

export function buildStateEvent(room: RoomState, playerId: string, message?: string, presentationHint?: string): ServerEvent {
  const hand = getPlayerHand(room.game!, playerId);
  const allowedActions = getAllowedActions(room, playerId);
  if (message === "已恢复连接") {
    console.log(`[buildStateEvent] Reconnect for ${playerId}: hand=${hand.length}, allowedActions=${JSON.stringify(allowedActions)}, phase=${room.phase?.phase}, currentPlayerIndex=${room.game!.currentPlayerIndex}, turnId=${room.game!.turnId}`);
  }
  return {
    type: "statePatch",
    state: toPublicState(room.game!),
    phase: room.phase!,
    hand,
    teammateHands: getTeammateHands(room, playerId),
    message,
    lastSeq: room.game!.players.find((player) => player.playerId === playerId)?.lastSeq,
    allowedActions,
    playableDrawnCardId:
      room.drawnCardWindow?.playerId === playerId && room.drawnCardWindow.playable
        ? room.drawnCardWindow.cardId
        : undefined,
    presentationHint
  };
}

export function broadcastGameState(room: RoomState, message?: string, presentationHint?: string): void {
  for (const playerId of room.players) {
    const conn = playersById.get(playerId);
    if (!conn || conn.roomId !== room.roomId) continue;
    send(conn.ws, buildStateEvent(room, playerId, message, presentationHint));
  }
}

export function finalizeAction(room: RoomState, result: ActionResult, baseMessage: string): string | null {
  const mergedMessage = [baseMessage, ...(result.announcements ?? [])].filter(Boolean).join(" | ");
  if (room.game?.winnerTeam) {
    const finalState = toPublicState(room.game);
    room.status = "game_over";
    room.phase = undefined;
    room.drawnCardWindow = undefined;
    room.phaseToken += 1;
    for (const playerId of room.players) {
      const conn = playersById.get(playerId);
      if (conn && conn.roomId === room.roomId) {
        send(conn.ws, { type: "gameOver", state: finalState });
      }
    }
    broadcastToLobby(getLobbyStateEvent());
    return null;
  }
  return mergedMessage;
}
