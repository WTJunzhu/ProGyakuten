import type { AllowedAction } from "@pro-gyakuten/protocol";
import { getPlayerHand, isCardSnatchable, hasWildComboSnatchOption, getCharacter, canUseSkill } from "@pro-gyakuten/core";
import type { RoomState } from "./types.js";

export function getAllowedActions(room: RoomState, playerId: string): AllowedAction[] {
  if (!room.game || !room.phase) return [];
  const actions: AllowedAction[] = ["check_uno"];
  const { phase } = room.phase;
  const currentPlayerId = room.game.players[room.game.currentPlayerIndex].playerId;
  const player = room.game.players.find((entry) => entry.playerId === playerId);

  if (player?.missedUnoPending && player.hand.length === 1) {
    actions.push("callUno");
  }

  // 技能可用时随时加入（任意阶段）
  const charId = room.game.characterAssignments?.[playerId];
  if (charId) {
    const character = getCharacter(charId);
    if (character) {
      const hasActivatable = character.skills.some(
        (skill) =>
          skill.onActivate &&
          canUseSkill(room.game!, playerId, skill.id) &&
          (skill.canActivate ? skill.canActivate(room.game!, playerId) : false)
      );
      if (hasActivatable) actions.push("use_skill");
    }
  }

  if (phase === "turn_main") {
    if (playerId !== currentPlayerId) return actions;
    if (!actions.includes("callUno")) actions.push("callUno");
    if (room.game.drawCardStack > 0) {
      actions.push("play", "pass");
    } else {
      actions.push("play", "draw");
    }
    return actions;
  }

  if (phase === "snatch_window") {
    const skipped = room.phase.skippedSnatchPlayerIds?.includes(playerId) ?? false;
    if (!skipped) {
      actions.push("skip_snatch");
    }
    if (!skipped && canPlayerSnatch(room, playerId)) {
      actions.push("snatch");
    }
    return actions;
  }

  if (phase === "post_draw_window" && room.drawnCardWindow?.playerId === playerId) {
    if (room.drawnCardWindow.playable) {
      actions.push("play_drawn", "pass");
    } else {
      actions.push("pass");
    }
    return actions;
  }

  return actions;
}

export function canPlayerSnatch(room: RoomState, playerId: string): boolean {
  if (!room.game || !room.phase || room.phase.phase !== "snatch_window") return false;
  const hand = getPlayerHand(room.game, playerId);
  return hand.some((card) => isCardSnatchable(room.game!, card)) || hasWildComboSnatchOption(room.game, hand);
}

export function getSnatchResponders(room: RoomState): string[] {
  if (!room.phase || room.phase.phase !== "snatch_window") return [];
  return [...room.players];
}
