import type { Card, CardColor, GamePublicState, PlayerPublicState } from "@pro-gyakuten/protocol";
import type { GameRuleHookSet } from "../modifiers/types.js";
import { COLORS, type ActionResult, type GameStateInternal, type PlayerState } from "../types.js";

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createDeckCard(color: CardColor, kind: Card["kind"], value?: number): Card {
  const prefix =
    kind === "number"
      ? `n${value ?? "x"}`
      : kind === "draw_two"
        ? "d2"
        : kind === "reverse"
          ? "r"
          : kind === "skip"
            ? "s"
            : kind === "wild_draw_four"
              ? "w4"
              : "w";
  return { id: randomId(prefix), color, kind, ...(typeof value === "number" ? { value } : {}) };
}

function createFullDeck(): Card[] {
  const deck: Card[] = [];
  for (const color of COLORS) {
    for (let i = 1; i <= 9; i += 1) {
      deck.push(createDeckCard(color, "number", i));
      deck.push(createDeckCard(color, "number", i));
    }
  }

  for (let i = 0; i < 6; i += 1) {
    deck.push(createDeckCard("wild", "wild"));
    deck.push(createDeckCard("wild", "wild_draw_four"));
  }

  for (const color of COLORS) {
    for (let i = 0; i < 2; i += 1) deck.push(createDeckCard(color, "draw_two"));
    for (let i = 0; i < 3; i += 1) deck.push(createDeckCard(color, "reverse"));
    deck.push(createDeckCard(color, "skip"));
  }

  return deck;
}

export function effectiveTopCard(state: GameStateInternal): Card {
  const top = state.discardPile[state.discardPile.length - 1];
  return state.wildBridge ? ({ ...top, ...state.wildBridge } as Card) : top;
}

export function nextIndex(state: GameStateInternal, from = state.currentPlayerIndex): number {
  return (state.players.length + from + state.direction) % state.players.length;
}

export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = 0; i < out.length - 1; i += 1) {
    const r = i + Math.floor(Math.random() * (out.length - i));
    [out[i], out[r]] = [out[r], out[i]];
  }
  return out;
}

export function ensureDrawPile(state: GameStateInternal): void {
  if (state.drawPile.length > 0) return;
  state.drawPile = shuffle(createFullDeck());
}

export function drawOne(state: GameStateInternal, player: PlayerState): Card {
  ensureDrawPile(state);
  const card = state.drawPile.pop();
  if (!card) throw new Error("No cards left to draw");
  if (player.hand.length >= state.rules.config.maxHandSize) {
    player.hand.shift();
  }
  player.hand.push(card);
  if (player.hand.length !== 1) {
    player.missedUnoPending = false;
  }
  applyRuleHooks(state.rules.hooks, (hook) => {
    hook.afterCardDrawn?.({ state, player, card });
    return undefined;
  });
  return card;
}

export function matchesSkipConstraint(state: GameStateInternal, playerId: string, card: Card): boolean {
  const constraint = state.skipConstraint;
  if (!constraint || constraint.targetPlayerId !== playerId) return false;
  if (card.kind === "wild_draw_four") return true;
  if (card.kind !== constraint.requiredKind) return false;
  if (card.kind === "number") {
    return card.value === constraint.requiredValue;
  }
  return true;
}

export function clearSkipConstraintIfConsumed(state: GameStateInternal, playerId: string): void {
  if (state.skipConstraint?.targetPlayerId === playerId) {
    state.skipConstraint = undefined;
  }
}

export function alignTurnToSkipConstraint(state: GameStateInternal): void {
  const targetPlayerId = state.skipConstraint?.targetPlayerId;
  if (!targetPlayerId) return;
  const targetIndex = state.players.findIndex((player) => player.playerId === targetPlayerId);
  if (targetIndex >= 0) {
    state.currentPlayerIndex = targetIndex;
  }
}

export function advanceTurn(state: GameStateInternal, skipSteps = 1): void {
  let idx = state.currentPlayerIndex;
  for (let i = 0; i < skipSteps; i += 1) {
    idx = nextIndex(state, idx);
  }
  state.currentPlayerIndex = idx;
  state.turnId += 1;
}

export function validateCommon(state: GameStateInternal, playerId: string, turnId: number, seq: number): ActionResult {
  const current = state.players[state.currentPlayerIndex];
  if (current.playerId !== playerId) return { ok: false, code: "NOT_YOUR_TURN", message: "Not your turn" };
  if (state.turnId !== turnId) return { ok: false, code: "TURN_MISMATCH", message: "Turn mismatch" };
  if (seq <= current.lastSeq) return { ok: false, code: "SEQ_MISMATCH", message: "Sequence mismatch" };
  current.lastSeq = seq;
  return { ok: true };
}

