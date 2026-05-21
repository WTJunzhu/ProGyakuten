import type { GameStateInternal } from "@pro-gyakuten/core";
import type { TurnPhaseInfo, TurnPhase } from "@pro-gyakuten/protocol";
import type { WebSocket } from "ws";

export interface PlayerConn {
  playerId: string;
  ws: WebSocket;
  roomId?: string;
  lastSeenAt: number;
  disconnectedAt?: number;
  isInLobby: boolean;
  token?: string;
  accountId?: string;
  characterId?: string;
  characterName?: string;
}

export interface RoomState {
  roomId: string;
  players: string[];
  ownerPlayerId: string;
  game?: GameStateInternal;
  status: "lobby" | "in_game" | "game_over" | "finished";
  teams: { teamA: string[]; teamB: string[] };
  phase?: TurnPhaseInfo;
  phaseToken: number;
  drawnCardWindow?: {
    playerId: string;
    cardId: string;
    playable: boolean;
    turnId: number;
  };
}

export const PORT = Number(process.env.PORT ?? "3001");
export const HOST = process.env.HOST ?? "0.0.0.0";
export const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS ?? "30000");
export const SNATCH_WINDOW_TIMEOUT_MS = Number(process.env.SNATCH_WINDOW_TIMEOUT_MS ?? "30000");
export const POST_DRAW_WINDOW_TIMEOUT_MS = Number(process.env.POST_DRAW_WINDOW_TIMEOUT_MS ?? "5000");
export const SNATCH_AUTO_SKIP_MS = Number(process.env.SNATCH_AUTO_SKIP_MS ?? "5000");
export const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? "20000");
