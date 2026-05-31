import { create } from "zustand";
import type { PresentationConfig } from "./types";
import { getPresentationConfig } from "./registry";

interface PresentationState {
  current: PresentationConfig | null;
  queue: PresentationConfig[];

  /** 通过 registry id 触发演出 */
  triggerPresentation: (id: string) => void;
  /** 直接传入配置触发演出（跳过 registry 查找） */
  triggerDirect: (config: PresentationConfig) => void;
  /** 当前演出结束，推进到队列下一条 */
  dismiss: () => void;
}

export const usePresentationStore = create<PresentationState>((set, get) => ({
  current: null,
  queue: [],

  triggerPresentation(id) {
    const config = getPresentationConfig(id);
    if (!config) return;
    // durationMs === 0 且无 audio/visual → 不必显示，跳过
    if (config.durationMs === 0 && !config.audio && !config.visual) return;
    get().triggerDirect(config);
  },

  triggerDirect(config) {
    const { current, queue } = get();

    if (!current) {
      set({ current: config });
      return;
    }

    // 新演出优先级更高 → 中断当前，立即播放
    if (config.priority > current.priority) {
      set({ current: config });
      return;
    }

    // 优先级 0（牌效）：队列中只保留一条，避免积压
    if (config.priority === 0) {
      set({ queue: [...queue.filter(c => c.priority > 0), config] });
      return;
    }

    set({ queue: [...queue, config] });
  },

  dismiss() {
    const { queue } = get();
    if (queue.length === 0) {
      set({ current: null });
      return;
    }
    const [next, ...rest] = queue;
    set({ current: next, queue: rest });
  }
}));

/** 便捷导出：在非 React 上下文（gameStore）中触发演出 */
export function triggerPresentation(id: string): void {
  usePresentationStore.getState().triggerPresentation(id);
}
