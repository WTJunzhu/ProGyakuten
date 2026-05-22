import type { Card, CardColor } from "@pro-gyakuten/protocol";
import {
  advanceTurn,
  clearSkipConstraintIfConsumed,
  applyRuleHooks,
  applyUnoCheck,
  drawOne,
  finishPlay,
  markUnoStateAfterPlay,
  effectiveTopCard,
  validateCommon,
  validatePlayerSeq
} from "./engine/state";
import { playedCardEffects } from "./rules/cards/registry";
import { isCardPlayable, isCardSnatchable, isComboPlayable, isExactSnatchMatch } from "./rules/playability";
import type { ActionResult, GameStateInternal } from "./types";

export function applyPlayCard(
  state: GameStateInternal,
  playerId: string,
  turnId: number,
  seq: number,
  cardId: string,
  declaredColor?: Exclude<CardColor, "wild">
): ActionResult {
  const common = validateCommon(state, playerId, turnId, seq);
  if (!common.ok) return common;

  const player = state.players[state.currentPlayerIndex];
  const cardIndex = player.hand.findIndex((card) => card.id === cardId);
  if (cardIndex === -1) return { ok: false, code: "INVALID_CARD", message: "Card not in hand" };

  const card = player.hand[cardIndex];
  if (card.kind === "wild") {
    return { ok: false, code: "INVALID_CARD", message: "Wild must be played with another non-wild card" };
  }
  if (!isCardPlayable(state, card)) {
    return { ok: false, code: "INVALID_CARD", message: "Card does not match top card" };
  }

  const previousCard = effectiveTopCard(state);
  player.hand.splice(cardIndex, 1);
  const playedCard = { ...card };
  if (declaredColor) playedCard.color = declaredColor;
  state.discardPile.push(playedCard);
  state.wildBridge = undefined;

  playedCardEffects[card.kind]({ state, player, playerId, card: playedCard, previousCard });
  applyRuleHooks(state.rules.hooks, (hook) => {
    hook.afterCardPlayed?.({ state, player, card: playedCard });
    return undefined;
  });
  markUnoStateAfterPlay(state, player);
  clearSkipConstraintIfConsumed(state, playerId);

  const result = finishPlay(state, player, []);
  if (!result.ok || state.winnerTeam) return result;

  advanceTurn(state, 1);
  return result;
}

export function applySnatchCard(
  state: GameStateInternal,
  playerId: string,
  cardId: string,
  declaredColor?: Exclude<CardColor, "wild">
): ActionResult {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) return { ok: false, code: "INVALID_ACTION", message: "Player not found" };

  const cardIndex = player.hand.findIndex((card) => card.id === cardId);
  if (cardIndex === -1) return { ok: false, code: "INVALID_CARD", message: "Card not in hand" };

  const card = player.hand[cardIndex];
  if (!isCardSnatchable(state, card)) {
    return { ok: false, code: "INVALID_CARD", message: "Invalid snatch attempt" };
  }

  const previousCard = effectiveTopCard(state);
  player.hand.splice(cardIndex, 1);
  const playedCard = { ...card };
  if (card.kind === "wild_draw_four") {
    if (!declaredColor) {
      return { ok: false, code: "INVALID_ACTION", message: "Wild Draw Four snatch requires choosing a color" };
    }
    playedCard.color = declaredColor;
  }
  state.discardPile.push(playedCard);
  state.wildBridge = undefined;

  playedCardEffects[card.kind]({ state, player, playerId, card: playedCard, previousCard });
  applyRuleHooks(state.rules.hooks, (hook) => {
    hook.afterCardSnatched?.({ state, player, card: playedCard });
    return undefined;
  });
  markUnoStateAfterPlay(state, player);
  clearSkipConstraintIfConsumed(state, playerId);

  const result = finishPlay(state, player, []);
  if (!result.ok || state.winnerTeam) return result;

  state.currentPlayerIndex = player.seat;
  advanceTurn(state, 1);
  return result;
}

export function applyComboPlay(
  state: GameStateInternal,
  playerId: string,
  turnId: number,
  seq: number,
  wildCardId: string,
  targetCardId: string,
  declaredColor: Exclude<CardColor, "wild">
): ActionResult {
  const common = validateCommon(state, playerId, turnId, seq);
  if (!common.ok) return common;

  const player = state.players[state.currentPlayerIndex];
  const wildIdx = player.hand.findIndex((card) => card.id === wildCardId && card.kind === "wild");
  const targetIdx = player.hand.findIndex((card) => card.id === targetCardId);

  if (wildIdx === -1 || targetIdx === -1 || wildIdx === targetIdx) {
    return { ok: false, code: "INVALID_CARD", message: "Invalid cards for combo" };
  }

  const targetCard = player.hand[targetIdx];
  if (targetCard.kind === "wild" || targetCard.kind === "wild_draw_four") {
    return { ok: false, code: "INVALID_CARD", message: "Wild can only be combined with a non-wild card" };
  }

  const transformedCard: Card = { ...targetCard, color: declaredColor };
  if (!isComboPlayable(state, transformedCard)) {
    return { ok: false, code: "INVALID_CARD", message: "Combined card does not match top card" };
  }

  const previousCard = effectiveTopCard(state);
  const [higher, lower] = wildIdx > targetIdx ? [wildIdx, targetIdx] : [targetIdx, wildIdx];
  player.hand.splice(higher, 1);
  player.hand.splice(lower, 1);

  state.discardPile.push({ id: `${wildCardId}_combo`, color: "wild", kind: "wild" });
  state.discardPile.push(transformedCard);
  state.wildBridge = undefined;
  playedCardEffects[transformedCard.kind]({ state, player, playerId, card: transformedCard, previousCard });
  applyRuleHooks(state.rules.hooks, (hook) => {
    hook.afterCardPlayed?.({ state, player, card: transformedCard });
    return undefined;
  });
  markUnoStateAfterPlay(state, player);
  clearSkipConstraintIfConsumed(state, playerId);

  const result = finishPlay(state, player, []);
  if (!result.ok || state.winnerTeam) return result;

  advanceTurn(state, 1);
  return result;
}

