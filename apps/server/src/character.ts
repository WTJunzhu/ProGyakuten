import { randomUUID } from "crypto";
import { persistence } from "./db.js";

const MAX_CHARACTERS = 3;

export async function listCharacters(accountId: string) {
  return persistence.getCharactersByAccount(accountId);
}

export async function createCharacter(
  accountId: string,
  displayName: string,
  overwriteSlotIndex?: number
): Promise<{ ok: boolean; character?: { characterId: string; accountId: string; slotIndex: number; displayName: string; level: number; wins: number; losses: number }; error?: string }> {
  const existing = await persistence.getCharactersByAccount(accountId);

  if (existing.length < MAX_CHARACTERS) {
    const usedSlots = new Set(existing.map(c => c.slotIndex));
    let slotIndex = 0;
    while (usedSlots.has(slotIndex)) slotIndex++;

    const characterId = randomUUID();
    await persistence.createCharacter(characterId, accountId, slotIndex, displayName);
    const character = await persistence.getCharacter(characterId);
    return { ok: true, character: character! };
  }

  if (overwriteSlotIndex === undefined) {
    return { ok: false, error: "SLOT_FULL" };
  }

  const target = existing.find(c => c.slotIndex === overwriteSlotIndex);
  if (!target) {
    return { ok: false, error: "指定槽位不存在" };
  }

  await persistence.deleteCharacter(target.characterId);
  const characterId = randomUUID();
  await persistence.createCharacter(characterId, accountId, overwriteSlotIndex, displayName);
  const character = await persistence.getCharacter(characterId);
  return { ok: true, character: character! };
}
