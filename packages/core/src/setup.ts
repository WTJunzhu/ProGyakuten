import type { Card } from "@pro-gyakuten/protocol";
import { shuffle } from "./engine/state";
import { createGameRules } from "./modifiers/defaults";
import type { CreateGameRulesOptions, GameRules } from "./modifiers/types";
import { COLORS, type GameStateInternal, type PlayerState } from "./types";

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const color of COLORS) {
    for (let i = 1; i <= 9; i += 1) {
      deck.push({ id: randomId(`n${i}`), color, kind: "number", value: i });
      deck.push({ id: randomId(`n${i}`), color, kind: "number", value: i });
    }
  }

  for (let i = 0; i < 6; i += 1) {
    deck.push({ id: randomId("w"), color: "wild", kind: "wild" });
    deck.push({ id: randomId("w4"), color: "wild", kind: "wild_draw_four" });
  }

  for (const color of COLORS) {
    for (let i = 0; i < 2; i += 1) deck.push({ id: randomId("d2"), color, kind: "draw_two" });
    for (let i = 0; i < 3; i += 1) deck.push({ id: randomId("r"), color, kind: "reverse" });
    deck.push({ id: randomId("s"), color, kind: "skip" });
  }

  return deck;
}

function normalizeRules(rulesOrOptions?: GameRules | CreateGameRulesOptions): GameRules {
  if (!rulesOrOptions) return createGameRules();
  if (isGameRules(rulesOrOptions)) {
    return rulesOrOptions;
  }
  return createGameRules(rulesOrOptions);
}

function isGameRules(value: GameRules | CreateGameRulesOptions): value is GameRules {
  return "config" in value && "hooks" in value && Array.isArray(value.hooks) && typeof value.config !== "undefined";
}

export function createGame(roomId: string, playerIds: string[], rulesOrOptions?: GameRules | CreateGameRulesOptions): GameStateInternal {
  const playerCount = playerIds.length;
  if (playerCount !== 2 && playerCount !== 4 && playerCount !== 6) {
    throw new Error("Player count must be 2, 4, or 6 for team mode.");
  }

  const rules = normalizeRules(rulesOrOptions);

  const teamSize = playerCount / 2;
  const initialHandSize = teamSize + 1;
  const teams = {
    teamA: playerIds.filter((_, i) => i % 2 === 0),
    teamB: playerIds.filter((_, i) => i % 2 !== 0)
  };

  let deck = shuffle(createDeck());
  const players: PlayerState[] = playerIds.map((playerId, seat) => ({
    playerId,
    seat,
    hand: [],
    connected: true,
    lastSeq: 0
  }));

  for (const player of players) {
    let dealtCount = 0;
    while (dealtCount < initialHandSize) {
      if (deck.length === 0) throw new Error("Deck exhausted while dealing");
      const card = deck.pop()!;
      if (!rules.config.initialHandsNumbersOnly || card.kind === "number") {
        player.hand.push(card);
        dealtCount += 1;
      } else {
        deck.unshift(card);
        deck = shuffle(deck);
      }
    }
  }

  // 起始顶牌必须是数字牌，跳过所有功能牌和 Wild
  let top = deck.pop();
  while (top && top.kind !== "number") {
    deck.unshift(top);
    deck = shuffle(deck);
    top = deck.pop();
  }
  if (!top) throw new Error("Deck exhausted while starting game");

  const state: GameStateInternal = {
    roomId,
    gameId: randomId("game"),
    turnId: 1,
    currentPlayerIndex: 0,
    direction: 1,
    drawPile: deck,
    discardPile: [top],
    players,
    teams,
    drawCardStack: 0,
    penaltySource: null,
    rules
  };

  return state;
}
