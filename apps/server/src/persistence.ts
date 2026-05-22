import type { Client } from "@libsql/client";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { GameStateInternal } from "@pro-gyakuten/core";
import type { CardKind } from "@pro-gyakuten/protocol";
import type { TurnPhaseInfo } from "@pro-gyakuten/protocol";
import type { RoomState } from "./types.js";
import { createGameRules } from "@pro-gyakuten/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface PersistenceLayer {
  saveRoom(room: RoomState): Promise<void>;
  loadRoom(roomId: string): Promise<RoomState | null>;
  deleteRoom(roomId: string): Promise<void>;
  loadAllRooms(): Promise<RoomState[]>;

  saveGameSnapshot(roomId: string, game: GameStateInternal, phase?: TurnPhaseInfo): Promise<void>;
  loadGameSnapshot(roomId: string): Promise<{ game: GameStateInternal; phase?: TurnPhaseInfo } | null>;
  deleteGameSnapshot(roomId: string): Promise<void>;

  savePlayerSession(playerId: string, roomId: string | null): Promise<void>;
  loadPlayerSession(playerId: string): Promise<{ roomId: string | null } | null>;
  deletePlayerSession(playerId: string): Promise<void>;

  createAccount(accountId: string, username: string, passwordHash: string): Promise<void>;
  getAccountByUsername(username: string): Promise<{ accountId: string; username: string; passwordHash: string } | null>;

  getCharactersByAccount(accountId: string): Promise<{ characterId: string; accountId: string; slotIndex: number; displayName: string; level: number; wins: number; losses: number }[]>;
  createCharacter(characterId: string, accountId: string, slotIndex: number, displayName: string): Promise<void>;
  deleteCharacter(characterId: string): Promise<void>;
  getCharacter(characterId: string): Promise<{ characterId: string; accountId: string; slotIndex: number; displayName: string; level: number; wins: number; losses: number } | null>;
  updateCharacterStats(characterId: string, wins: number, losses: number, level: number): Promise<void>;

  close(): Promise<void>;
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
  penaltySource: CardKind | null;
  skipConstraint?: GameStateInternal["skipConstraint"];
  wildBridge?: GameStateInternal["wildBridge"];
  ruleConfig: GameStateInternal["rules"]["config"];
}

export class SqlitePersistence implements PersistenceLayer {
  private db: Client;

  constructor(db: Client) {
    this.db = db;
  }

