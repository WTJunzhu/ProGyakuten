import {
  applyPlayCard,
  applyComboPlay,
  applyDrawCard,
  applyPassTurn,
  applySnatchCard,
  applyComboSnatch,
  applyCallUno,
  isCardPlayable,
  getCharacter,
  canUseSkill,
  consumeSkillUse
} from "@pro-gyakuten/core";
import type { RoomState } from "../types.js";
import { roomManager } from "../room-manager.js";
import { finalizeAction, broadcastGameState } from "../broadcast.js";
import {
  startMainTurn,
  startSnatchWindow,
  startPostDrawWindow,
  maybeFinishSnatchWindowEarly
} from "../phase.js";
import { decideMainTurn, decideSnatch, decidePostDraw } from "./strategy.js";
import type { AiDecision } from "./types.js";

const AI_BASE_MS   = 700;
const AI_JITTER_MS = 500;
const SNATCH_BASE_MS   = 350;
const SNATCH_JITTER_MS = 250;

function thinkDelay(base = AI_BASE_MS, jitter = AI_JITTER_MS): number {
  return base + Math.floor(Math.random() * jitter);
}

// ── Public entry: called after every phase transition ─────────────────

export function triggerAiIfNeeded(room: RoomState): void {
  if (!room.game || room.status !== "in_game" || !room.phase) return;

  const { phase } = room.phase;
  const token = room.phaseToken;

  if (phase === "turn_main") {
    const actingId = room.phase.actingPlayerId;
    if (room.aiPlayers.includes(actingId)) {
      setTimeout(() => handleAiMainTurn(room.roomId, token), thinkDelay());
    }
  } else if (phase === "snatch_window") {
    for (const aiId of room.aiPlayers) {
      if (room.phase.skippedSnatchPlayerIds?.includes(aiId)) continue;
      const delay = thinkDelay(SNATCH_BASE_MS, SNATCH_JITTER_MS);
      setTimeout(() => handleAiSnatch(room.roomId, token, aiId), delay);
    }
  } else if (phase === "post_draw_window") {
    if (room.drawnCardWindow && room.aiPlayers.includes(room.drawnCardWindow.playerId)) {
      setTimeout(() => handleAiPostDraw(room.roomId, token), thinkDelay(300, 200));
    }
  }
}

// ── Main turn ─────────────────────────────────────────────────────────

function handleAiMainTurn(roomId: string, token: number): void {
  const room = roomManager.get(roomId);
  if (!room?.game || room.phaseToken !== token || room.status !== "in_game") return;
  if (room.phase?.phase !== "turn_main") return;

  const playerId = room.game.players[room.game.currentPlayerIndex].playerId;
  if (!room.aiPlayers.includes(playerId)) return;

  const player = room.game.players[room.game.currentPlayerIndex];
  let seq = player.lastSeq + 1;

  // 手牌剩 2 张且即将出牌 → 先喊 UNO
  if (player.hand.length === 2) {
    const unoResult = applyCallUno(room.game, playerId, room.game.turnId, seq);
    if (unoResult.ok) seq++;
  }

  const decision = decideMainTurn(room.game, playerId);
  executeMainDecision(room, playerId, seq, decision);
}

function executeMainDecision(
  room: RoomState,
  playerId: string,
  seq: number,
  decision: AiDecision
): void {
  if (!room.game) return;

  if (decision.type === "play") {
    const result = applyPlayCard(
      room.game, playerId, room.game.turnId, seq,
      decision.cardId, decision.declaredColor
    );
    if (!result.ok) { fallbackDraw(room, playerId, seq); return; }
    const msg = finalizeAction(room, result, `AI ${playerId} 出牌`);
    if (room.status === "in_game") startSnatchWindow(room, playerId, msg ?? undefined);

  } else if (decision.type === "comboPlay") {
    const result = applyComboPlay(
      room.game, playerId, room.game.turnId, seq,
      decision.wildCardId, decision.targetCardId, decision.declaredColor
    );
    if (!result.ok) { fallbackDraw(room, playerId, seq); return; }
    const msg = finalizeAction(room, result, `AI ${playerId} Wild组合出牌`);
    if (room.status === "in_game") startSnatchWindow(room, playerId, msg ?? undefined);

  } else if (decision.type === "draw") {
    fallbackDraw(room, playerId, seq);

  } else if (decision.type === "pass") {
    const result = applyPassTurn(room.game, playerId, room.game.turnId, seq);
    if (!result.ok) return;
    const msg = finalizeAction(room, result, `AI ${playerId} 承受罚摸`);
    if (room.status === "in_game") startMainTurn(room, msg ?? undefined);

  } else if (decision.type === "useSkill") {
    handleAiSkill(room, playerId, decision.skillId, decision.payload, seq);
  }
}

function fallbackDraw(room: RoomState, playerId: string, seq: number): void {
  if (!room.game) return;
  const result = applyDrawCard(room.game, playerId, room.game.turnId, seq);
  if (!result.ok || !result.drawnCard) return;
  const playable = isCardPlayable(room.game, result.drawnCard);
  startPostDrawWindow(room, playerId, result.drawnCard.id, playable, `AI ${playerId} 摸牌`);
}

