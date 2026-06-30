import type { CharacterDefinition } from "../types.js";
import type { GameStateInternal } from "../../types.js";

// ──────────────────────────────────────────────────────────────────
// 御琴羽寿沙都
// 技能「连律折减」：主动，无次数限制
// 条件：当前玩家且即将承受的罚摸 ≥ 10 张（drawCardStack ≥ 10）
// 效果：从自己手中打出一张数字牌 X，把罚摸数变为 max(0, 10 - X)
//       打出的牌 X 移入弃牌堆
// ──────────────────────────────────────────────────────────────────

export const mikotoba: CharacterDefinition = {
  id: "mikotoba",
  name: "御琴羽寿沙都",
  description: "大逆転裁判的助手，聪慧而果断",

  skills: [
    {
      id: "chain_reduction",
      name: "连律折减",
      description:
        "【主动】当自己即将承受的罚摸牌数 ≥ 10 张时，" +
        "打出手中一张数字牌 X，将罚摸数变为 10-X（最少为 0）。打出的牌移入弃牌堆。",
      isActive: true,
      inputType: "card",
      // 无次数限制：不设 maxUsesPerGame

      canActivate(state: GameStateInternal, playerId: string): boolean {
        if (state.drawCardStack < 10) return false;
        // 只在自己回合（即将承受罚摸时）可用
        const current = state.players[state.currentPlayerIndex];
        if (current.playerId !== playerId) return false;
        // 手中有数字牌
        return state.players
          .find((p) => p.playerId === playerId)
          ?.hand.some((c) => c.kind === "number") ?? false;
      },

      onActivate(state: GameStateInternal, playerId: string, payload?: unknown) {
        const { cardId } = (payload ?? {}) as { cardId?: string };
        if (!cardId) {
          return { ok: false, code: "INVALID_ACTION" as const, message: "请选择要打出的数字牌" };
        }

        const player = state.players.find((p) => p.playerId === playerId);
        if (!player) {
          return { ok: false, code: "INVALID_ACTION" as const, message: "玩家不存在" };
        }

        const cardIdx = player.hand.findIndex((c) => c.id === cardId);
        if (cardIdx === -1) {
          return { ok: false, code: "INVALID_CARD" as const, message: "手牌中没有该牌" };
        }

        const card = player.hand[cardIdx];
        if (card.kind !== "number" || typeof card.value !== "number") {
          return { ok: false, code: "INVALID_CARD" as const, message: "只能打出数字牌" };
        }

        const before = state.drawCardStack;
        const newPenalty = Math.max(0, 10 - card.value);

        // 移除手牌，入弃牌堆
        player.hand.splice(cardIdx, 1);
        state.discardPile.push(card);
        state.drawCardStack = newPenalty;

        return {
          ok: true,
          announcements: [
            `${playerId} 发动「连律折减」，打出数字 ${card.value}，` +
              `罚摸从 ${before} 张减至 ${newPenalty} 张。`
          ]
        };
      }
    }
  ]
};
