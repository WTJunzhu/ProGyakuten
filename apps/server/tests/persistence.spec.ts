import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqlitePersistence } from "../src/persistence.js";
import type { RoomState } from "../src/types.js";

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomId: "test-room",
    players: ["alice", "bob"],
    ownerPlayerId: "alice",
    status: "lobby",
    teams: { teamA: ["alice"], teamB: ["bob"] },
    phaseToken: 0,
    ...overrides
  };
}

describe("SqlitePersistence", () => {
  let db: SqlitePersistence;

  beforeEach(() => {
    db = new SqlitePersistence(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("Room persistence", () => {
    it("saves and loads a room", () => {
      const room = makeRoom();
      db.saveRoom(room);
      const loaded = db.loadRoom("test-room");
      expect(loaded).not.toBeNull();
      expect(loaded!.roomId).toBe("test-room");
      expect(loaded!.players).toEqual(["alice", "bob"]);
      expect(loaded!.ownerPlayerId).toBe("alice");
      expect(loaded!.teams).toEqual({ teamA: ["alice"], teamB: ["bob"] });
    });

    it("returns null for non-existent room", () => {
      expect(db.loadRoom("nope")).toBeNull();
    });

    it("updates an existing room", () => {
      const room = makeRoom();
      db.saveRoom(room);
      room.players.push("charlie");
      room.status = "in_game";
      db.saveRoom(room);
      const loaded = db.loadRoom("test-room");
      expect(loaded!.players).toEqual(["alice", "bob", "charlie"]);
      expect(loaded!.status).toBe("in_game");
    });

    it("deletes a room", () => {
      db.saveRoom(makeRoom());
      db.deleteRoom("test-room");
      expect(db.loadRoom("test-room")).toBeNull();
    });

    it("loads all rooms", () => {
      db.saveRoom(makeRoom({ roomId: "room1" }));
      db.saveRoom(makeRoom({ roomId: "room2" }));
      const all = db.loadAllRooms();
      expect(all).toHaveLength(2);
      expect(all.map((r) => r.roomId).sort()).toEqual(["room1", "room2"]);
    });

    it("handles room players ordering by seat", () => {
      const room = makeRoom({ players: ["charlie", "alice", "bob"] });
      db.saveRoom(room);
      const loaded = db.loadRoom("test-room");
      expect(loaded!.players).toEqual(["charlie", "alice", "bob"]);
    });
  });

  describe("Game snapshot persistence", () => {
    it("saves and loads a game snapshot", () => {
      const room = makeRoom({ status: "in_game" });
      db.saveRoom(room);

      // Minimal mock game state
      const game = {
        roomId: "test-room",
        gameId: "game-1",
        turnId: 1,
        currentPlayerIndex: 0,
        direction: 1 as const,
        drawPile: [],
        discardPile: [{ id: "c1", color: "red" as const, kind: "number" as const, value: 5 }],
        players: [
          { playerId: "alice", hand: [], connected: true, lastSeq: 0, missedUnoPending: false },
          { playerId: "bob", hand: [], connected: true, lastSeq: 0, missedUnoPending: false }
        ],
        teams: { teamA: ["alice"], teamB: ["bob"] },
        drawCardStack: 0,
        rules: {
          config: {
            allowSnatch: true,
            allowPostDrawWindow: true,
            enforceUnoPenalty: true,
            initialHandsNumbersOnly: true,
            allowWildStartCard: false,
            maxHandSize: 50,
            phaseDurations: { turnMainMs: 30000, snatchWindowMs: 5000, postDrawWindowMs: 5000 }
          },
          hooks: []
        }
      };

      const phase = {
        phase: "turn_main" as const,
        actingPlayerId: "alice",
        endsAt: Date.now() + 30000
      };

      db.saveGameSnapshot("test-room", game as any, phase);
      const result = db.loadGameSnapshot("test-room");
      expect(result).not.toBeNull();
      expect(result!.game.roomId).toBe("test-room");
      expect(result!.game.turnId).toBe(1);
      expect(result!.phase?.phase).toBe("turn_main");
    });

    it("returns null for non-existent snapshot", () => {
      expect(db.loadGameSnapshot("nope")).toBeNull();
    });

    it("deletes a game snapshot", () => {
      db.saveRoom(makeRoom({ status: "in_game" }));
      const game = {
        roomId: "test-room",
        gameId: "game-1",
        turnId: 0,
        currentPlayerIndex: 0,
        direction: 1 as const,
        drawPile: [],
        discardPile: [],
        players: [],
        teams: { teamA: [], teamB: [] },
        drawCardStack: 0,
        rules: {
          config: {
            allowSnatch: true,
            allowPostDrawWindow: true,
            enforceUnoPenalty: true,
            initialHandsNumbersOnly: true,
            allowWildStartCard: false,
            maxHandSize: 50,
            phaseDurations: { turnMainMs: 30000, snatchWindowMs: 5000, postDrawWindowMs: 5000 }
          },
          hooks: []
        }
      };
      db.saveGameSnapshot("test-room", game as any);
      db.deleteGameSnapshot("test-room");
      expect(db.loadGameSnapshot("test-room")).toBeNull();
    });
  });

  describe("Player session persistence", () => {
    it("saves and loads a player session", () => {
      db.savePlayerSession("alice", "room-1");
      const session = db.loadPlayerSession("alice");
      expect(session).not.toBeNull();
      expect(session!.roomId).toBe("room-1");
    });

    it("saves session with null roomId", () => {
      db.savePlayerSession("alice", null);
      const session = db.loadPlayerSession("alice");
      expect(session).not.toBeNull();
      expect(session!.roomId).toBeNull();
    });

    it("returns null for non-existent session", () => {
      expect(db.loadPlayerSession("nope")).toBeNull();
    });

    it("deletes a player session", () => {
      db.savePlayerSession("alice", "room-1");
      db.deletePlayerSession("alice");
      expect(db.loadPlayerSession("alice")).toBeNull();
    });

    it("updates an existing session", () => {
      db.savePlayerSession("alice", "room-1");
      db.savePlayerSession("alice", "room-2");
      const session = db.loadPlayerSession("alice");
      expect(session!.roomId).toBe("room-2");
    });
  });

  describe("Cascade delete", () => {
    it("deleting a room cascades to room_players and game_snapshots", () => {
      const room = makeRoom({ status: "in_game" });
      db.saveRoom(room);

      const game = {
        roomId: "test-room",
        gameId: "game-1",
        turnId: 0,
        currentPlayerIndex: 0,
        direction: 1 as const,
        drawPile: [],
        discardPile: [],
        players: [],
        teams: { teamA: [], teamB: [] },
        drawCardStack: 0,
        rules: {
          config: {
            allowSnatch: true,
            allowPostDrawWindow: true,
            enforceUnoPenalty: true,
            initialHandsNumbersOnly: true,
            allowWildStartCard: false,
            maxHandSize: 50,
            phaseDurations: { turnMainMs: 30000, snatchWindowMs: 5000, postDrawWindowMs: 5000 }
          },
          hooks: []
        }
      };
      db.saveGameSnapshot("test-room", game as any);

      db.deleteRoom("test-room");
      expect(db.loadRoom("test-room")).toBeNull();
      expect(db.loadGameSnapshot("test-room")).toBeNull();
    });
  });
});
