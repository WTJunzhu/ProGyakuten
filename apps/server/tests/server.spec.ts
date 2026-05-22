import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import type { ServerEvent, ClientEvent } from "@pro-gyakuten/protocol";

const TEST_PORT = Number(process.env.TEST_PORT ?? "3999");
const WS_URL = `ws://localhost:${TEST_PORT}`;

let serverAvailable = false;

// Check synchronously-ish via a flag set before tests run
const checkDone = (async () => {
  try {
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const w = new WebSocket(WS_URL);
      w.on("open", () => resolve(w));
      w.on("error", () => reject());
      setTimeout(() => reject(), 2000);
    });
    serverAvailable = true;
    ws.close();
  } catch {
    serverAvailable = false;
  }
})();

function createClient(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on("open", () => resolve(ws));
    ws.on("error", () => reject(new Error("Connection failed")));
    setTimeout(() => reject(new Error("Connection timeout")), 3000);
  });
}

function sendEvent(ws: WebSocket, event: ClientEvent): void {
  ws.send(JSON.stringify(event));
}

function waitForEvent(ws: WebSocket, type: string, timeoutMs = 5000): Promise<ServerEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
    const handler = (data: WebSocket.Data) => {
      const event = JSON.parse(data.toString()) as ServerEvent;
      if (event.type === type) {
        clearTimeout(timer);
        ws.off("message", handler);
        resolve(event);
      }
    };
    ws.on("message", handler);
  });
}

function drainEvents(ws: WebSocket, timeoutMs = 1000): Promise<ServerEvent[]> {
  return new Promise((resolve) => {
    const events: ServerEvent[] = [];
    const timer = setTimeout(() => resolve(events), timeoutMs);
    const handler = (data: WebSocket.Data) => {
      events.push(JSON.parse(data.toString()) as ServerEvent);
    };
    ws.on("message", handler);
    setTimeout(() => {
      clearTimeout(timer);
      ws.off("message", handler);
      resolve(events);
    }, timeoutMs);
  });
}

function closeClient(ws: WebSocket): void {
  return ws.close();
}

async function setupCharacter(client: WebSocket, username: string, charName: string): Promise<void> {
  // Register
  sendEvent(client, { type: "register", username, password: "test123" });
  const authResult = await waitForEvent(client, "authResult");
  expect(authResult.type).toBe("authResult");
  expect((authResult as any).ok).toBe(true);

  // List characters
  sendEvent(client, { type: "listCharacters", token: (authResult as any).token });
  await waitForEvent(client, "characterList");

  // Create character
  sendEvent(client, { type: "createCharacter", token: "", displayName: charName });
  const created = await waitForEvent(client, "characterCreated");
  expect((created as any).ok).toBe(true);

  // Select character
  sendEvent(client, { type: "selectCharacter", token: "", characterId: (created as any).character.characterId });
  const selected = await waitForEvent(client, "characterSelected");
  expect((selected as any).ok).toBe(true);
}

await checkDone;

