import type { PlayedCardEffectContext } from "./shared";

export function applyDrawTwoEffect({ state }: PlayedCardEffectContext): void {
  state.drawCardStack += 2;
}
