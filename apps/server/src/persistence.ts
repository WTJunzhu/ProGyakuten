import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { GameStateInternal } from "@pro-gyakuten/core";
import type { TurnPhaseInfo } from "@pro-gyakuten/protocol";
import type { RoomState } from "./types.js";
import { createGameRules } from "@pro-gyakuten/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface PersistenceLayer {
  saveRoom(room: RoomState): void;
  loadRoom(roomId: string): RoomState | null;
  deleteRoom(roomId: string): void;
  loadAllRooms(): RoomState[];

  saveGameSnapshot(roomId: string, game: GameStateInternal, phase?: TurnPhaseInfo): void;
  loadGameSnapshot(roomId: string): { game: GameStateInternal; phase?: TurnPhaseInfo } | null;
  deleteGameSnapshot(roomId: string): void;

  savePlayerSession(playerId: string, roomId: string | null): void;
  loadPlayerSession(playerId: string): { roomId: string | null } | null;
  deletePlayerSession(playerId: string): void;
}

interface SerializedGame {
  roomId: string;
  gameId: string;
  turnId: number;
  currentPlayerIndex: number;
  direction: 1 | -1;
  drawPile: GameStateInternal["drawPile"];
  discardPile: GameStateInternal["discardPile"];
  players: GameStateInternal["players"];
  teams: GameStateInternal["teams"];
  winnerTeam?: "teamA" | "teamB";
  drawCardStack: number;
  skipConstraint?: GameStateInternal["skipConstraint"];
  wildBridge?: GameStateInternal["wildBridge"];
  ruleConfig: GameStateInternal["rules"]["config"];
}

