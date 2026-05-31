import type { Card, CardColor } from "@pro-gyakuten/protocol";
import {
  isCardPlayable,
  isCardSnatchable,
  hasWildComboSnatchOption,
  isExactSnatchMatch,
  matchesSkipConstraint,
  getPlayerHand,
  getCharacter,
  canUseSkill
} from "@pro-gyakuten/core";
import type { GameStateInternal } from "@pro-gyakuten/core";
import type { AiDecision } from "./types.js";

type NonWildColor = Exclude<CardColor, "wild">;
const COLORS: NonWildColor[] = ["red", "yellow", "blue", "green"];

// ── 工具函数 ──────────────────────────────────────────────────────────

function pickBestColor(hand: Card[]): NonWildColor {
  const counts: Record<string, number> = { red: 0, yellow: 0, blue: 0, green: 0 };
  for (const c of hand) {
    if (c.color !== "wild" && c.color in counts) counts[c.color]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return (best?.[0] ?? "red") as NonWildColor;
}

function getEnemyTeam(state: GameStateInternal, playerId: string): string[] {
  return state.teams.teamA.includes(playerId) ? state.teams.teamB : state.teams.teamA;
}

function enemyHasOneCard(state: GameStateInternal, playerId: string): boolean {
  const enemies = getEnemyTeam(state, playerId);
  return state.players.some(p => enemies.includes(p.playerId) && p.hand.length === 1);
}

/** 出牌价值分：越高越优先打出 */
function cardScore(card: Card, hasEnemyOneCard: boolean): number {
  if (card.kind === "wild_draw_four") return hasEnemyOneCard ? 100 : 55;
  if (card.kind === "draw_two")       return hasEnemyOneCard ? 90  : 45;
  if (card.kind === "skip")           return hasEnemyOneCard ? 80  : 38;
  if (card.kind === "reverse")        return 25;
  return 10; // 数字牌
}

function getPlayable(state: GameStateInternal, hand: Card[]): Card[] {
  return hand.filter(c => c.kind !== "wild" && isCardPlayable(state, c));
}

/** 查找最佳 Wild 组合出牌 */
function findWildCombo(
  state: GameStateInternal,
  hand: Card[]
): { wildCardId: string; targetCardId: string; declaredColor: NonWildColor } | null {
  const wild = hand.find(c => c.kind === "wild");
  if (!wild) return null;

  const candidates = hand.filter(c => c.kind !== "wild" && c.kind !== "wild_draw_four");
  for (const candidate of candidates) {
    for (const color of COLORS) {
      const transformed: Card = { ...candidate, color };
      if (isCardPlayable(state, transformed)) {
        return { wildCardId: wild.id, targetCardId: candidate.id, declaredColor: color };
      }
    }
  }
  return null;
}

// ── 技能发动判断 ──────────────────────────────────────────────────────

function decideSkillUse(state: GameStateInternal, playerId: string): AiDecision | null {
  const charId = state.characterAssignments?.[playerId];
  if (!charId) return null;
  const character = getCharacter(charId);
  if (!character) return null;

  for (const skill of character.skills) {
    if (!skill.onActivate || !skill.canActivate) continue;
    if (!canUseSkill(state, playerId, skill.id)) continue;
    if (!skill.canActivate(state, playerId)) continue;

    const payload = buildSkillPayload(state, playerId, skill.id);
    if (payload === undefined) continue;
    return { type: "useSkill", skillId: skill.id, payload };
  }
  return null;
}

function buildSkillPayload(
  state: GameStateInternal,
  playerId: string,
  skillId: string
): unknown {
  switch (skillId) {
    case "divine_judgment": {
      const enemies = getEnemyTeam(state, playerId);
      const target = state.players.find(
        p => enemies.includes(p.playerId) && p.hand.length === 1
      );
      return target ? { targetPlayerId: target.playerId } : undefined;
    }
    case "chain_reduction": {
      const player = state.players.find(p => p.playerId === playerId);
      const numbers = (player?.hand ?? []).filter(
        c => c.kind === "number" && typeof c.value === "number"
      );
      if (numbers.length === 0) return undefined;
      const best = numbers.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
      return { cardId: best.id };
    }
    case "seven_color_blade": {
      const player = state.players.find(p => p.playerId === playerId);
      const recolorable = (player?.hand ?? []).filter(
        c => c.kind !== "wild" && c.kind !== "wild_draw_four"
      );
      if (recolorable.length === 0) return undefined;
      return { cardId: recolorable[0].id, newColor: pickBestColor(player!.hand) };
    }
    default:
      return {};
  }
}

// ── 主回合决策 ────────────────────────────────────────────────────────

export function decideMainTurn(
  state: GameStateInternal,
  playerId: string
): AiDecision {
  const player = state.players.find(p => p.playerId === playerId)!;
  const hand = player.hand;

  // 技能优先（如御琴羽 drawCardStack≥10 时）
  const skill = decideSkillUse(state, playerId);
  if (skill) return skill;

  // 罚摸连锁
  if (state.drawCardStack > 0) {
    return decidePenaltyChain(state, hand);
  }

  // Skip 约束
  if (state.skipConstraint?.targetPlayerId === playerId) {
    return decideSkipConstrained(state, playerId, hand);
  }

  return decideNormalTurn(state, hand);
}

function decidePenaltyChain(state: GameStateInternal, hand: Card[]): AiDecision {
  const wild4 = hand.find(c => c.kind === "wild_draw_four");
  if (wild4) return { type: "play", cardId: wild4.id, declaredColor: pickBestColor(hand) };

  const playable = getPlayable(state, hand);

  const drawTwo = playable.find(c => c.kind === "draw_two");
  if (drawTwo) return { type: "play", cardId: drawTwo.id };

  const reverse = playable.find(c => c.kind === "reverse");
  if (reverse) return { type: "play", cardId: reverse.id };

  return { type: "pass" };
}

function decideSkipConstrained(
  state: GameStateInternal,
  playerId: string,
  hand: Card[]
): AiDecision {
  const matching = hand.filter(c => matchesSkipConstraint(state, playerId, c));
  if (matching.length > 0) {
    const best = [...matching].sort(
      (a, b) => cardScore(b, false) - cardScore(a, false)
    )[0];
    return { type: "play", cardId: best.id };
  }

  const wild4 = hand.find(c => c.kind === "wild_draw_four");
  if (wild4) return { type: "play", cardId: wild4.id, declaredColor: pickBestColor(hand) };

  return { type: "draw" };
}

function decideNormalTurn(state: GameStateInternal, hand: Card[]): AiDecision {
  const hasEnemy1 = enemyHasOneCard(
    state,
    state.players[state.currentPlayerIndex].playerId
  );
  const playable = getPlayable(state, hand);
  const wild4 = hand.find(c => c.kind === "wild_draw_four");
  const wildCombo = findWildCombo(state, hand);

  // 手牌只剩 1 张 → 直接打出
  if (hand.length === 1 && playable.length > 0) {
    return { type: "play", cardId: playable[0].id };
  }

  type Option = { decision: AiDecision; score: number };
  const options: Option[] = [];

  for (const card of playable) {
    options.push({ decision: { type: "play", cardId: card.id }, score: cardScore(card, hasEnemy1) });
  }

  if (wild4) {
    const score = hasEnemy1 ? 100 : (hand.length >= 4 ? 50 : 15);
    options.push({
      decision: { type: "play", cardId: wild4.id, declaredColor: pickBestColor(hand) },
      score
    });
  }

  if (wildCombo) {
    const base = hand.find(c => c.id === wildCombo.targetCardId);
    options.push({
      decision: { type: "comboPlay", ...wildCombo },
      score: base ? cardScore(base, hasEnemy1) + 5 : 12
    });
  }

  if (options.length === 0) return { type: "draw" };

  options.sort((a, b) => b.score - a.score);
  return options[0].decision;
}

// ── 抢牌决策 ─────────────────────────────────────────────────────────

export function decideSnatch(
  state: GameStateInternal,
  playerId: string
): AiDecision {
  const hand = getPlayerHand(state, playerId);
  const snatchable = hand.filter(c => isCardSnatchable(state, c));
  const hasWildCombo = hasWildComboSnatchOption(state, hand);

  if (snatchable.length === 0 && !hasWildCombo) return { type: "skipSnatch" };

  // 功能牌抢牌：直接抢
  const functional = snatchable.filter(c => c.kind !== "number");
  if (functional.length > 0) {
    const best = functional[0];
    if (best.kind === "wild_draw_four") {
      return { type: "snatch", cardId: best.id, declaredColor: pickBestColor(hand) };
    }
    return { type: "snatch", cardId: best.id };
  }

  // 数字牌抢牌：手牌少时才抢
  if (snatchable.length > 0 && hand.length <= 3) {
    return { type: "snatch", cardId: snatchable[0].id };
  }

  // Wild 组合抢牌
  if (hasWildCombo) {
    const wild = hand.find(c => c.kind === "wild");
    const candidates = hand.filter(c => c.kind !== "wild" && c.kind !== "wild_draw_four");
    if (wild) {
      for (const candidate of candidates) {
        for (const color of COLORS) {
          const transformed: Card = { ...candidate, color };
          if (isExactSnatchMatch(state, transformed)) {
            return {
              type: "comboSnatch",
              wildCardId: wild.id,
              targetCardId: candidate.id,
              declaredColor: color
            };
          }
        }
      }
    }
  }

  return { type: "skipSnatch" };
}

// ── 摸牌后决策 ────────────────────────────────────────────────────────

export function decidePostDraw(
  state: GameStateInternal,
  playerId: string,
  drawnCardId: string
): AiDecision {
  const player = state.players.find(p => p.playerId === playerId)!;
  const drawnCard = player.hand.find(c => c.id === drawnCardId);
  if (!drawnCard || !isCardPlayable(state, drawnCard)) return { type: "passDrawn" };

  // 功能牌或手牌很少时打出
  if (drawnCard.kind !== "number" || player.hand.length <= 3) {
    if (drawnCard.kind === "wild_draw_four") {
      return { type: "play", cardId: drawnCard.id, declaredColor: pickBestColor(player.hand) };
    }
    return { type: "playDrawn" };
  }

  return { type: "passDrawn" };
}
