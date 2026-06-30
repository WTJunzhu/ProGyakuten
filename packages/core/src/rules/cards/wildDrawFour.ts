import type { PlayedCardEffectContext } from "./shared.js";

export function applyWildDrawFourEffect({ state }: PlayedCardEffectContext): void {
  state.drawCardStack += 4;
  state.penaltySource = "wild_draw_four";
}
