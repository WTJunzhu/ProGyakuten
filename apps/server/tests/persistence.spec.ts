import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "@libsql/client";
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
    aiPlayers: [],
    spectators: [],
    ...overrides
  };
}

describe("SqlitePersistence", () => {
  let db: SqlitePersistence;

  beforeEach(async () => {
    const client = createClient({ url: ":memory:" });
    db = new SqlitePersistence(client);
    await db.init();
  });

  afterEach(async () => {
    await db.close();
  });

  describe("Room persistence", () => {
    it("saves and loads a room", async () => {
      const room = makeRoom();
      await db.saveRoom(room);
      const loaded = await db.loadRoom("test-room");
      expect(loaded).not.toBeNull();
      expect(loaded!.roomId).toBe("test-room");
      expect(loaded!.players).toEqual(["alice", "bob"]);
      expect(loaded!.ownerPlayerId).toBe("alice");
    });

    it("returns null for non-existent room", async () => {
      const loaded = await db.loadRoom("nope");
      expect(loaded).toBeNull();
    });

    it("deletes a room", async () => {
      await db.saveRoom(makeRoom());
      await db.deleteRoom("test-room");
      expect(await db.loadRoom("test-room")).toBeNull();
    });

    it("loads all rooms", async () => {
      await db.saveRoom(makeRoom({ roomId: "r1" }));
      await db.saveRoom(makeRoom({ roomId: "r2" }));
      const all = await db.loadAllRooms();
      expect(all.length).toBe(2);
    });
  });

  describe("Account persistence", () => {
    it("creates and retrieves account by username", async () => {
      await db.createAccount("acc-1", "testuser", "hash123");
      const account = await db.getAccountByUsername("testuser");
      expect(account).not.toBeNull();
      expect(account!.accountId).toBe("acc-1");
      expect(account!.username).toBe("testuser");
      expect(account!.passwordHash).toBe("hash123");
    });

    it("returns null for non-existent username", async () => {
      const account = await db.getAccountByUsername("nobody");
      expect(account).toBeNull();
    });
  });

  describe("Character persistence", () => {
    it("creates and lists characters", async () => {
      await db.createAccount("acc-1", "user", "hash");
      await db.createCharacter("char-1", "acc-1", 0, "Hero");
      await db.createCharacter("char-2", "acc-1", 1, "Mage");

      const chars = await db.getCharactersByAccount("acc-1");
      expect(chars.length).toBe(2);
      expect(chars[0].displayName).toBe("Hero");
      expect(chars[1].displayName).toBe("Mage");
    });

    it("deletes a character", async () => {
      await db.createAccount("acc-1", "user", "hash");
      await db.createCharacter("char-1", "acc-1", 0, "Hero");
      await db.deleteCharacter("char-1");
      const chars = await db.getCharactersByAccount("acc-1");
      expect(chars.length).toBe(0);
    });

    it("gets character by id", async () => {
      await db.createAccount("acc-1", "user", "hash");
      await db.createCharacter("char-1", "acc-1", 0, "Hero");
      const char = await db.getCharacter("char-1");
      expect(char).not.toBeNull();
      expect(char!.displayName).toBe("Hero");
      expect(char!.level).toBe(1);
    });

    it("updates character stats", async () => {
      await db.createAccount("acc-1", "user", "hash");
      await db.createCharacter("char-1", "acc-1", 0, "Hero");
      await db.updateCharacterStats("char-1", 5, 3, 10);
      const char = await db.getCharacter("char-1");
      expect(char!.wins).toBe(5);
      expect(char!.losses).toBe(3);
      expect(char!.level).toBe(10);
    });
  });
});