export function validatePlayerSeq(state: GameStateInternal, playerId: string, seq: number): ActionResult & { player?: PlayerState } {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) return { ok: false, code: "INVALID_ACTION", message: "Player not found" };
  if (seq <= player.lastSeq) return { ok: false, code: "SEQ_MISMATCH", message: "Sequence mismatch" };
  player.lastSeq = seq;
  return { ok: true, player };
}

export function replenishPlayerHand(state: GameStateInternal, player: PlayerState): Card[] {
  const newCards: Card[] = [];
  while (player.hand.length > 0 && !player.hand.some((card) => card.kind === "number")) {
    newCards.push(drawOne(state, player));
  }
  return newCards;
}

export function finishPlay(state: GameStateInternal, player: PlayerState, announcements: string[]): ActionResult {
  if (player.hand.length === 0) {
    state.winnerTeam = state.teams.teamA.includes(player.playerId) ? "teamA" : "teamB";
    return { ok: true, announcements };
  }

  replenishPlayerHand(state, player);
  return { ok: true, announcements };
}

export function markUnoStateAfterPlay(state: GameStateInternal, player: PlayerState): void {
  if (player.hand.length === 1) {
    player.missedUnoPending = player.saidUnoForTurnId !== state.turnId;
  } else {
    player.missedUnoPending = false;
  }
}

export function applyUnoCheck(state: GameStateInternal, checker: PlayerState): string[] {
  const vulnerablePlayers = state.players.filter((player) => player.missedUnoPending && player.hand.length === 1);
  const announcements: string[] = [];
  if (vulnerablePlayers.length > 0) {
    for (const player of vulnerablePlayers) {
      const defaultAnnouncements = [`Player ${player.playerId} was caught not calling UNO and draws 2 cards.`];
      const hookAnnouncements = applyRuleHooks(state.rules.hooks, (hook) =>
        hook.resolveUnoPenalty?.({ state, player }, defaultAnnouncements)
      );
      drawOne(state, player);
      drawOne(state, player);
      player.missedUnoPending = false;
      announcements.push(...(hookAnnouncements ?? defaultAnnouncements));
    }
    return announcements;
  }

  const defaultAnnouncements = [`Player ${checker.playerId} made a false UNO check and draws 2 cards.`];
  const hookAnnouncements = applyRuleHooks(state.rules.hooks, (hook) =>
    hook.resolveUnoPenalty?.({ state, player: checker }, defaultAnnouncements)
  );
  drawOne(state, checker);
  drawOne(state, checker);
  announcements.push(...(hookAnnouncements ?? defaultAnnouncements));
  return announcements;
}

export function toPublicState(state: GameStateInternal): GamePublicState {
  const players: PlayerPublicState[] = state.players.map((player) => ({
    playerId: player.playerId,
    seat: player.seat,
    handCount: player.hand.length,
    connected: player.connected
  }));

  return {
    roomId: state.roomId,
    gameId: state.gameId,
    turnId: state.turnId,
    currentPlayerId: state.players[state.currentPlayerIndex].playerId,
    direction: state.direction,
    topCard: state.discardPile[state.discardPile.length - 1],
    previousTopCard:
      state.discardPile.length > 1 ? state.discardPile[state.discardPile.length - 2] : undefined,
    players,
    drawPileCount: state.drawPile.length,
    teams: state.teams,
    winnerTeam: state.winnerTeam,
    drawCardStack: state.drawCardStack,
    penaltySourceKind: state.penaltySource ?? undefined,
    skipConstraint: state.skipConstraint
  } as GamePublicState;
}

export function getPlayerHand(state: GameStateInternal, playerId: string): Card[] {
  const player = state.players.find((entry) => entry.playerId === playerId);
  return player ? [...player.hand] : [];
}

export function applyRuleHooks<T>(hooks: GameRuleHookSet[], resolver: (hook: GameRuleHookSet) => T | undefined): T | undefined {
  let resolved: T | undefined;
  for (const hook of hooks) {
    const next = resolver(hook);
    if (typeof next !== "undefined") {
      resolved = next;
    }
  }
  return resolved;
}

export function applyAfterTurnStart(state: GameStateInternal): void {
  const player = state.players[state.currentPlayerIndex];
  applyRuleHooks(state.rules.hooks, (hook) => {
    hook.afterTurnStart?.({ state, player });
    return undefined;
  });
}
