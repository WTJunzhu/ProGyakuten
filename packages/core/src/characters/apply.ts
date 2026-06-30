import type { GameRuleHookSet } from "../modifiers/types.js";
import type { GameStateInternal } from "../types.js";
import { characterRegistry } from "./registry.js";

export function applyCharacterSkills(
  state: GameStateInternal,
  assignments: Record<string, string>
): void {
  state.characterAssignments = { ...assignments };
  state.skillState = {};

  for (const [playerId, characterId] of Object.entries(assignments)) {
    const character = characterRegistry.get(characterId);
    if (!character) continue;

    state.skillState[playerId] = {};

    for (const skill of character.skills) {
      if (skill.maxUsesPerGame !== undefined || skill.maxUsesPerTurn !== undefined) {
        state.skillState[playerId][skill.id] = {
          usesRemaining: skill.maxUsesPerGame ?? Number.MAX_SAFE_INTEGER
        };
      }

      if (skill.createHooks) {
        state.rules.hooks.push(skill.createHooks(playerId) as GameRuleHookSet);
      }
    }
  }
}

export function canUseSkill(
  state: GameStateInternal,
  playerId: string,
  skillId: string
): boolean {
  const entry = state.skillState?.[playerId]?.[skillId];
  if (!entry) return true;
  if (entry.usesRemaining <= 0) return false;
  if (entry.lastUsedTurnId === state.turnId) return false;
  return true;
}

export function consumeSkillUse(
  state: GameStateInternal,
  playerId: string,
  skillId: string
): void {
  const entry = state.skillState?.[playerId]?.[skillId];
  if (!entry) return;
  entry.usesRemaining = Math.max(0, entry.usesRemaining - 1);
  entry.lastUsedTurnId = state.turnId;
}
