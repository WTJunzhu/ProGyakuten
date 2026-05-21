import type { PlayedCardEffectContext } from "./shared";

export function applySkipEffect({ state, previousCard }: PlayedCardEffectContext): void {
  if (!previousCard) return;
  const targetPlayerId = state.players[(state.currentPlayerIndex + state.direction + state.players.length) % state.players.length].playerId;
  state.skipConstraint = {
    targetPlayerId,
    requiredKind: previousCard.kind,
    ...(typeof previousCard.value === "number" ? { requiredValue: previousCard.value } : {})
  };
}
