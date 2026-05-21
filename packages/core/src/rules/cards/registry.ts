import type { CardKind } from "@pro-gyakuten/protocol";
import { applyDrawTwoEffect } from "./drawTwo";
import { applyNumberEffect } from "./number";
import { applyReverseEffect } from "./reverse";
import { applySkipEffect } from "./skip";
import type { PlayedCardEffectContext } from "./shared";
import { applyWildEffect } from "./wild";
import { applyWildDrawFourEffect } from "./wildDrawFour";

export type PlayedCardEffect = (context: PlayedCardEffectContext) => void;

export const playedCardEffects: Record<CardKind, PlayedCardEffect> = {
  number: applyNumberEffect,
  skip: applySkipEffect,
  reverse: applyReverseEffect,
  draw_two: applyDrawTwoEffect,
  wild: applyWildEffect,
  wild_draw_four: applyWildDrawFourEffect
};