function handleAiSkill(
  room: RoomState,
  playerId: string,
  skillId: string,
  payload: unknown,
  _seq: number
): void {
  if (!room.game) return;
  const charId = room.game.characterAssignments?.[playerId];
  if (!charId) return;
  const character = getCharacter(charId);
  const skill = character?.skills.find(s => s.id === skillId);
  if (!skill?.onActivate) return;
  if (!canUseSkill(room.game, playerId, skillId)) return;
  if (skill.canActivate && !skill.canActivate(room.game, playerId)) return;

  const result = skill.onActivate(room.game, playerId, payload);
  if (!result.ok) return;

  if (skill.maxUsesPerGame !== undefined || skill.maxUsesPerTurn !== undefined) {
    consumeSkillUse(room.game, playerId, skillId);
  }

  const msg = finalizeAction(room, result, `AI ${playerId} 发动技能「${skill.name}」`);
  if (room.status === "in_game") broadcastGameState(room, msg ?? undefined, skill.presentationId);
  // After skill, restart turn (skill doesn't consume the turn itself)
  // But some skills might need a different flow; for now just broadcast + continue
}

// ── Snatch window ─────────────────────────────────────────────────────

function handleAiSnatch(roomId: string, token: number, aiPlayerId: string): void {
  const room = roomManager.get(roomId);
  if (!room?.game || room.phaseToken !== token || room.status !== "in_game") return;
  if (room.phase?.phase !== "snatch_window") return;
  if (room.phase.skippedSnatchPlayerIds?.includes(aiPlayerId)) return;

  const decision = decideSnatch(room.game, aiPlayerId);

  if (decision.type === "skipSnatch") {
    markAiSnatchSkipped(room, aiPlayerId);
    return;
  }

  let result;
  if (decision.type === "snatch") {
    result = applySnatchCard(room.game, aiPlayerId, decision.cardId, decision.declaredColor);
  } else if (decision.type === "comboSnatch") {
    result = applyComboSnatch(
      room.game, aiPlayerId,
      decision.wildCardId, decision.targetCardId, decision.declaredColor
    );
  }

  if (!result?.ok) {
    markAiSnatchSkipped(room, aiPlayerId);
    return;
  }

  const msg = finalizeAction(room, result, `AI ${aiPlayerId} 抢牌`);
  if (room.status === "in_game") startSnatchWindow(room, aiPlayerId, msg ?? undefined);
}

function markAiSnatchSkipped(room: RoomState, aiPlayerId: string): void {
  if (!room.phase || room.phase.phase !== "snatch_window") return;
  const skipped = new Set(room.phase.skippedSnatchPlayerIds ?? []);
  skipped.add(aiPlayerId);
  room.phase.skippedSnatchPlayerIds = Array.from(skipped);
  if (!maybeFinishSnatchWindowEarly(room)) {
    broadcastGameState(room);
  }
}

// ── Post draw window ──────────────────────────────────────────────────

function handleAiPostDraw(roomId: string, token: number): void {
  const room = roomManager.get(roomId);
  if (!room?.game || room.phaseToken !== token || room.status !== "in_game") return;
  if (room.phase?.phase !== "post_draw_window" || !room.drawnCardWindow) return;

  const playerId = room.drawnCardWindow.playerId;
  if (!room.aiPlayers.includes(playerId)) return;

  const player = room.game.players[room.game.currentPlayerIndex];
  let seq = player.lastSeq + 1;

  const decision = decidePostDraw(room.game, playerId, room.drawnCardWindow.cardId);

  if (decision.type === "playDrawn" || decision.type === "play") {
    // 摸到可打的牌：检查是否需要喊UNO
    if (player.hand.length === 2) {
      const unoResult = applyCallUno(room.game, playerId, room.game.turnId, seq);
      if (unoResult.ok) seq++;
    }
    const declaredColor =
      decision.type === "play" ? (decision as { declaredColor?: string }).declaredColor as any : undefined;
    const result = applyPlayCard(
      room.game, playerId, room.game.turnId, seq,
      room.drawnCardWindow.cardId, declaredColor
    );
    if (!result.ok) {
      doPass(room, playerId, player.lastSeq + 1);
      return;
    }
    const msg = finalizeAction(room, result, `AI ${playerId} 打出刚摸到的牌`);
    if (room.status === "in_game") startSnatchWindow(room, playerId, msg ?? undefined);
  } else {
    doPass(room, playerId, seq);
  }
}

function doPass(room: RoomState, playerId: string, seq: number): void {
  if (!room.game) return;
  const result = applyPassTurn(room.game, playerId, room.game.turnId, seq);
  if (!result.ok) return;
  const msg = finalizeAction(room, result, `AI ${playerId} 放弃打出摸到的牌`);
  if (room.status === "in_game") startMainTurn(room, msg ?? undefined);
}
