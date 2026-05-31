import type { CharacterDefinition } from "../types";
import type { GameStateInternal } from "../../types";
import { drawOne, ensureDrawPile } from "../../engine/state";

// ──────────────────────────────────────────────────────────────────
// 成步堂龙之介
// 技能「天降神判」：被动，每局一次
// 条件：敌方任意玩家恰好只剩 1 张牌
// 效果：从牌堆翻一张判定牌
//       红色 → 目标摸 2 张
//       非红色 → 无事发生
//       判定牌判定后移入弃牌堆
// ──────────────────────────────────────────────────────────────────

function getEnemyTeam(state: GameStateInternal, playerId: string): string[] {
  return state.teams.teamA.includes(playerId) ? state.teams.teamB : state.teams.teamA;
}

export const naruhodou: CharacterDefinition = {
  id: "naruhodou",
  name: "成步堂龙之介",
  description: "大逆転裁判的主角，以锐利的眼光看穿真相",

  skills: [
    {
      id: "divine_judgment",
      name: "天降神判",
      description:
        "【被动 · 每局一次】当敌方有人只剩 1 张牌时，可立刻进行判定：" +
        "翻开牌堆顶一张牌，红色则对方摸 2 张，其他颜色无事发生。判定牌移入弃牌堆。",
      isActive: true,    // 需要玩家点击触发（虽说是"被动"概念，但交互上是主动点击）
      inputType: "target",
      maxUsesPerGame: 1,
      presentationId: "skill.naruhodou.judgment",

      canActivate(state: GameStateInternal, playerId: string): boolean {
        const enemies = getEnemyTeam(state, playerId);
        return state.players.some(
          (p) => enemies.includes(p.playerId) && p.hand.length === 1
        );
      },

      onActivate(state: GameStateInternal, playerId: string, payload?: unknown) {
        const { targetPlayerId } = (payload ?? {}) as { targetPlayerId?: string };
        if (!targetPlayerId) {
          return { ok: false, code: "INVALID_ACTION" as const, message: "请选择目标玩家" };
        }

        const enemies = getEnemyTeam(state, playerId);
        if (!enemies.includes(targetPlayerId)) {
          return { ok: false, code: "INVALID_ACTION" as const, message: "只能对敌方玩家发动" };
        }

        const target = state.players.find((p) => p.playerId === targetPlayerId);
        if (!target || target.hand.length !== 1) {
          return {
            ok: false,
            code: "INVALID_ACTION" as const,
            message: "目标必须恰好只剩 1 张牌"
          };
        }

        // 翻判定牌
        ensureDrawPile(state);
        const judgmentCard = state.drawPile.pop();
        if (!judgmentCard) {
          return { ok: false, code: "INVALID_ACTION" as const, message: "牌堆已空" };
        }

        // 判定牌入弃牌堆
        state.discardPile.push(judgmentCard);

        const isRed = judgmentCard.color === "red";
        if (isRed) {
          drawOne(state, target);
          drawOne(state, target);
        }

        return {
          ok: true,
          announcements: [
            `${playerId} 发动「天降神判」，判定牌为 [${judgmentCard.color}]${judgmentCard.kind}，` +
              (isRed
                ? `${targetPlayerId} 摸 2 张牌。`
                : "无事发生。")
          ]
        };
      }
    }
  ]
};
