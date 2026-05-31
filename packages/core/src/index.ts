export type { ActionResult, GameStateInternal, PlayerState, SkillStateEntry } from "./types";
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

export {
  alignTurnToSkipConstraint,
  applyAfterTurnStart,
  getPlayerHand,
  matchesSkipConstraint,
  replenishPlayerHand,
  toPublicState
} from "./engine/state";

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

export type { CharacterDefinition, CharacterPublicInfo, SkillDefinition, SkillPublicInfo, SkillInputType } from "./characters/types";
export { characterRegistry, registerCharacter, getCharacter, getAllCharacters } from "./characters/registry";
export { applyCharacterSkills, canUseSkill, consumeSkillUse } from "./characters/apply";
