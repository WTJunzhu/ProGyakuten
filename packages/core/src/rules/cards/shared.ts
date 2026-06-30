import type { Card } from "@pro-gyakuten/protocol";
import type { GameStateInternal, PlayerState } from "../../types.js";

export interface PlayedCardEffectContext {
  state: GameStateInternal;
  player: PlayerState;
  playerId: string;
  card: Card;
  previousCard?: Card;
}
