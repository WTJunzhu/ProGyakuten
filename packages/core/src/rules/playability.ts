import type { Card } from "@pro-gyakuten/protocol";
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
    if (top.kind === "wild_draw_four") {
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

  let defaultResult: boolean;
  if (state.drawCardStack > 0) {
    if (top.kind === "wild_draw_four") {
      defaultResult = card.kind === "wild_draw_four";
    } else {
      const isPenaltyCard = card.kind === "draw_two" || card.kind === "wild_draw_four";
      const isTopPenalty = top.kind === "draw_two";
      defaultResult = isPenaltyCard && isTopPenalty && (card.kind === "wild_draw_four" || card.color === top.color);
    }
  } else {
    const isColorMatch = card.color === top.color;
    const isKindMatch = card.kind === top.kind;
    const isValueMatch = card.kind === "number" && top.kind === "number" && card.value === top.value;
    defaultResult = isColorMatch && isKindMatch && (card.kind !== "number" || isValueMatch);
  }

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
