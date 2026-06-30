import type { GameRuleHookSet } from "../modifiers/types.js";
import type { ActionResult, GameStateInternal, SkillStateEntry } from "../types.js";

export type SkillInputType = "none" | "target" | "card" | "card_and_color";

export interface SkillPublicInfo {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  inputType?: SkillInputType;
  maxUsesPerGame?: number;
  maxUsesPerTurn?: number;
  presentationId?: string;
}

export interface CharacterPublicInfo {
  id: string;
  name: string;
  description: string;
  skills: SkillPublicInfo[];
}

export interface SkillDefinition extends SkillPublicInfo {
  createHooks?: (playerId: string) => Partial<GameRuleHookSet>;
  canActivate?: (state: GameStateInternal, playerId: string) => boolean;
  onActivate?: (state: GameStateInternal, playerId: string, payload?: unknown) => ActionResult;
}

export interface CharacterDefinition extends CharacterPublicInfo {
  skills: SkillDefinition[];
}

export type { SkillStateEntry };
