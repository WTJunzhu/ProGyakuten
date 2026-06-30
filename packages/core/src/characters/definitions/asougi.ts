import type { CharacterDefinition } from "../types.js";
import type { GameStateInternal } from "../../types.js";
import type { CardColor } from "@pro-gyakuten/protocol";

// ──────────────────────────────────────────────────────────────────
// 亚双义一真
// 技能「七色染刃」：主动，每局一次
// 条件：对方阵营中有人恰好只剩 1 张牌，或有人超过 10 张牌
// 效果：选择自己手中任意一张非 Wild / 非 +4 的牌，指定新颜色
//       该牌颜色立即改变（可在下次出牌时生效）
// ──────────────────────────────────────────────────────────────────

const VALID_COLORS: Exclude<CardColor, "wild">[] = ["red", "yellow", "blue", "green"];

function getEnemyTeam(state: GameStateInternal, playerId: string): string[] {
  return state.teams.teamA.includes(playerId) ? state.teams.teamB : state.teams.teamA;
}

export const asougi: CharacterDefinition = {
  id: "asougi",
  name: "亚双义一真",
  description: "大逆転裁判的剑士，随机应变，化腐朽为神奇",

  skills: [
    {
      id: "seven_color_blade",
      name: "七色染刃",
      description:
        "【主动 · 每局一次】当敌方阵营有人只剩 1 张牌或超过 10 张牌时，" +
        "可随时将手中任意一张牌（非 Wild / 非 +4）变换为指定颜色。",
      isActive: true,
      inputType: "card_and_color",
      maxUsesPerGame: 1,

      canActivate(state: GameStateInternal, playerId: string): boolean {
        const enemies = getEnemyTeam(state, playerId);
        const conditionMet = state.players.some(
          (p) =>
            enemies.includes(p.playerId) &&
            (p.hand.length === 1 || p.hand.length > 10)
        );
        if (!conditionMet) return false;
        // 手中有可变色的牌（非 wild / 非 +4）
        return (
          state.players
            .find((p) => p.playerId === playerId)
            ?.hand.some((c) => c.kind !== "wild" && c.kind !== "wild_draw_four") ?? false
        );
      },

      onActivate(state: GameStateInternal, playerId: string, payload?: unknown) {
        const { cardId, newColor } = (payload ?? {}) as {
          cardId?: string;
          newColor?: Exclude<CardColor, "wild">;
        };

        if (!cardId) {
          return { ok: false, code: "INVALID_ACTION" as const, message: "请选择要变色的牌" };
        }
        if (!newColor || !VALID_COLORS.includes(newColor)) {
          return { ok: false, code: "INVALID_ACTION" as const, message: "请选择有效颜色" };
        }

        const player = state.players.find((p) => p.playerId === playerId);
        if (!player) {
          return { ok: false, code: "INVALID_ACTION" as const, message: "玩家不存在" };
        }

        const card = player.hand.find((c) => c.id === cardId);
        if (!card) {
          return { ok: false, code: "INVALID_CARD" as const, message: "手牌中没有该牌" };
        }
        if (card.kind === "wild" || card.kind === "wild_draw_four") {
          return {
            ok: false,
            code: "INVALID_CARD" as const,
            message: "Wild 牌和 +4 牌不可变色"
          };
        }

        const oldColor = card.color;
        card.color = newColor;

        return {
          ok: true,
          announcements: [
            `${playerId} 发动「七色染刃」，将手中 [${oldColor}]${card.kind} 变为 [${newColor}]。`
          ]
        };
      }
    }
  ]
};
