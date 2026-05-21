import type { PlayedCardEffectContext } from "./shared";

export function applyReverseEffect({ state }: PlayedCardEffectContext): void {
  state.direction *= -1;
}
