import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import type { ServerEvent, ClientEvent } from "@pro-gyakuten/protocol";
import { isCardPlayableLite } from "@pro-gyakuten/core";

let server: ChildProcess;
let dataDir: string;
let testPort: number;
let wsUrl: string;

async function openClient(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

async function startServer(): Promise<void> {
  server = spawn(process.execPath, [join(import.meta.dirname, "../dist/index.js")], {
    env: { ...process.env, PORT: String(testPort), HOST: "127.0.0.1", TURSO_URL: `file:${join(dataDir, "game.db")}`, RECONNECT_GRACE_MS: "4000" },
    stdio: "ignore"
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${server.exitCode}`);
    try {
      const ws = await openClient();
      ws.close();
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  throw new Error("Server did not start");
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "gyakuten-test-"));
  const listener = createServer();
  await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  testPort = (listener.address() as { port: number }).port;
  wsUrl = `ws://127.0.0.1:${testPort}`;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  await startServer();
}, 15000);

afterAll(() => {
  server?.kill();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

function createClient(): Promise<WebSocket> {
  return openClient();
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
  (client as any).__token = (authResult as any).token;

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

describe("Server integration", () => {
  describe("Room lifecycle", () => {
    it("requires the original character token to recover a seat", async () => {
      const roomId = `room_reconnect_${Date.now()}`;
      const owner = await createClient();
      sendEvent(owner, { type: "register", username: `owner_${Date.now()}`, password: "test123" });
      const auth = await waitForEvent(owner, "authResult");
      if (auth.type !== "authResult" || !auth.token) throw new Error("registration failed");
      sendEvent(owner, { type: "createCharacter", token: auth.token, displayName: "ReconnectOwner" });
      const created = await waitForEvent(owner, "characterCreated");
      if (created.type !== "characterCreated" || !created.character) throw new Error("character creation failed");
      sendEvent(owner, { type: "selectCharacter", token: auth.token, characterId: created.character.characterId });
      await waitForEvent(owner, "characterSelected");
      sendEvent(owner, { type: "createRoom", roomId, playerId: "ReconnectOwner" });
      await waitForEvent(owner, "roomSnapshot");

      const impostor = await createClient();
      sendEvent(impostor, { type: "reconnect", roomId, playerId: "ReconnectOwner", token: "invalid" });
      expect((await waitForEvent(impostor, "actionRejected")).type).toBe("actionRejected");
      sendEvent(impostor, { type: "register", username: `impostor_${Date.now()}`, password: "test123" });
      const impostorAuth = await waitForEvent(impostor, "authResult");
      if (impostorAuth.type !== "authResult" || !impostorAuth.token) throw new Error("registration failed");
      sendEvent(impostor, { type: "createCharacter", token: impostorAuth.token, displayName: "ReconnectOwner" });
      const impostorCharacter = await waitForEvent(impostor, "characterCreated");
      if (impostorCharacter.type !== "characterCreated" || !impostorCharacter.character) throw new Error("character creation failed");
      sendEvent(impostor, { type: "selectCharacter", token: impostorAuth.token, characterId: impostorCharacter.character.characterId });
      await waitForEvent(impostor, "characterSelected");
      sendEvent(impostor, { type: "reconnect", roomId, playerId: "ReconnectOwner", token: impostorAuth.token });
      expect((await waitForEvent(impostor, "actionRejected")).type).toBe("actionRejected");

      const recovered = await createClient();
      sendEvent(recovered, { type: "reconnect", roomId, playerId: "ReconnectOwner", token: auth.token });
      expect((await waitForEvent(recovered, "roomSnapshot")).type).toBe("roomSnapshot");
      owner.close();
      sendEvent(recovered, { type: "requestLobbyState" });
      expect((await waitForEvent(recovered, "lobbyState")).type).toBe("lobbyState");
      impostor.close();
      recovered.close();
    });

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
    it("restores an active game after a player reconnects", async () => {
      const roomId = `room_game_reconnect_${Date.now()}`;
      const p1 = await createClient();
      const p2 = await createClient();
      await setupCharacter(p1, `test_game_reconnect1_${Date.now()}`, "GameReconnect1");
      await setupCharacter(p2, `test_game_reconnect2_${Date.now()}`, "GameReconnect2");

      sendEvent(p1, { type: "createRoom", roomId, playerId: "" });
      await waitForEvent(p1, "roomSnapshot");
      sendEvent(p2, { type: "joinRoom", roomId, playerId: "" });
      await waitForEvent(p2, "roomSnapshot");
      const start1Promise = waitForEvent(p1, "gameStart");
      const start2Promise = waitForEvent(p2, "gameStart");
      sendEvent(p1, { type: "startGame", playerId: "" });
      const start1 = await start1Promise as any;
      const start2 = await start2Promise as any;
      const activeClient = start1.state.currentPlayerId === "GameReconnect1" ? p1 : p2;
      const activeStart = activeClient === p1 ? start1 : start2;
      const roomStateBefore = activeStart.state;
      const oldToken = activeClient === p1 ? (p1 as any).__token : (p2 as any).__token;
      const playerId = roomStateBefore.currentPlayerId;
      const replacement = activeClient === p1 ? p1 : p2;

      replacement.close();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const recovered = await createClient();
      const savedToken = oldToken;
      const recoveredSnapshotPromise = waitForEvent(recovered, "roomSnapshot");
      const recoveredStatePromise = waitForEvent(recovered, "statePatch");
      sendEvent(recovered, { type: "reconnect", roomId, playerId, token: savedToken });
      const recoveredSnapshot = await recoveredSnapshotPromise;
      expect(recoveredSnapshot.roomId).toBe(roomId);
      const recoveredState = await recoveredStatePromise;
      expect((recoveredState as any).state.turnId).toBe(roomStateBefore.turnId);
      expect((recoveredState as any).state.currentPlayerId).toBe(roomStateBefore.currentPlayerId);
      recovered.close();
      if (activeClient === p1) p2.close(); else p1.close();
    });

    it("restores an active game after a server restart", async () => {
      const roomId = `room_restart_${Date.now()}`;
      const ownerId = `RestartOwner_${Date.now()}`;
      const guestId = `RestartGuest_${Date.now()}`;
      const owner = await createClient();
      const guest = await createClient();
      await setupCharacter(owner, `restart_owner_${Date.now()}`, ownerId);
      await setupCharacter(guest, `restart_guest_${Date.now()}`, guestId);
      sendEvent(owner, { type: "createRoom", roomId, playerId: ownerId });
      await waitForEvent(owner, "roomSnapshot");
      sendEvent(guest, { type: "joinRoom", roomId, playerId: guestId });
      await waitForEvent(guest, "roomSnapshot");
      const startPromise = waitForEvent(owner, "gameStart");
      sendEvent(owner, { type: "startGame", playerId: ownerId });
      const start = await startPromise;
      if (start.type !== "gameStart") throw new Error("game did not start");
      const ownerToken = (owner as any).__token as string;
      const hand = start.hand;
      const gameId = start.state.gameId;
      const turnId = start.state.turnId;
      server.kill();
      await new Promise<void>(resolve => server.once("exit", () => resolve()));
      await startServer();
      const restored = await createClient();
      const snapshotPromise = waitForEvent(restored, "roomSnapshot");
      const patchPromise = waitForEvent(restored, "statePatch");
      sendEvent(restored, { type: "reconnect", roomId, playerId: ownerId, token: ownerToken });
      const snapshot = await snapshotPromise;
      const patch = await patchPromise;
      expect(snapshot.type).toBe("roomSnapshot");
      if (patch.type !== "statePatch") throw new Error("game state not restored");
      expect(patch.state.gameId).toBe(gameId);
      expect(patch.state.turnId).toBe(turnId);
      expect(patch.hand).toEqual(hand);
      expect(patch.phase.phase).toBe("turn_main");
      restored.close();
    });

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

      const start1Promise = waitForEvent(p1, "gameStart");
      const start2Promise = waitForEvent(p2, "gameStart");
      sendEvent(p1, { type: "startGame", playerId: "" });
      const start1 = await start1Promise as any;
      const start2 = await start2Promise as any;

      const currentPlayerId = start1.state.currentPlayerId;
      const activeClient = currentPlayerId === "Drawer1" ? p1 : p2;
      const activeStart = activeClient === p1 ? start1 : start2;

      // Draw a card
      sendEvent(activeClient, {
        type: "drawCard",
        playerId: currentPlayerId,
        turnId: activeStart.state.turnId,
        seq: 1
      } as any);

      const patch = await waitForEvent(activeClient, "statePatch") as any;
      expect(patch.phase.phase).toBe("post_draw_window");

      closeClient(p1);
      closeClient(p2);
    });

    it("play card and enter snatch window", async () => {
      const roomId = `room_play_${Date.now()}`;
      const p1 = await createClient();
      const p2 = await createClient();

      const firstPlayer = `Play1_${Date.now()}`;
      const secondPlayer = `Play2_${Date.now()}`;
      await setupCharacter(p1, `test_play1_${Date.now()}`, firstPlayer);
      await setupCharacter(p2, `test_play2_${Date.now()}`, secondPlayer);

      sendEvent(p1, { type: "createRoom", roomId, playerId: "" });
      await waitForEvent(p1, "roomSnapshot");
      sendEvent(p2, { type: "joinRoom", roomId, playerId: "" });
      await waitForEvent(p2, "roomSnapshot");

      const start1Promise = waitForEvent(p1, "gameStart");
      const start2Promise = waitForEvent(p2, "gameStart");
      sendEvent(p1, { type: "startGame", playerId: "" });
      const start1 = await start1Promise as any;
      const start2 = await start2Promise as any;
      const currentPlayerId = start1.state.currentPlayerId;
      const activeClient = currentPlayerId === firstPlayer ? p1 : p2;
      const activeStart = activeClient === p1 ? start1 : start2;

      // Find a playable card from hand
      const hand = activeStart.hand as any[];
      const topCard = start1.state.topCard;
      const drawCardStack = start1.state.drawCardStack;

      // Try to find a playable card (simple matching)
      const playableCard = hand.find((c: any) => isCardPlayableLite({
        card: c,
        topCard,
        drawCardStack,
        currentPlayerId,
        playerId: currentPlayerId
      }));

      if (playableCard) {
        const result = Promise.race([
          waitForEvent(activeClient, "statePatch"),
          waitForEvent(activeClient, "actionRejected")
        ]);
        sendEvent(activeClient, {
          type: "playCard",
          playerId: currentPlayerId,
          cardId: playableCard.id,
          declaredColor: playableCard.kind === "wild_draw_four" ? "red" : undefined,
          turnId: activeStart.state.turnId,
          seq: 1
        } as any);

        const patch = await result as any;
        expect(patch.type, patch.message).toBe("statePatch");
        expect(patch.phase.phase).toBe("snatch_window");
      } else {
        expect(hand.length).toBeGreaterThan(0);
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
