import type { Card, CardKind, GamePublicState } from "@pro-gyakuten/protocol";
import { applyRuleHooks, effectiveTopCard, matchesSkipConstraint } from "../engine/state";
import { COLORS, type GameStateInternal } from "../types";

function getDefaultPlayableResult(state: GameStateInternal, card: Card, allowWildSingle = true): boolean {
  const top = state.discardPile[state.discardPile.length - 1];
  const effectiveTop = effectiveTopCard(state);
  const currentPlayerId = state.players[state.currentPlayerIndex].playerId;

  if (state.skipConstraint?.targetPlayerId === currentPlayerId) {
    return matchesSkipConstraint(state, currentPlayerId, card);
  }

  let defaultResult: boolean;
  if (state.drawCardStack > 0) {
    if (state.penaltySource === "wild_draw_four") {
      defaultResult = card.kind === "wild_draw_four" || (card.kind === "reverse" && card.color === top.color);
    } else {
      defaultResult =
        card.kind === "draw_two" ||
        card.kind === "wild_draw_four" ||
        (card.kind === "reverse" && card.color === top.color);
    }
  } else if ((allowWildSingle && card.kind === "wild") || card.kind === "wild_draw_four") {
    defaultResult = true;
  } else if (card.color !== "wild" && effectiveTop.color !== "wild" && card.color === effectiveTop.color) {
    defaultResult = true;
  } else if (card.kind === "number" && effectiveTop.kind === "number" && card.value === effectiveTop.value) {
    defaultResult = true;
  } else if (card.kind === "number" || effectiveTop.kind === "number") {
    defaultResult = false;
  } else {
    defaultResult = card.kind === effectiveTop.kind;
  }

  return defaultResult;
}

export function isCardPlayable(state: GameStateInternal, card: Card): boolean {
  const defaultResult = getDefaultPlayableResult(state, card, false);

  return applyRuleHooks(state.rules.hooks, (hook) =>
    hook.canPlayCard?.({ state, player: state.players[state.currentPlayerIndex], card }, defaultResult)
  ) ?? defaultResult;
}

export function isComboPlayable(state: GameStateInternal, card: Card): boolean {
  return getDefaultPlayableResult(state, card, false);
}

export function isExactSnatchMatch(state: GameStateInternal, card: Card): boolean {
  const top = state.discardPile[state.discardPile.length - 1];
  if (card.color !== top.color || card.kind !== top.kind) return false;
  if (card.kind === "number" && top.kind === "number") {
    return card.value === top.value;
  }
  return true;
}

export function isCardSnatchable(state: GameStateInternal, card: Card): boolean {
  if (!state.rules.config.allowSnatch) return false;
  const top = state.discardPile[state.discardPile.length - 1];

  const isColorMatch = card.color === top.color;
  const isKindMatch = card.kind === top.kind;
  const isValueMatch = card.kind === "number" && top.kind === "number" && card.value === top.value;
  const defaultResult = isColorMatch && isKindMatch && (card.kind !== "number" || isValueMatch);

  const player = state.players.find((entry) => entry.hand.some((handCard) => handCard.id === card.id)) ?? state.players[state.currentPlayerIndex];
  return applyRuleHooks(state.rules.hooks, (hook) => hook.canSnatchCard?.({ state, player, card }, defaultResult)) ?? defaultResult;
}

export function hasWildComboSnatchOption(state: GameStateInternal, hand: Card[]): boolean {
  const hasWild = hand.some((card) => card.kind === "wild");
  if (!hasWild) return false;

  const candidates = hand.filter((card) => card.kind !== "wild" && card.kind !== "wild_draw_four");
  for (const candidate of candidates) {
    for (const color of COLORS) {
      if (isExactSnatchMatch(state, { ...candidate, color })) {
        return true;
      }
    }
  }
  return false;
}

// --- Public-state adapters (for client use without GameStateInternal) ---

export function matchesSkipConstraintLite(params: {
  card: Card;
  skipConstraint?: GamePublicState["skipConstraint"];
  playerId: string;
}): boolean {
  const { card, skipConstraint, playerId } = params;
  if (!skipConstraint || skipConstraint.targetPlayerId !== playerId) return false;
  if (card.kind === "wild_draw_four") return true;
  if (card.kind !== skipConstraint.requiredKind) return false;
  if (card.kind === "number") return card.value === skipConstraint.requiredValue;
  return true;
}

export function isCardPlayableLite(params: {
  card: Card;
  topCard: Card;
  drawCardStack: number;
  penaltySourceKind?: CardKind;
  skipConstraint?: GamePublicState["skipConstraint"];
  currentPlayerId: string;
  playerId: string;
}): boolean {
  const { card, topCard, drawCardStack, penaltySourceKind, skipConstraint, currentPlayerId, playerId } = params;
  if (currentPlayerId !== playerId) return false;

  if (skipConstraint?.targetPlayerId === playerId) {
    return matchesSkipConstraintLite({ card, skipConstraint, playerId });
  }

  const top = topCard;
  if (drawCardStack > 0) {
    if (penaltySourceKind === "wild_draw_four") {
      return card.kind === "wild_draw_four" || (card.kind === "reverse" && card.color === top.color);
    }
    return card.kind === "draw_two" || card.kind === "wild_draw_four" || (card.kind === "reverse" && card.color === top.color);
  }
  if (card.kind === "wild") return false;
  if (card.kind === "wild_draw_four") return true;
  if (top.color !== "wild" && card.color === top.color) return true;
  if (card.kind === "number" && top.kind === "number" && card.value === top.value) return true;
  if (card.kind === "number" || top.kind === "number") return false;
  return card.kind === top.kind;
}

export function isCardSnatchableLite(params: {
  card: Card;
  topCard: Card;
  drawCardStack: number;
}): boolean {
  const { card, topCard } = params;
  const top = topCard;

  const isColorMatch = card.color === top.color;
  const isKindMatch = card.kind === top.kind;
  const isValueMatch = card.kind === "number" && top.kind === "number" && card.value === top.value;
  return isColorMatch && isKindMatch && (card.kind !== "number" || isValueMatch);
}
