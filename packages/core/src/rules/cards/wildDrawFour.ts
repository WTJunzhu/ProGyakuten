import type { PlayedCardEffectContext } from "./shared";

export function applyWildDrawFourEffect({ state }: PlayedCardEffectContext): void {
  state.drawCardStack += 4;
}