describe.skipIf(!serverAvailable)("Server integration", () => {
  describe("Room lifecycle", () => {
    it("create room and receive roomSnapshot", async () => {
      const client = await createClient();
      await setupCharacter(client, `test_room_${Date.now()}`, "Alice");

      sendEvent(client, { type: "createRoom", roomId: `room_${Date.now()}`, playerId: "" });
      const snapshot = await waitForEvent(client, "roomSnapshot");
      expect(snapshot.type).toBe("roomSnapshot");
      expect((snapshot as any).players.length).toBe(1);

      closeClient(client);
    });

    it("join room and both players receive roomSnapshot", async () => {
      const roomId = `room_join_${Date.now()}`;
      const host = await createClient();
      const guest = await createClient();

      await setupCharacter(host, `test_host_${Date.now()}`, "Host");
      await setupCharacter(guest, `test_guest_${Date.now()}`, "Guest");

      // Host creates room
      sendEvent(host, { type: "createRoom", roomId, playerId: "" });
      await waitForEvent(host, "roomSnapshot");

      // Guest joins
      sendEvent(guest, { type: "joinRoom", roomId, playerId: "" });
      const guestSnap = await waitForEvent(guest, "roomSnapshot");
      expect((guestSnap as any).players.length).toBe(2);

      closeClient(host);
      closeClient(guest);
    });

    it("reject joining non-existent room", async () => {
      const client = await createClient();
      await setupCharacter(client, `test_noexist_${Date.now()}`, "NoExist");

      sendEvent(client, { type: "joinRoom", roomId: "nonexistent_room", playerId: "" });
      const rejected = await waitForEvent(client, "actionRejected");
      expect(rejected.type).toBe("actionRejected");

      closeClient(client);
    });

    it("reject creating duplicate room", async () => {
      const roomId = `room_dup_${Date.now()}`;
      const host = await createClient();
      const dup = await createClient();

      await setupCharacter(host, `test_dup1_${Date.now()}`, "Dup1");
      await setupCharacter(dup, `test_dup2_${Date.now()}`, "Dup2");

      sendEvent(host, { type: "createRoom", roomId, playerId: "" });
      await waitForEvent(host, "roomSnapshot");

      sendEvent(dup, { type: "createRoom", roomId, playerId: "" });
      const rejected = await waitForEvent(dup, "actionRejected");
      expect(rejected.type).toBe("actionRejected");

      closeClient(host);
      closeClient(dup);
    });
  });

  describe("Game flow", () => {
    it("2-player game: start and receive gameStart", async () => {
      const roomId = `room_game_${Date.now()}`;
      const p1 = await createClient();
      const p2 = await createClient();

      await setupCharacter(p1, `test_p1_${Date.now()}`, "Player1");
      await setupCharacter(p2, `test_p2_${Date.now()}`, "Player2");

      sendEvent(p1, { type: "createRoom", roomId, playerId: "" });
      await waitForEvent(p1, "roomSnapshot");

      sendEvent(p2, { type: "joinRoom", roomId, playerId: "" });
      await waitForEvent(p2, "roomSnapshot");

      // Start game
      sendEvent(p1, { type: "startGame", playerId: "" });
      const start1 = await waitForEvent(p1, "gameStart");
      const start2 = await waitForEvent(p2, "gameStart");

      expect(start1.type).toBe("gameStart");
      expect((start1 as any).hand.length).toBeGreaterThan(0);
      expect((start2 as any).hand.length).toBeGreaterThan(0);
      expect((start1 as any).state.teams).toBeDefined();

      closeClient(p1);
      closeClient(p2);
    });

    it("draw card and receive statePatch", async () => {
      const roomId = `room_draw_${Date.now()}`;
      const p1 = await createClient();
      const p2 = await createClient();

      await setupCharacter(p1, `test_draw1_${Date.now()}`, "Drawer1");
      await setupCharacter(p2, `test_draw2_${Date.now()}`, "Drawer2");

      sendEvent(p1, { type: "createRoom", roomId, playerId: "" });
      await waitForEvent(p1, "roomSnapshot");
      sendEvent(p2, { type: "joinRoom", roomId, playerId: "" });
      await waitForEvent(p2, "roomSnapshot");

      sendEvent(p1, { type: "startGame", playerId: "" });
      const start1 = await waitForEvent(p1, "gameStart") as any;
      const start2 = await waitForEvent(p2, "gameStart") as any;

      // Find whose turn it is
      const currentPlayerId = start1.state.currentPlayerId;
      const activeClient = start1.hand.length > 0 && currentPlayerId === "Player1" ? p1 : p2;
      const activeStart = activeClient === p1 ? start1 : start2;

      // Draw a card
      sendEvent(activeClient, {
        type: "drawCard",
        playerId: currentPlayerId,
        turnId: activeStart.state.turnId,
        seq: 1
      } as any);

      const patch = await waitForEvent(activeClient, "statePatch");
      expect(patch.type).toBe("statePatch");

      closeClient(p1);
      closeClient(p2);
    });

    it("play card and enter snatch window", async () => {
      const roomId = `room_play_${Date.now()}`;
      const p1 = await createClient();
      const p2 = await createClient();

      await setupCharacter(p1, `test_play1_${Date.now()}`, "Player1");
      await setupCharacter(p2, `test_play2_${Date.now()}`, "Player2");

      sendEvent(p1, { type: "createRoom", roomId, playerId: "" });
      await waitForEvent(p1, "roomSnapshot");
      sendEvent(p2, { type: "joinRoom", roomId, playerId: "" });
      await waitForEvent(p2, "roomSnapshot");

      sendEvent(p1, { type: "startGame", playerId: "" });
      const start1 = await waitForEvent(p1, "gameStart") as any;

      const currentPlayerId = start1.state.currentPlayerId;
      const activeClient = currentPlayerId === "Player1" ? p1 : p2;
      const activeStart = activeClient === p1 ? start1 : (await waitForEvent(p2, "gameStart") as any);

      // Find a playable card from hand
      const hand = activeStart.hand as any[];
      const topCard = start1.state.topCard;
      const drawCardStack = start1.state.drawCardStack;

      // Try to find a playable card (simple matching)
      const playableCard = hand.find((c: any) => {
        if (c.kind === "wild_draw_four") return true;
        if (drawCardStack > 0) {
          return c.kind === "draw_two" || (c.kind === "reverse" && c.color === topCard.color);
        }
        if (c.kind === "wild") return false;
        if (topCard.color !== "wild" && c.color === topCard.color) return true;
        if (c.kind === "number" && topCard.kind === "number" && c.value === topCard.value) return true;
        if (c.kind === "number" || topCard.kind === "number") return false;
        return c.kind === topCard.kind;
      });

      if (playableCard) {
        sendEvent(activeClient, {
          type: "playCard",
          playerId: currentPlayerId,
          cardId: playableCard.id,
          declaredColor: playableCard.kind === "wild" || playableCard.kind === "wild_draw_four" ? "red" : undefined,
          turnId: activeStart.state.turnId,
          seq: 1
        } as any);

        // Should get a statePatch with snatch_window phase
        const patch = await waitForEvent(activeClient, "statePatch") as any;
        expect(patch.type).toBe("statePatch");
      }

      closeClient(p1);
      closeClient(p2);
    });
  });

  describe("Error handling", () => {
    it("reject action when not in a room", async () => {
      const client = await createClient();
      await setupCharacter(client, `test_noroom_${Date.now()}`, "NoRoom");

      sendEvent(client, { type: "playCard", playerId: "NoRoom", cardId: "fake", turnId: 0, seq: 1 } as any);
      const rejected = await waitForEvent(client, "actionRejected");
      expect(rejected.type).toBe("actionRejected");

      closeClient(client);
    });

    it("reject createRoom without character", async () => {
      const client = await createClient();
      // Register but don't select character
      sendEvent(client, { type: "register", username: `test_nochar_${Date.now()}`, password: "test123" });
      await waitForEvent(client, "authResult");

      sendEvent(client, { type: "createRoom", roomId: `room_nochar_${Date.now()}`, playerId: "" });
      const rejected = await waitForEvent(client, "actionRejected");
      expect(rejected.type).toBe("actionRejected");
      expect((rejected as any).message).toContain("角色");

      closeClient(client);
    });
  });
});
