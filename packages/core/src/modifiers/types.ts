import type { Card } from "@pro-gyakuten/protocol";
import type { GameStateInternal, PlayerState } from "../types";

export interface PhaseDurations {
  turnMainMs: number;
  snatchWindowMs: number;
  postDrawWindowMs: number;
}

export interface GameRuleConfig {
  allowSnatch: boolean;
  allowPostDrawWindow: boolean;
  enforceUnoPenalty: boolean;
  initialHandsNumbersOnly: boolean;
  allowWildStartCard: boolean;
  maxHandSize: number;
  phaseDurations: PhaseDurations;
}

export interface CardRuleContext {
  state: GameStateInternal;
  player: PlayerState;
  card: Card;
}

export interface UnoPenaltyContext {
  state: GameStateInternal;
  player: PlayerState;
}

export interface TurnStartContext {
  state: GameStateInternal;
  player: PlayerState;
}

export interface PenaltyDrawContext {
  state: GameStateInternal;
  player: PlayerState;
  count: number;
}

export interface SkipConstraintContext {
  state: GameStateInternal;
  sourcePlayer: PlayerState;
  targetPlayer: PlayerState;
  card: Card;
}

export interface GameRules {
  config: GameRuleConfig;
  hooks: GameRuleHookSet[];
}

export interface CreateGameRulesOptions {
  config?: Partial<GameRuleConfig>;
  hooks?: GameRuleHookSet[];
}

export interface GameRuleHookSet {
  canPlayCard?(context: CardRuleContext, defaultResult: boolean): boolean | undefined;
  canSnatchCard?(context: CardRuleContext, defaultResult: boolean): boolean | undefined;
  afterCardPlayed?(context: CardRuleContext): void;
  afterCardSnatched?(context: CardRuleContext): void;
  resolveUnoPenalty?(context: UnoPenaltyContext, defaultAnnouncements: string[]): string[] | undefined;
  afterTurnStart?(context: TurnStartContext): void;
  afterCardDrawn?(context: CardRuleContext): void;
  beforePenaltyDraw?(context: PenaltyDrawContext): void;
  onSkipConstraintSet?(context: SkipConstraintContext): void;
}
