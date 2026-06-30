import type { PlayedCardEffectContext } from "./shared.js";

export function applyDrawTwoEffect({ state }: PlayedCardEffectContext): void {
  state.drawCardStack += 2;
  state.penaltySource = "draw_two";
}
