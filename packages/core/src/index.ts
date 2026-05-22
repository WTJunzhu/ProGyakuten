export type { ActionResult, GameStateInternal, PlayerState } from "./types";
export type {
  CardRuleContext,
  CreateGameRulesOptions,
  GameRuleConfig,
  GameRuleHookSet,
  GameRules,
  PhaseDurations,
  UnoPenaltyContext
} from "./modifiers/types";

export { createDeck, createGame } from "./setup";
export { createGameRules, defaultRuleConfig, withRuleOverrides } from "./modifiers/defaults";

export {
  applyCallUno,
  applyCheckUno,
  applyComboPlay,
  applyComboSnatch,
  applyDrawCard,
  applyPassTurn,
  applyPlayCard,
  applySnatchCard
} from "./actions";

export { alignTurnToSkipConstraint, getPlayerHand, replenishPlayerHand, toPublicState } from "./engine/state";

export {
  hasWildComboSnatchOption,
  isCardPlayable,
  isCardPlayableLite,
  isCardSnatchable,
  isCardSnatchableLite,
  isComboPlayable,
  isExactSnatchMatch,
  matchesSkipConstraintLite
} from "./rules/playability";
