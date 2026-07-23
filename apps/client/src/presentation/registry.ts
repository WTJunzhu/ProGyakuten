import type { PresentationConfig } from "./types";

/**
 * 演出注册表：key = 演出 ID，value = 配置。
 * 加入新演出只需在此处追加一条记录；资源文件放到对应 /public/ 子目录。
 */
export const PRESENTATION_REGISTRY: Record<string, PresentationConfig> = {

  // ── 牌效视频（客户端自行推断触发）──────────────────────────
  "card.reverse": {
    id: "card.reverse",
    visual: { type: "video", src: "/video/reverse_igiari.mp4", position: "center" },
    priority: 0
  },
  "card.skip": {
    id: "card.skip",
    visual: { type: "video", src: "/video/skip_matta.mp4", position: "center" },
    priority: 0
  },
  "card.draw_two": {
    id: "card.draw_two",
    visual: { type: "video", src: "/video/draw_stack_kurae.mp4", position: "center" },
    priority: 0
  },
  "card.wild_draw_four": {
    id: "card.wild_draw_four",
    visual: { type: "video", src: "/video/draw_stack_kurae.mp4", position: "center" },
    priority: 0
  },

  // ── 游戏流程（gameStore 直接触发）───────────────────────────
  "game.intro": {
    id: "game.intro",
    // 方案A：有声视频（推荐）
    // visual: { type: "video", src: "/video/game_intro.mp4", position: "fullscreen" },
    // 方案B：GIF + 独立音效（二选一，素材就绪后取消对应注释）
    // visual: { type: "gif", src: "/animations/game_intro.gif", position: "center" },
    // audio: { src: "/audio/sfx/game_start.mp3", volume: 0.85 },
    priority: 10,
    blockInput: true,
    durationMs: 0
  }

  // ── 结算画面已改用 CSS 背景图（.settlement-overlay.result-win / .result-lose）──
  // ── 角色技能因角色系统已关闭，暂不注册 ──────────────────────
};

export function getPresentationConfig(id: string): PresentationConfig | null {
  return PRESENTATION_REGISTRY[id] ?? null;
}
