import {
  applyCallUno,
  applyCheckUno,
  applyComboPlay,
  applyComboSnatch,
  applyDrawCard,
  applyPassTurn,
  applyPlayCard,
  applySnatchCard,
  isCardPlayable
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
      rejectWith(result.message ?? "UNO check failed");
      return;
    }
    broadcastGameState(room);
    return;
  }

  if (event.type === "skipSnatch") {
    if (room.phase.phase !== "snatch_window") {
      rejectWith("当前不是抢牌判定阶段");
      return;
    }
    if (event.playerId === room.phase.sourcePlayerId) {
      rejectWith("出牌玩家不能在自己的抢牌阶段点击跳过");
      return;
    }

    const skipped = new Set(room.phase.skippedSnatchPlayerIds ?? []);
    skipped.add(event.playerId);
    room.phase.skippedSnatchPlayerIds = Array.from(skipped);

    if (!maybeFinishSnatchWindowEarly(room, `Player ${event.playerId} skipped snatching.`)) {
      broadcastGameState(room, `Player ${event.playerId} skipped snatching.`);
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

  if (event.type === "callUno") {
    const result = applyCallUno(room.game, event.playerId, event.turnId, event.seq);
    if (!result.ok) {
      rejectWith(result.message ?? "UNO 失败", result.code === "INVALID_ACTION" ? "INVALID_ACTION" : "INVALID_CARD");
      return;
    }
    broadcastGameState(room, result.announcements?.join(" | "));
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
    const playable = isCardPlayable(room.game, result.drawnCard);
    startPostDrawWindow(room, event.playerId, result.drawnCard.id, playable, `玩家 ${event.playerId} 摸了一张牌`);
    return;
  }

  if (event.type === "passTurn") {
    if (room.game.drawCardStack <= 0) {
      rejectWith("当前不能直接跳过，请先摸牌");
      return;
    }
    const result = applyPassTurn(room.game, event.playerId, event.turnId, event.seq);
    if (!result.ok) {
      rejectWith(result.message ?? "过牌失败");
      return;
    }
    const message = finalizeAction(room, result, `玩家 ${event.playerId} 选择承受罚摸`);
    if (room.status === "in_game") startMainTurn(room, message ?? undefined);
  }
}
