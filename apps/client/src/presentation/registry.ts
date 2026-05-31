import type { PresentationConfig } from "./types";

/**
 * 演出注册表：key = 演出 ID，value = 配置。
 * 加入新演出只需在此处追加一条记录；资源文件放到对应 /public/ 子目录。
 */
export const PRESENTATION_REGISTRY: Record<string, PresentationConfig> = {

  // ── 牌效音效（客户端自行推断触发）──────────────────────────
  "card.reverse": {
    id: "card.reverse",
    audio: { src: "/audio/sfx/reverse_igiari.mp3", volume: 0.78 },
    priority: 0
  },
  "card.skip": {
    id: "card.skip",
    audio: { src: "/audio/sfx/skip_matta.mp3", volume: 0.78 },
    priority: 0
  },
  "card.draw_two": {
    id: "card.draw_two",
    audio: { src: "/audio/sfx/draw_stack_kurae.mp3", volume: 0.78 },
    priority: 0
  },
  "card.wild_draw_four": {
    id: "card.wild_draw_four",
    audio: { src: "/audio/sfx/draw_stack_kurae.mp3", volume: 0.78 },
    priority: 0
  },

  // ── 角色技能（服务端通过 presentationHint 触发）─────────────
  "skill.naruhodou.judgment": {
    id: "skill.naruhodou.judgment",
    audio: { src: "/audio/sfx/龙之介在这.mp3", volume: 0.85 },
    // visual: 待补充立绘动图
    // visual: { type: "gif", src: "/animations/naruhodou_judgment.gif", position: "corner" },
    priority: 1,
    durationMs: 2500
  },

  // ── 游戏流程（gameStore 直接触发）───────────────────────────
  "game.intro": {
    id: "game.intro",
    // visual: { type: "video", src: "/video/game_intro.mp4", position: "fullscreen" },
    // 开局视频资源就绪后取消注释，同时设 blockInput: true
    priority: 10,
    blockInput: false,
    durationMs: 0
  },
  "game.result.win": {
    id: "game.result.win",
    // visual: { type: "gif", src: "/animations/result_win.gif", position: "center" },
    priority: 5,
    durationMs: 0
  },
  "game.result.lose": {
    id: "game.result.lose",
    // visual: { type: "gif", src: "/animations/result_lose.gif", position: "center" },
    priority: 5,
    durationMs: 0
  }
};

export function getPresentationConfig(id: string): PresentationConfig | null {
  return PRESENTATION_REGISTRY[id] ?? null;
}
