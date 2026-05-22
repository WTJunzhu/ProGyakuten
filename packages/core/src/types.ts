import type { Card, CardColor, CardKind } from "@pro-gyakuten/protocol";
import type { GameRules } from "./modifiers/types";

export interface PlayerState {
  playerId: string;
  seat: number;
  hand: Card[];
  connected: boolean;
  saidUnoForTurnId?: number;
  missedUnoPending?: boolean;
  lastSeq: number;
}

export interface GameStateInternal {
  roomId: string;
  gameId: string;
  turnId: number;
  currentPlayerIndex: number;
  direction: 1 | -1;
  drawPile: Card[];
  discardPile: Card[];
  players: PlayerState[];
  teams: { teamA: string[]; teamB: string[] };
  winnerTeam?: "teamA" | "teamB";
  drawCardStack: number;
  penaltySource: CardKind | null;
  skipConstraint?: {
    targetPlayerId: string;
    requiredKind: CardKind;
    requiredValue?: number;
  };
  wildBridge?: { kind: CardKind; value?: number; color: CardColor };
  rules: GameRules;
}

export interface ActionResult {
  ok: boolean;
  code?:
    | "NOT_YOUR_TURN"
    | "INVALID_CARD"
    | "INVALID_ACTION"
    | "SEQ_MISMATCH"
    | "TURN_MISMATCH"
    | "PHASE_RESTRICTED";
  message?: string;
  drawnCard?: Card;
  announcements?: string[];
}

export const COLORS: Exclude<CardColor, "wild">[] = ["red", "yellow", "blue", "green"];
