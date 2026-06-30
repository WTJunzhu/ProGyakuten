export type { ActionResult, GameStateInternal, PlayerState, SkillStateEntry } from "./types.js";
export type {
  CardRuleContext,
  CreateGameRulesOptions,
  GameRuleConfig,
  GameRuleHookSet,
  GameRules,
  PenaltyDrawContext,
  PhaseDurations,
  SkipConstraintContext,
  TurnStartContext,
  UnoPenaltyContext
} from "./modifiers/types.js";

export { createDeck, createGame } from "./setup.js";
export { createGameRules, defaultRuleConfig, withRuleOverrides } from "./modifiers/defaults.js";

export {
  applyCallUno,
  applyCheckUno,
  applyComboPlay,
  applyComboSnatch,
  applyDrawCard,
  applyPassTurn,
  applyPlayCard,
  applySnatchCard
} from "./actions.js";

export {
  alignTurnToSkipConstraint,
  applyAfterTurnStart,
  getPlayerHand,
  matchesSkipConstraint,
  replenishPlayerHand,
  toPublicState
} from "./engine/state.js";

export {
  hasWildComboSnatchOption,
  isCardPlayable,
  isCardPlayableLite,
  isCardSnatchable,
  isCardSnatchableLite,
  isComboPlayable,
  isExactSnatchMatch,
  matchesSkipConstraintLite
} from "./rules/playability.js";

export type { CharacterDefinition, CharacterPublicInfo, SkillDefinition, SkillPublicInfo, SkillInputType } from "./characters/types.js";
export { characterRegistry, registerCharacter, getCharacter, getAllCharacters } from "./characters/registry.js";
export { applyCharacterSkills, canUseSkill, consumeSkillUse } from "./characters/apply.js";
