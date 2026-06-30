import type { PlayedCardEffectContext } from "./shared.js";

export function applyReverseEffect({ state }: PlayedCardEffectContext): void {
  state.direction *= -1;
}