export class SqlitePersistence implements PersistenceLayer {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    const schema = readFileSync(join(__dirname, "db", "schema.sql"), "utf-8");
    this.db.exec(schema);
  }

  // --- Room ---

  saveRoom(room: RoomState): void {
    const upsertRoom = this.db.prepare(`
      INSERT INTO rooms (room_id, owner_player_id, status, teams_json, updated_at)
      VALUES (?, ?, ?, ?, unixepoch())
      ON CONFLICT(room_id) DO UPDATE SET
        owner_player_id = excluded.owner_player_id,
        status = excluded.status,
        teams_json = excluded.teams_json,
        updated_at = unixepoch()
    `);

    const upsertPlayer = this.db.prepare(`
      INSERT INTO room_players (room_id, player_id, seat)
      VALUES (?, ?, ?)
      ON CONFLICT(room_id, player_id) DO UPDATE SET seat = excluded.seat
    `);

    const deletePlayers = this.db.prepare(`DELETE FROM room_players WHERE room_id = ?`);

    const txn = this.db.transaction(() => {
      upsertRoom.run(room.roomId, room.ownerPlayerId, room.status, JSON.stringify(room.teams));
      deletePlayers.run(room.roomId);
      for (let i = 0; i < room.players.length; i++) {
        upsertPlayer.run(room.roomId, room.players[i], i);
      }
    });
    txn();
  }

  loadRoom(roomId: string): RoomState | null {
    const row = this.db.prepare(`SELECT * FROM rooms WHERE room_id = ?`).get(roomId) as {
      room_id: string;
      owner_player_id: string;
      status: string;
      teams_json: string;
    } | undefined;

    if (!row) return null;

    const players = this.db
      .prepare(`SELECT player_id FROM room_players WHERE room_id = ? ORDER BY seat`)
      .all(roomId) as { player_id: string }[];

    const teams = JSON.parse(row.teams_json) as { teamA: string[]; teamB: string[] };

    return {
      roomId: row.room_id,
      ownerPlayerId: row.owner_player_id,
      status: row.status as RoomState["status"],
      players: players.map((p) => p.player_id),
      teams,
      phaseToken: 0
    };
  }

  deleteRoom(roomId: string): void {
    this.db.prepare(`DELETE FROM rooms WHERE room_id = ?`).run(roomId);
  }

  loadAllRooms(): RoomState[] {
    const rows = this.db.prepare(`SELECT room_id FROM rooms`).all() as { room_id: string }[];
    return rows
      .map((r) => this.loadRoom(r.room_id))
      .filter((r): r is RoomState => r !== null);
  }

  // --- Game snapshot ---

  saveGameSnapshot(roomId: string, game: GameStateInternal, phase?: TurnPhaseInfo): void {
    const serialized: SerializedGame = {
      roomId: game.roomId,
      gameId: game.gameId,
      turnId: game.turnId,
      currentPlayerIndex: game.currentPlayerIndex,
      direction: game.direction,
      drawPile: game.drawPile,
      discardPile: game.discardPile,
      players: game.players,
      teams: game.teams,
      winnerTeam: game.winnerTeam,
      drawCardStack: game.drawCardStack,
      skipConstraint: game.skipConstraint,
      wildBridge: game.wildBridge,
      ruleConfig: game.rules.config
    };

    this.db.prepare(`
      INSERT INTO game_snapshots (room_id, state_json, phase_json, saved_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(room_id) DO UPDATE SET
        state_json = excluded.state_json,
        phase_json = excluded.phase_json,
        saved_at = unixepoch()
    `).run(roomId, JSON.stringify(serialized), phase ? JSON.stringify(phase) : null);
  }

  loadGameSnapshot(roomId: string): { game: GameStateInternal; phase?: TurnPhaseInfo } | null {
    const row = this.db.prepare(`SELECT state_json, phase_json FROM game_snapshots WHERE room_id = ?`).get(roomId) as {
      state_json: string;
      phase_json: string | null;
    } | undefined;

    if (!row) return null;

    const serialized = JSON.parse(row.state_json) as SerializedGame;
    const rules = createGameRules({ config: serialized.ruleConfig });

    const game: GameStateInternal = {
      roomId: serialized.roomId,
      gameId: serialized.gameId,
      turnId: serialized.turnId,
      currentPlayerIndex: serialized.currentPlayerIndex,
      direction: serialized.direction,
      drawPile: serialized.drawPile,
      discardPile: serialized.discardPile,
      players: serialized.players,
      teams: serialized.teams,
      winnerTeam: serialized.winnerTeam,
      drawCardStack: serialized.drawCardStack,
      skipConstraint: serialized.skipConstraint,
      wildBridge: serialized.wildBridge,
      rules
    };

    const phase = row.phase_json ? (JSON.parse(row.phase_json) as TurnPhaseInfo) : undefined;
    return { game, phase };
  }

  deleteGameSnapshot(roomId: string): void {
    this.db.prepare(`DELETE FROM game_snapshots WHERE room_id = ?`).run(roomId);
  }

  // --- Player session ---

  savePlayerSession(playerId: string, roomId: string | null): void {
    this.db.prepare(`
      INSERT INTO player_sessions (player_id, room_id, last_seen_at)
      VALUES (?, ?, unixepoch())
      ON CONFLICT(player_id) DO UPDATE SET
        room_id = excluded.room_id,
        last_seen_at = unixepoch()
    `).run(playerId, roomId);
  }

  loadPlayerSession(playerId: string): { roomId: string | null } | null {
    const row = this.db.prepare(`SELECT room_id FROM player_sessions WHERE player_id = ?`).get(playerId) as {
      room_id: string | null;
    } | undefined;
    if (!row) return null;
    return { roomId: row.room_id };
  }

  deletePlayerSession(playerId: string): void {
    this.db.prepare(`DELETE FROM player_sessions WHERE player_id = ?`).run(playerId);
  }

  // --- Account ---

  createAccount(accountId: string, username: string, passwordHash: string): void {
    this.db.prepare(`INSERT INTO accounts (account_id, username, password_hash) VALUES (?, ?, ?)`)
      .run(accountId, username, passwordHash);
  }

  getAccountByUsername(username: string): { accountId: string; username: string; passwordHash: string } | null {
    const row = this.db.prepare(`SELECT account_id, username, password_hash FROM accounts WHERE username = ?`)
      .get(username) as { account_id: string; username: string; password_hash: string } | undefined;
    if (!row) return null;
    return { accountId: row.account_id, username: row.username, passwordHash: row.password_hash };
  }

  // --- Character ---

  getCharactersByAccount(accountId: string): { characterId: string; accountId: string; slotIndex: number; displayName: string; level: number; wins: number; losses: number }[] {
    const rows = this.db.prepare(`SELECT character_id, account_id, slot_index, display_name, level, wins, losses FROM characters WHERE account_id = ? ORDER BY slot_index`)
      .all(accountId) as { character_id: string; account_id: string; slot_index: number; display_name: string; level: number; wins: number; losses: number }[];
    return rows.map(r => ({
      characterId: r.character_id,
      accountId: r.account_id,
      slotIndex: r.slot_index,
      displayName: r.display_name,
      level: r.level,
      wins: r.wins,
      losses: r.losses
    }));
  }

  createCharacter(characterId: string, accountId: string, slotIndex: number, displayName: string): void {
    this.db.prepare(`INSERT INTO characters (character_id, account_id, slot_index, display_name) VALUES (?, ?, ?, ?)`)
      .run(characterId, accountId, slotIndex, displayName);
  }

  deleteCharacter(characterId: string): void {
    this.db.prepare(`DELETE FROM characters WHERE character_id = ?`).run(characterId);
  }

  getCharacter(characterId: string): { characterId: string; accountId: string; slotIndex: number; displayName: string; level: number; wins: number; losses: number } | null {
    const row = this.db.prepare(`SELECT character_id, account_id, slot_index, display_name, level, wins, losses FROM characters WHERE character_id = ?`)
      .get(characterId) as { character_id: string; account_id: string; slot_index: number; display_name: string; level: number; wins: number; losses: number } | undefined;
    if (!row) return null;
    return {
      characterId: row.character_id,
      accountId: row.account_id,
      slotIndex: row.slot_index,
      displayName: row.display_name,
      level: row.level,
      wins: row.wins,
      losses: row.losses
    };
  }

  updateCharacterStats(characterId: string, wins: number, losses: number, level: number): void {
    this.db.prepare(`UPDATE characters SET wins = ?, losses = ?, level = ? WHERE character_id = ?`)
      .run(wins, losses, level, characterId);
  }

  close(): void {
    this.db.close();
  }
}
