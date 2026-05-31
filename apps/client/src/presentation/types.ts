export type PresentationPosition = "fullscreen" | "center" | "corner";

export interface AudioClip {
  src: string;
  volume?: number;
}

export interface VisualClip {
  type: "gif" | "video";
  src: string;
  position: PresentationPosition;
  width?: number;
  height?: number;
  loop?: boolean;
}

export interface PresentationConfig {
  id: string;
  audio?: AudioClip;
  visual?: VisualClip;
  /** 不填时：有音频则跟随音频时长；有视频则跟随视频时长；否则 0（立即结束） */
  durationMs?: number;
  /** 数字越大越重要：0=牌效, 1=技能, 5=结算, 10=开局 */
  priority: number;
  /** true 时 PresentationOverlay 会捕获指针事件，阻断游戏操作 */
  blockInput?: boolean;
}
