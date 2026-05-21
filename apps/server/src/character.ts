import { randomUUID } from "crypto";
import { persistence } from "./db.js";

const MAX_CHARACTERS = 3;

export function listCharacters(accountId: string) {
  return persistence.getCharactersByAccount(accountId);
}

export function createCharacter(
  accountId: string,
  displayName: string,
  overwriteSlotIndex?: number
): { ok: boolean; character?: { characterId: string; accountId: string; slotIndex: number; displayName: string; level: number; wins: number; losses: number }; error?: string } {
  const existing = persistence.getCharactersByAccount(accountId);

  if (existing.length < MAX_CHARACTERS) {
    // Find first free slot
    const usedSlots = new Set(existing.map(c => c.slotIndex));
    let slotIndex = 0;
    while (usedSlots.has(slotIndex)) slotIndex++;

    const characterId = randomUUID();
    persistence.createCharacter(characterId, accountId, slotIndex, displayName);
    const character = persistence.getCharacter(characterId)!;
    return { ok: true, character };
  }

  // Slots full — must overwrite
  if (overwriteSlotIndex === undefined) {
    return { ok: false, error: "SLOT_FULL" };
  }

  const target = existing.find(c => c.slotIndex === overwriteSlotIndex);
  if (!target) {
    return { ok: false, error: "指定槽位不存在" };
  }

  persistence.deleteCharacter(target.characterId);
  const characterId = randomUUID();
  persistence.createCharacter(characterId, accountId, overwriteSlotIndex, displayName);
  const character = persistence.getCharacter(characterId)!;
  return { ok: true, character };
}
