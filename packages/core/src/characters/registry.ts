import type { CharacterDefinition } from "./types.js";

export const characterRegistry = new Map<string, CharacterDefinition>();

export function registerCharacter(def: CharacterDefinition): void {
  characterRegistry.set(def.id, def);
}

export function getCharacter(id: string): CharacterDefinition | undefined {
  return characterRegistry.get(id);
}

export function getAllCharacters(): CharacterDefinition[] {
  return Array.from(characterRegistry.values());
}

// ── 内置角色 ── 每加一个角色在此处追加两行 ──────────────────────

import { naruhodou } from "./definitions/naruhodou.js";
registerCharacter(naruhodou);

import { mikotoba } from "./definitions/mikotoba.js";
registerCharacter(mikotoba);

import { asougi } from "./definitions/asougi.js";
registerCharacter(asougi);
