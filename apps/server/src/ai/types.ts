import type { CardColor } from "@pro-gyakuten/protocol";

type NonWildColor = Exclude<CardColor, "wild">;

export type AiDecision =
  | { type: "play"; cardId: string; declaredColor?: NonWildColor }
  | { type: "comboPlay"; wildCardId: string; targetCardId: string; declaredColor: NonWildColor }
  | { type: "draw" }
  | { type: "pass" }
  | { type: "snatch"; cardId: string; declaredColor?: NonWildColor }
  | { type: "comboSnatch"; wildCardId: string; targetCardId: string; declaredColor: NonWildColor }
  | { type: "skipSnatch" }
  | { type: "playDrawn" }
  | { type: "passDrawn" }
  | { type: "useSkill"; skillId: string; payload?: unknown };