  async init(): Promise<void> {
    const schema = readFileSync(join(__dirname, "db", "schema.sql"), "utf-8");
    // Split by semicolons and execute each statement
    const statements = schema.split(";").map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      await this.db.execute(stmt);
    }
  }

  // --- Room ---

  async saveRoom(room: RoomState): Promise<void> {
    await this.db.batch([
      {
        sql: `
          INSERT INTO rooms (room_id, owner_player_id, status, teams_json, updated_at)
          VALUES (?, ?, ?, ?, unixepoch())
          ON CONFLICT(room_id) DO UPDATE SET
            owner_player_id = excluded.owner_player_id,
            status = excluded.status,
            teams_json = excluded.teams_json,
            updated_at = unixepoch()
        `,
        args: [room.roomId, room.ownerPlayerId, room.status, JSON.stringify(room.teams)]
      },
      {
        sql: `DELETE FROM room_players WHERE room_id = ?`,
        args: [room.roomId]
      },
      ...room.players.map((playerId, i) => ({
        sql: `INSERT INTO room_players (room_id, player_id, seat) VALUES (?, ?, ?) ON CONFLICT(room_id, player_id) DO UPDATE SET seat = excluded.seat`,
        args: [room.roomId, playerId, i]
      }))
    ]);
  }

  async loadRoom(roomId: string): Promise<RoomState | null> {
    const row = await this.db.execute({
      sql: `SELECT * FROM rooms WHERE room_id = ?`,
      args: [roomId]
    });
    if (row.rows.length === 0) return null;

    const r = row.rows[0] as unknown as { room_id: string; owner_player_id: string; status: string; teams_json: string };

    const playersResult = await this.db.execute({
      sql: `SELECT player_id FROM room_players WHERE room_id = ? ORDER BY seat`,
      args: [roomId]
    });

    const teams = JSON.parse(r.teams_json) as { teamA: string[]; teamB: string[] };

    return {
      roomId: r.room_id,
      ownerPlayerId: r.owner_player_id,
      status: r.status as RoomState["status"],
      players: playersResult.rows.map((p: Record<string, unknown>) => (p as unknown as { player_id: string }).player_id),
      teams,
      phaseToken: 0
    };
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.db.execute({ sql: `DELETE FROM rooms WHERE room_id = ?`, args: [roomId] });
  }

  async loadAllRooms(): Promise<RoomState[]> {
    const rows = await this.db.execute(`SELECT room_id FROM rooms`);
    const results: RoomState[] = [];
    for (const r of rows.rows) {
      const room = await this.loadRoom((r as unknown as { room_id: string }).room_id);
      if (room) results.push(room);
    }
    return results;
  }

  // --- Game snapshot ---

  async saveGameSnapshot(roomId: string, game: GameStateInternal, phase?: TurnPhaseInfo): Promise<void> {
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
      penaltySource: game.penaltySource,
      skipConstraint: game.skipConstraint,
      wildBridge: game.wildBridge,
      ruleConfig: game.rules.config
    };

    await this.db.execute({
      sql: `
        INSERT INTO game_snapshots (room_id, state_json, phase_json, saved_at)
        VALUES (?, ?, ?, unixepoch())
        ON CONFLICT(room_id) DO UPDATE SET
          state_json = excluded.state_json,
          phase_json = excluded.phase_json,
          saved_at = unixepoch()
      `,
      args: [roomId, JSON.stringify(serialized), phase ? JSON.stringify(phase) : null]
    });
  }

  async loadGameSnapshot(roomId: string): Promise<{ game: GameStateInternal; phase?: TurnPhaseInfo } | null> {
    const row = await this.db.execute({
      sql: `SELECT state_json, phase_json FROM game_snapshots WHERE room_id = ?`,
      args: [roomId]
    });
    if (row.rows.length === 0) return null;

    const r = row.rows[0] as unknown as { state_json: string; phase_json: string | null };
    const serialized = JSON.parse(r.state_json) as SerializedGame;
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
      penaltySource: serialized.penaltySource ?? null,
      skipConstraint: serialized.skipConstraint,
      wildBridge: serialized.wildBridge,
      rules
    };

    const phase = r.phase_json ? (JSON.parse(r.phase_json) as TurnPhaseInfo) : undefined;
    return { game, phase };
  }

  async deleteGameSnapshot(roomId: string): Promise<void> {
    await this.db.execute({ sql: `DELETE FROM game_snapshots WHERE room_id = ?`, args: [roomId] });
  }

  // --- Player session ---

  async savePlayerSession(playerId: string, roomId: string | null): Promise<void> {
    await this.db.execute({
      sql: `
        INSERT INTO player_sessions (player_id, room_id, last_seen_at)
        VALUES (?, ?, unixepoch())
        ON CONFLICT(player_id) DO UPDATE SET
          room_id = excluded.room_id,
          last_seen_at = unixepoch()
      `,
      args: [playerId, roomId]
    });
  }

  async loadPlayerSession(playerId: string): Promise<{ roomId: string | null } | null> {
    const row = await this.db.execute({
      sql: `SELECT room_id FROM player_sessions WHERE player_id = ?`,
      args: [playerId]
    });
    if (row.rows.length === 0) return null;
    return { roomId: (row.rows[0] as unknown as { room_id: string | null }).room_id };
  }

  async deletePlayerSession(playerId: string): Promise<void> {
    await this.db.execute({ sql: `DELETE FROM player_sessions WHERE player_id = ?`, args: [playerId] });
  }

  // --- Account ---

  async createAccount(accountId: string, username: string, passwordHash: string): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO accounts (account_id, username, password_hash) VALUES (?, ?, ?)`,
      args: [accountId, username, passwordHash]
    });
  }

  async getAccountByUsername(username: string): Promise<{ accountId: string; username: string; passwordHash: string } | null> {
    const row = await this.db.execute({
      sql: `SELECT account_id, username, password_hash FROM accounts WHERE username = ?`,
      args: [username]
    });
    if (row.rows.length === 0) return null;
    const r = row.rows[0] as unknown as { account_id: string; username: string; password_hash: string };
    return { accountId: r.account_id, username: r.username, passwordHash: r.password_hash };
  }

  // --- Character ---

  async getCharactersByAccount(accountId: string): Promise<{ characterId: string; accountId: string; slotIndex: number; displayName: string; level: number; wins: number; losses: number }[]> {
    const rows = await this.db.execute({
      sql: `SELECT character_id, account_id, slot_index, display_name, level, wins, losses FROM characters WHERE account_id = ? ORDER BY slot_index`,
      args: [accountId]
    });
    return rows.rows.map((r: Record<string, unknown>) => {
      const row = r as unknown as { character_id: string; account_id: string; slot_index: number; display_name: string; level: number; wins: number; losses: number };
      return {
        characterId: row.character_id,
        accountId: row.account_id,
        slotIndex: row.slot_index,
        displayName: row.display_name,
        level: row.level,
        wins: row.wins,
        losses: row.losses
      };
    });
  }

  async createCharacter(characterId: string, accountId: string, slotIndex: number, displayName: string): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO characters (character_id, account_id, slot_index, display_name) VALUES (?, ?, ?, ?)`,
      args: [characterId, accountId, slotIndex, displayName]
    });
  }

  async deleteCharacter(characterId: string): Promise<void> {
    await this.db.execute({ sql: `DELETE FROM characters WHERE character_id = ?`, args: [characterId] });
  }

  async getCharacter(characterId: string): Promise<{ characterId: string; accountId: string; slotIndex: number; displayName: string; level: number; wins: number; losses: number } | null> {
    const row = await this.db.execute({
      sql: `SELECT character_id, account_id, slot_index, display_name, level, wins, losses FROM characters WHERE character_id = ?`,
      args: [characterId]
    });
    if (row.rows.length === 0) return null;
    const r = row.rows[0] as unknown as { character_id: string; account_id: string; slot_index: number; display_name: string; level: number; wins: number; losses: number };
    return {
      characterId: r.character_id,
      accountId: r.account_id,
      slotIndex: r.slot_index,
      displayName: r.display_name,
      level: r.level,
      wins: r.wins,
      losses: r.losses
    };
  }

  async updateCharacterStats(characterId: string, wins: number, losses: number, level: number): Promise<void> {
    await this.db.execute({
      sql: `UPDATE characters SET wins = ?, losses = ?, level = ? WHERE character_id = ?`,
      args: [wins, losses, level, characterId]
    });
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
