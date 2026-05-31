import { applyRuleHooks } from "../../engine/state";
import type { PlayedCardEffectContext } from "./shared";

export function applySkipEffect({ state, player, card, previousCard }: PlayedCardEffectContext): void {
  if (!previousCard) return;
  const targetIndex = (state.currentPlayerIndex + state.direction + state.players.length) % state.players.length;
  const targetPlayer = state.players[targetIndex];
  state.skipConstraint = {
    targetPlayerId: targetPlayer.playerId,
    requiredKind: previousCard.kind,
    ...(typeof previousCard.value === "number" ? { requiredValue: previousCard.value } : {})
  };
  applyRuleHooks(state.rules.hooks, (hook) => {
    hook.onSkipConstraintSet?.({ state, sourcePlayer: player, targetPlayer, card });
    return undefined;
  });
}
