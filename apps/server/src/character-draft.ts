import {
  getAllCharacters,
  applyCharacterSkills,
  createGame,
  getPlayerHand,
  toPublicState
} from "@pro-gyakuten/core";
import type { CharacterPublicInfo } from "@pro-gyakuten/protocol";
import type { RoomState } from "./types.js";
import {
  CHARACTER_DRAFT_TIMEOUT_MS,
  GAME_INTRO_MS,
  TURN_TIMEOUT_MS
} from "./types.js";
import { playersById, send } from "./state.js";
import { roomManager } from "./room-manager.js";
import { broadcastToLobby, getLobbyStateEvent, getTeammateHands } from "./broadcast.js";
import { broadcastRoomSnapshot } from "./room.js";
import { getAllowedActions } from "./actions.js";
import { setPhase } from "./phase.js";
import { persistence } from "./db.js";

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickDraftOptions(playerIds: string[]): Record<string, CharacterPublicInfo[]> {
  const all = getAllCharacters();
  if (all.length === 0) return {};

  const optionsPerPlayer = 3;
  const shuffled = shuffleArray(all);

  // Build a pool large enough for all players (cycle if needed)
  const pool: CharacterPublicInfo[] = [];
  while (pool.length < playerIds.length * optionsPerPlayer) {
    pool.push(...shuffled);
  }

  const result: Record<string, CharacterPublicInfo[]> = {};
  let idx = 0;
  for (const playerId of playerIds) {
    result[playerId] = pool.slice(idx, idx + optionsPerPlayer);
    idx += optionsPerPlayer;
  }
  return result;
}

// -----------------------------------------------------------------------
// Public entry point: called from index.ts when owner presses "start game"
// -----------------------------------------------------------------------

export function startCharacterDraft(room: RoomState): void {
  const allChars = getAllCharacters();

  if (allChars.length === 0) {
    // No characters registered — send empty reveal so client can enter game_intro view
    for (const playerId of room.players) {
      const conn = playersById.get(playerId);
      if (conn) send(conn.ws, { type: "gameCharacterReveal", assignments: {} });
    }
    startGameIntro(room);
    return;
  }

  const options = pickDraftOptions(room.players);
  room.characterDraft = { options, selections: {} };
  room.status = "character_selection";
  room.phaseToken += 1;
  const token = room.phaseToken;

  // Send each player their private set of 3 options
  for (const playerId of room.players) {
    const conn = playersById.get(playerId);
    if (!conn) continue;
    send(conn.ws, {
      type: "characterDraft",
      characters: options[playerId] ?? [],
      timeoutMs: CHARACTER_DRAFT_TIMEOUT_MS
    });
  }

  broadcastRoomSnapshot(room);
  broadcastToLobby(getLobbyStateEvent());

  // Timeout: auto-assign anyone who hasn't selected, then proceed
  setTimeout(() => {
    const r = roomManager.get(room.roomId);
    if (!r || r.phaseToken !== token || r.status !== "character_selection") return;
    autoAssignRemaining(r);
    completeDraft(r);
  }, CHARACTER_DRAFT_TIMEOUT_MS);
}

// Called from index.ts when a selectGameCharacter event arrives
export function handleSelectGameCharacter(
  room: RoomState,
  playerId: string,
  characterId: string
): void {
  if (!room.characterDraft) return;
  if (room.status !== "character_selection") return;

  const options = room.characterDraft.options[playerId] ?? [];
  if (!options.some((c) => c.id === characterId)) {
    const conn = playersById.get(playerId);
    if (conn) {
      send(conn.ws, {
        type: "actionRejected",
        code: "INVALID_ACTION",
        message: "该角色不在你的选项中"
      });
    }
    return;
  }

  // Ignore duplicate selections
  if (room.characterDraft.selections[playerId]) return;

  room.characterDraft.selections[playerId] = characterId;

  // If all players have selected, complete immediately (don't wait for timeout)
  const allSelected = room.players.every((pid) => room.characterDraft!.selections[pid]);
  if (allSelected) {
    room.phaseToken += 1; // invalidate the draft timeout
    completeDraft(room);
  }
}

// -----------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------

function autoAssignRemaining(room: RoomState): void {
  if (!room.characterDraft) return;
  for (const playerId of room.players) {
    if (!room.characterDraft.selections[playerId]) {
      const opts = room.characterDraft.options[playerId] ?? [];
      if (opts.length > 0) {
        room.characterDraft.selections[playerId] = opts[0].id;
      }
    }
  }
}

function buildAssignments(room: RoomState): Record<string, CharacterPublicInfo> {
  const assignments: Record<string, CharacterPublicInfo> = {};
  if (!room.characterDraft) return assignments;
  for (const [playerId, characterId] of Object.entries(room.characterDraft.selections)) {
    const char = room.characterDraft.options[playerId]?.find((c) => c.id === characterId);
    if (char) assignments[playerId] = char;
  }
  return assignments;
}

function completeDraft(room: RoomState): void {
  const assignments = buildAssignments(room);

  // Broadcast reveal to all players (everyone sees everyone's character)
  for (const playerId of room.players) {
    const conn = playersById.get(playerId);
    if (conn) send(conn.ws, { type: "gameCharacterReveal", assignments });
  }

  startGameIntro(room);
}

function startGameIntro(room: RoomState): void {
  room.status = "game_intro";
  room.phaseToken += 1;
  const token = room.phaseToken;

  broadcastRoomSnapshot(room);

  setTimeout(() => {
    const r = roomManager.get(room.roomId);
    if (!r || r.phaseToken !== token || r.status !== "game_intro") return;
    launchGame(r).catch(console.error);
  }, GAME_INTRO_MS);
}

async function launchGame(room: RoomState): Promise<void> {
  // Build character-id assignment map (playerId → characterId)
  const charIdAssignments: Record<string, string> = {};
  if (room.characterDraft) {
    for (const [pid, cid] of Object.entries(room.characterDraft.selections)) {
      charIdAssignments[pid] = cid;
    }
  }

  room.game = createGame(room.roomId, room.players);

  if (Object.keys(charIdAssignments).length > 0) {
    applyCharacterSkills(room.game, charIdAssignments);
  }

  room.status = "in_game";
  room.phaseToken = 0;
  room.drawnCardWindow = undefined;
  room.characterDraft = undefined;

  setPhase(
    room,
    "turn_main",
    room.game.players[room.game.currentPlayerIndex].playerId,
    TURN_TIMEOUT_MS
  );

  for (const playerId of room.players) {
    const conn = playersById.get(playerId);
    if (!conn) continue;
    send(conn.ws, {
      type: "gameStart",
      state: toPublicState(room.game),
      phase: room.phase!,
      hand: getPlayerHand(room.game, playerId),
      teammateHands: getTeammateHands(room, playerId),
      lastSeq: room.game.players.find((p) => p.playerId === playerId)?.lastSeq,
      allowedActions: getAllowedActions(room, playerId),
      playableDrawnCardId: undefined
    });
  }

  await persistence.saveRoom(room);
  await persistence.saveGameSnapshot(room.roomId, room.game, room.phase);
  broadcastToLobby(getLobbyStateEvent());
}
