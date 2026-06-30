import type { CardKind } from "@pro-gyakuten/protocol";
import { applyDrawTwoEffect } from "./drawTwo.js";
import { applyNumberEffect } from "./number.js";
import { applyReverseEffect } from "./reverse.js";
import { applySkipEffect } from "./skip.js";
import type { PlayedCardEffectContext } from "./shared.js";
import { applyWildEffect } from "./wild.js";
import { applyWildDrawFourEffect } from "./wildDrawFour.js";

export type PlayedCardEffect = (context: PlayedCardEffectContext) => void;

export const playedCardEffects: Record<CardKind, PlayedCardEffect> = {
  number: applyNumberEffect,
  skip: applySkipEffect,
  reverse: applyReverseEffect,
  draw_two: applyDrawTwoEffect,
  wild: applyWildEffect,
  wild_draw_four: applyWildDrawFourEffect
};
