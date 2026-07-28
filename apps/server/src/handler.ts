import {
  applyCallUno,
  applyCheckUno,
  applyComboPlay,
  applyComboSnatch,
  applyDrawCard,
  applyPassTurn,
  applyPlayCard,
  applySnatchCard,
  isCardPlayable,
  getCharacter,
  canUseSkill,
  consumeSkillUse
} from "@pro-gyakuten/core";
import type { ClientEvent } from "@pro-gyakuten/protocol";
import type { RoomState } from "./types.js";
import { playersById, send } from "./state.js";
import { broadcastGameState, finalizeAction } from "./broadcast.js";
import {
  startMainTurn,
  startSnatchWindow,
  startPostDrawWindow,
  maybeFinishSnatchWindowEarly
} from "./phase.js";

function rejectActor(ws: import("ws").WebSocket | undefined, message: string, code: "INVALID_ACTION" | "INVALID_CARD" | "PHASE_RESTRICTED" = "PHASE_RESTRICTED"): void {
  if (ws) send(ws, { type: "actionRejected", code, message });
}

export function handleAction(room: RoomState, event: ClientEvent): void {
  if (!room.game || !room.phase) return;
  if (!("playerId" in event)) return;

  const actorConn = playersById.get(event.playerId);
  const rejectWith = (message: string, code?: "INVALID_ACTION" | "INVALID_CARD" | "PHASE_RESTRICTED") => {
    rejectActor(actorConn?.ws, message, code);
  };

  if (event.type === "checkUno") {
    const result = applyCheckUno(room.game, event.playerId);
    if (!result.ok) {
      rejectWith(result.message ?? "UNO检查失败");
      return;
    }
    broadcastGameState(room, result.announcements?.join(" | "));
    return;
  }

  // callUno 可在任意阶段执行（包括 snatch_window），不受阶段拦截
  if (event.type === "callUno") {
    const result = applyCallUno(room.game, event.playerId, event.turnId, event.seq);
    if (!result.ok) {
      rejectWith(result.message ?? "UNO 失败", result.code === "INVALID_ACTION" ? "INVALID_ACTION" : "INVALID_CARD");
      return;
    }
    broadcastGameState(room, result.announcements?.join(" | "));
    return;
  }

  // ── 技能发动（任意阶段均可，由 canActivate 限制时机）──
  if (event.type === "useSkill") {
    const charId = room.game.characterAssignments?.[event.playerId];
    if (!charId) { rejectWith("你没有角色"); return; }

    const character = getCharacter(charId);
    const skill = character?.skills.find((s) => s.id === event.skillId);
    if (!skill?.onActivate) { rejectWith("技能不存在或不可主动发动"); return; }

    if (!canUseSkill(room.game, event.playerId, event.skillId)) {
      rejectWith("技能次数已用尽"); return;
    }
    if (skill.canActivate && !skill.canActivate(room.game, event.playerId)) {
      rejectWith("当前不满足技能发动条件"); return;
    }

    const result = skill.onActivate(room.game, event.playerId, event.payload);
    if (!result.ok) {
      rejectWith(result.message ?? "技能发动失败", result.code === "INVALID_CARD" ? "INVALID_CARD" : "INVALID_ACTION");
      return;
    }

    // 扣除限次技能的使用次数
    if (skill.maxUsesPerGame !== undefined || skill.maxUsesPerTurn !== undefined) {
      consumeSkillUse(room.game, event.playerId, event.skillId);
    }

    const msg = finalizeAction(room, result, `${event.playerId} 发动技能「${skill.name}」`);
    if (room.status === "in_game") broadcastGameState(room, msg ?? undefined, skill.presentationId);
    return;
  }

  if (event.type === "skipSnatch") {
    if (room.phase.phase !== "snatch_window") {
      rejectWith("当前不是抢牌判定阶段");
      return;
    }

    const skipped = new Set(room.phase.skippedSnatchPlayerIds ?? []);
    skipped.add(event.playerId);
    room.phase.skippedSnatchPlayerIds = Array.from(skipped);

    if (!maybeFinishSnatchWindowEarly(room, `玩家 ${event.playerId} 未抢牌`)) {
      broadcastGameState(room, `玩家 ${event.playerId} 未抢牌`);
    }
    return;
  }

  if (event.type === "snatchCard") {
    if (room.phase.phase !== "snatch_window") {
      rejectWith("当前不是抢牌阶段");
      return;
    }
    if (room.phase.skippedSnatchPlayerIds?.includes(event.playerId)) {
      rejectWith("你已经跳过了这一轮抢牌");
      return;
    }
    const result = applySnatchCard(room.game, event.playerId, event.cardId, event.declaredColor);
    if (!result.ok) {
      rejectWith(result.message ?? "抢牌失败", result.code === "INVALID_CARD" ? "INVALID_CARD" : "INVALID_ACTION");
      return;
    }
    const message = finalizeAction(room, result, `玩家 ${event.playerId} 抢牌成功`);
    if (room.status === "in_game") startSnatchWindow(room, event.playerId, message ?? undefined);
    return;
  }

  if (event.type === "comboPlay" && room.phase.phase === "snatch_window") {
    if (room.phase.skippedSnatchPlayerIds?.includes(event.playerId)) {
      rejectWith("你已经跳过了这一轮抢牌");
      return;
    }
    const result = applyComboSnatch(room.game, event.playerId, event.wildCardId, event.targetCardId, event.declaredColor);
    if (!result.ok) {
      rejectWith(result.message ?? "组合抢牌失败", result.code === "INVALID_CARD" ? "INVALID_CARD" : "INVALID_ACTION");
      return;
    }
    const message = finalizeAction(room, result, `玩家 ${event.playerId} 使用 Wild 组合抢牌成功`);
    if (room.status === "in_game") startSnatchWindow(room, event.playerId, message ?? undefined);
    return;
  }

  if (room.phase.phase === "snatch_window") {
    rejectWith("抢牌判定阶段只能执行抢牌或跳过抢牌");
    return;
  }

  if (room.phase.phase === "post_draw_window") {
    if (!room.drawnCardWindow || room.drawnCardWindow.playerId !== event.playerId) {
      rejectWith("当前是他人的摸牌判定阶段");
      return;
    }

    if (event.type === "playCard") {
      if (event.cardId !== room.drawnCardWindow.cardId) {
        rejectWith("摸牌判定阶段只能打出刚摸到的那张牌");
        return;
      }
      const result = applyPlayCard(room.game, event.playerId, event.turnId, event.seq, event.cardId, event.declaredColor);
      if (!result.ok) {
        rejectWith(result.message ?? "出牌失败", result.code === "INVALID_CARD" ? "INVALID_CARD" : "INVALID_ACTION");
        return;
      }
      const message = finalizeAction(room, result, `玩家 ${event.playerId} 打出了刚摸到的牌`);
      if (room.status === "in_game") startSnatchWindow(room, event.playerId, message ?? undefined);
      return;
    }

    if (event.type === "comboPlay") {
      // wild combo: 刚摸到的牌必须是 wildCardId
      if (event.wildCardId !== room.drawnCardWindow.cardId) {
        rejectWith("摸牌判定阶段的组合出牌中，wild牌必须是刚摸到的那张牌");
        return;
      }
      const result = applyComboPlay(
        room.game,
        event.playerId,
        event.turnId,
        event.seq,
        event.wildCardId,
        event.targetCardId,
        event.declaredColor
      );
      if (!result.ok) {
        rejectWith(result.message ?? "组合出牌失败", result.code === "INVALID_CARD" ? "INVALID_CARD" : "INVALID_ACTION");
        return;
      }
      const message = finalizeAction(room, result, `玩家 ${event.playerId} 使用刚摸到的 Wild 组合出牌`);
      if (room.status === "in_game") startSnatchWindow(room, event.playerId, message ?? undefined);
      return;
    }

    if (event.type === "passTurn") {
      const result = applyPassTurn(room.game, event.playerId, event.turnId, event.seq);
      if (!result.ok) {
        rejectWith(result.message ?? "过牌失败");
        return;
      }
      const message = finalizeAction(room, result, `玩家 ${event.playerId} 放弃打出摸到的牌`);
      if (room.status === "in_game") startMainTurn(room, message ?? undefined);
      return;
    }

    rejectWith("摸牌判定阶段只能打出刚摸到的牌或跳过");
    return;
  }

  if (event.type === "playCard") {
    const result = applyPlayCard(room.game, event.playerId, event.turnId, event.seq, event.cardId, event.declaredColor);
    if (!result.ok) {
      rejectWith(result.message ?? "出牌失败", result.code === "INVALID_CARD" ? "INVALID_CARD" : "INVALID_ACTION");
      return;
    }
    // Record replenish draw events (补牌)
    if (result.replenishCount && result.replenishCount > 0) {
      room.pendingDrawEvents.push({ playerId: event.playerId, count: result.replenishCount, drawnCardIds: [], isReplenish: true });
    }
    const message = finalizeAction(room, result, `玩家 ${event.playerId} 出牌`);
    if (room.status === "in_game") startSnatchWindow(room, event.playerId, message ?? undefined);
    return;
  }

  if (event.type === "comboPlay") {
    const result = applyComboPlay(
      room.game,
      event.playerId,
      event.turnId,
      event.seq,
      event.wildCardId,
      event.targetCardId,
      event.declaredColor
    );
    if (!result.ok) {
      rejectWith(result.message ?? "组合出牌失败");
      return;
    }
    // Record replenish draw events (补牌)
    if (result.replenishCount && result.replenishCount > 0) {
      room.pendingDrawEvents.push({ playerId: event.playerId, count: result.replenishCount, drawnCardIds: [], isReplenish: true });
    }
    const message = finalizeAction(room, result, `玩家 ${event.playerId} 使用 Wild 组合出牌`);
    if (room.status === "in_game") startSnatchWindow(room, event.playerId, message ?? undefined);
    return;
  }

  if (event.type === "drawCard") {
    if (room.game.drawCardStack > 0) {
      rejectWith("当前处于罚摸连锁，请选择接牌或过牌结算");
      return;
    }
    const result = applyDrawCard(room.game, event.playerId, event.turnId, event.seq);
    if (!result.ok || !result.drawnCard) {
      rejectWith(result.message ?? "摸牌失败");
      return;
    }
    // 爆牌判负：摸牌后手牌超限，直接结算
    if (room.game.winnerTeam) {
      finalizeAction(room, result, `玩家 ${event.playerId} 摸牌后手牌超限爆牌`);
      return;
    }
    let playable = isCardPlayable(room.game, result.drawnCard);
    // wild 牌不能单独出，但可以作为 combo 的 wild 牌使用
    if (!playable && result.drawnCard.kind === "wild") {
      const player = room.game.players.find((p) => p.playerId === event.playerId);
      if (player && player.hand.some((c) => c.kind !== "wild" && c.kind !== "wild_draw_four")) {
        playable = true;
      }
    }
    // 记录摸牌事件用于飞行动画
    room.pendingDrawEvents.push({ playerId: event.playerId, count: 1, drawnCardIds: [result.drawnCard.id] });
    startPostDrawWindow(room, event.playerId, result.drawnCard.id, playable, `玩家 ${event.playerId} 摸了一张牌`);
    return;
  }

  if (event.type === "passTurn") {
    if (room.game.drawCardStack <= 0) {
      rejectWith("当前不能直接跳过，请先摸牌");
      return;
    }
    const penaltyCount = room.game.drawCardStack;
    const result = applyPassTurn(room.game, event.playerId, event.turnId, event.seq);
    if (!result.ok) {
      rejectWith(result.message ?? "过牌失败");
      return;
    }
    // 记录罚摸事件用于飞行动画
    room.pendingDrawEvents.push({ playerId: event.playerId, count: penaltyCount, drawnCardIds: [] });
    const message = finalizeAction(room, result, `玩家 ${event.playerId} 选择承受罚摸`);
    if (room.status === "in_game") startMainTurn(room, message ?? undefined);
  }
}