export function applyComboSnatch(
  state: GameStateInternal,
  playerId: string,
  wildCardId: string,
  targetCardId: string,
  declaredColor: Exclude<CardColor, "wild">
): ActionResult {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) return { ok: false, code: "INVALID_ACTION", message: "Player not found" };

  const wildIdx = player.hand.findIndex((card) => card.id === wildCardId && card.kind === "wild");
  const targetIdx = player.hand.findIndex((card) => card.id === targetCardId);
  if (wildIdx === -1 || targetIdx === -1 || wildIdx === targetIdx) {
    return { ok: false, code: "INVALID_CARD", message: "Invalid cards for combo snatch" };
  }

  const targetCard = player.hand[targetIdx];
  if (targetCard.kind === "wild" || targetCard.kind === "wild_draw_four") {
    return { ok: false, code: "INVALID_CARD", message: "Wild can only be combined with a non-wild card" };
  }

  const transformedCard: Card = { ...targetCard, color: declaredColor };
  if (!isExactSnatchMatch(state, transformedCard)) {
    return { ok: false, code: "INVALID_CARD", message: "Combined snatch card must exactly match the top card" };
  }

  const previousCard = effectiveTopCard(state);
  const [higher, lower] = wildIdx > targetIdx ? [wildIdx, targetIdx] : [targetIdx, wildIdx];
  player.hand.splice(higher, 1);
  player.hand.splice(lower, 1);

  state.discardPile.push({ id: `${wildCardId}_combo`, color: "wild", kind: "wild" });
  state.discardPile.push(transformedCard);
  state.wildBridge = undefined;
  playedCardEffects[transformedCard.kind]({ state, player, playerId, card: transformedCard, previousCard });
  applyRuleHooks(state.rules.hooks, (hook) => {
    hook.afterCardSnatched?.({ state, player, card: transformedCard });
    return undefined;
  });
  markUnoStateAfterPlay(state, player);
  clearSkipConstraintIfConsumed(state, playerId);

  const result = finishPlay(state, player, []);
  if (!result.ok || state.winnerTeam) return result;

  state.currentPlayerIndex = player.seat;
  advanceTurn(state, 1);
  return result;
}

export function applyDrawCard(
  state: GameStateInternal,
  playerId: string,
  turnId: number,
  seq: number
): ActionResult {
  const common = validateCommon(state, playerId, turnId, seq);
  if (!common.ok) return common;
  const player = state.players[state.currentPlayerIndex];
  const drawnCard = drawOne(state, player);
  return { ok: true, drawnCard };
}

export function applyPassTurn(
  state: GameStateInternal,
  playerId: string,
  turnId: number,
  seq: number
): ActionResult {
  const common = validateCommon(state, playerId, turnId, seq);
  if (!common.ok) return common;

  const player = state.players[state.currentPlayerIndex];
  const announcements: string[] = [];

  if (state.drawCardStack > 0) {
    for (let i = 0; i < state.drawCardStack; i += 1) {
      drawOne(state, player);
    }
    announcements.push(`Player ${player.playerId} draws ${state.drawCardStack} penalty cards.`);
    state.drawCardStack = 0;
    state.penaltySource = null;
  }

  clearSkipConstraintIfConsumed(state, playerId);
  advanceTurn(state, 1);
  return { ok: true, announcements };
}

export function applyCallUno(
  state: GameStateInternal,
  playerId: string,
  _turnId: number,
  seq: number
): ActionResult {
  const validated = validatePlayerSeq(state, playerId, seq);
  if (!validated.ok || !validated.player) return validated;

  const player = validated.player;
  const isCurrentPlayer = state.players[state.currentPlayerIndex].playerId === playerId;
  const canCallBeforePlay = isCurrentPlayer && player.hand.length === 2;
  const canRecoverMissedUno = player.hand.length === 1 && !!player.missedUnoPending;

  if (!canCallBeforePlay && !canRecoverMissedUno) {
    return { ok: false, code: "INVALID_ACTION", message: "UNO cannot be called right now" };
  }

  player.saidUnoForTurnId = state.turnId;
  player.missedUnoPending = false;
  return { ok: true };
}

export function applyCheckUno(state: GameStateInternal, playerId: string): ActionResult {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) return { ok: false, code: "INVALID_ACTION", message: "Player not found" };
  const announcements = applyUnoCheck(state, player);
  return { ok: true, announcements };
}
