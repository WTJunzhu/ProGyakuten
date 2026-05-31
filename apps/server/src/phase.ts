import {
  alignTurnToSkipConstraint,
  applyPassTurn,
  applyDrawCard,
  isCardPlayable
} from "@pro-gyakuten/core";
import type { TurnPhase, TurnPhaseInfo } from "@pro-gyakuten/protocol";
import type { RoomState } from "./types.js";
import { roomManager } from "./room-manager.js";
import { broadcastGameState, finalizeAction } from "./broadcast.js";
import { canPlayerSnatch, getSnatchResponders } from "./actions.js";
import {
  TURN_TIMEOUT_MS,
  SNATCH_WINDOW_TIMEOUT_MS,
  POST_DRAW_WINDOW_TIMEOUT_MS,
  SNATCH_AUTO_SKIP_MS
} from "./types.js";
import { triggerAiIfNeeded } from "./ai/index.js";

function currentPlayerId(room: RoomState): string {
  return room.game!.players[room.game!.currentPlayerIndex].playerId;
}

export function setPhase(
  room: RoomState,
  phase: TurnPhase,
  actingPlayerId: string,
  durationMs: number,
  extras?: Partial<TurnPhaseInfo>
): void {
  room.phaseToken += 1;
  room.phase = {
    phase,
    actingPlayerId,
    endsAt: Date.now() + durationMs,
    ...extras
  };
}

export function startMainTurn(room: RoomState, message?: string): void {
  if (!room.game) return;
  alignTurnToSkipConstraint(room.game);
  room.drawnCardWindow = undefined;
  setPhase(room, "turn_main", currentPlayerId(room), TURN_TIMEOUT_MS);
  broadcastGameState(room, message);
  schedulePhaseTimeout(room.roomId, room.phaseToken);
  triggerAiIfNeeded(room);
}

export function startSnatchWindow(room: RoomState, sourcePlayerId: string, message?: string): void {
  if (!room.game) return;
  room.drawnCardWindow = undefined;
  setPhase(room, "snatch_window", currentPlayerId(room), SNATCH_WINDOW_TIMEOUT_MS, {
    sourcePlayerId,
    skippedSnatchPlayerIds: []
  });
  broadcastGameState(room, message);
  schedulePhaseTimeout(room.roomId, room.phaseToken);
  scheduleSnatchAutoSkip(room.roomId, room.phaseToken);
  triggerAiIfNeeded(room);
}

export function startPostDrawWindow(
  room: RoomState,
  playerId: string,
  cardId: string,
  playable: boolean,
  message?: string
): void {
  if (!room.game) return;
  room.drawnCardWindow = {
    playerId,
    cardId,
    playable,
    turnId: room.game.turnId
  };
  setPhase(room, "post_draw_window", playerId, POST_DRAW_WINDOW_TIMEOUT_MS, { drawnCardPlayable: playable });
  broadcastGameState(room, message);
  schedulePhaseTimeout(room.roomId, room.phaseToken);
  triggerAiIfNeeded(room);
}

export function maybeFinishSnatchWindowEarly(room: RoomState, message?: string): boolean {
  if (!room.phase || room.phase.phase !== "snatch_window") return false;
  const responders = getSnatchResponders(room);
  const skipped = new Set(room.phase.skippedSnatchPlayerIds ?? []);
  if (responders.length > 0 && responders.every((playerId) => skipped.has(playerId))) {
    startMainTurn(room, message ?? "All other players skipped snatching.");
    return true;
  }
  return false;
}

// --- Timeout handlers ---

function handlePhaseTimeout(roomId: string, phaseToken: number): void {
  const room = roomManager.get(roomId);
  if (!room || !room.game || room.status !== "in_game" || room.phaseToken !== phaseToken || !room.phase) return;

  if (room.phase.phase === "turn_main") {
    const playerId = currentPlayerId(room);
    const player = room.game.players[room.game.currentPlayerIndex];
    const seq = player.lastSeq + 1;

    if (room.game.drawCardStack > 0) {
      const result = applyPassTurn(room.game, playerId, room.game.turnId, seq);
      const message = finalizeAction(room, result, `玩家 ${playerId} 超时，自动结算罚摸`);
      if (room.status === "in_game") startMainTurn(room, message ?? undefined);
      return;
    }

    const drawResult = applyDrawCard(room.game, playerId, room.game.turnId, seq);
    if (!drawResult.ok || !drawResult.drawnCard) return;
    const playable = isCardPlayable(room.game, drawResult.drawnCard);
    startPostDrawWindow(room, playerId, drawResult.drawnCard.id, playable, `玩家 ${playerId} 超时，自动摸牌`);
    return;
  }

  if (room.phase.phase === "snatch_window") {
    startMainTurn(room, "抢牌判定结束");
    return;
  }

  if (room.phase.phase === "post_draw_window" && room.drawnCardWindow) {
    const playerId = room.drawnCardWindow.playerId;
    const player = room.game.players[room.game.currentPlayerIndex];
    const seq = player.lastSeq + 1;
    const result = applyPassTurn(room.game, playerId, room.game.turnId, seq);
    const message = finalizeAction(room, result, `玩家 ${playerId} 放弃打出摸到的牌`);
    if (room.status === "in_game") startMainTurn(room, message ?? undefined);
  }
}

export function schedulePhaseTimeout(roomId: string, phaseToken: number): void {
  const room = roomManager.get(roomId);
  const endsAt = room?.phase?.endsAt;
  if (!endsAt) return;
  const delay = Math.max(0, endsAt - Date.now());
  setTimeout(() => handlePhaseTimeout(roomId, phaseToken), delay);
}

function handleSnatchAutoSkip(roomId: string, phaseToken: number): void {
  const room = roomManager.get(roomId);
  if (!room || !room.game || room.status !== "in_game" || room.phaseToken !== phaseToken || !room.phase) return;
  if (room.phase.phase !== "snatch_window") return;

  const skipped = new Set(room.phase.skippedSnatchPlayerIds ?? []);
  let changed = false;
  for (const playerId of getSnatchResponders(room)) {
    if (skipped.has(playerId) || canPlayerSnatch(room, playerId)) continue;
    skipped.add(playerId);
    changed = true;
  }

  if (!changed) return;
  room.phase.skippedSnatchPlayerIds = Array.from(skipped);
  if (!maybeFinishSnatchWindowEarly(room)) {
    broadcastGameState(room);
  }
}

export function scheduleSnatchAutoSkip(roomId: string, phaseToken: number): void {
  setTimeout(() => handleSnatchAutoSkip(roomId, phaseToken), SNATCH_AUTO_SKIP_MS);
}
