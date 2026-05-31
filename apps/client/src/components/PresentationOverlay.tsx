import { useEffect, useRef } from "react";
import { usePresentationStore } from "../presentation/store";
import { getAudioVolumePercent } from "../audio";

export function PresentationOverlay() {
  const current = usePresentationStore((s) => s.current);
  const dismiss  = usePresentationStore((s) => s.dismiss);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!current) return;

    // ── 播放音效 ────────────────────────────────────────────────
    if (current.audio) {
      const globalVolume = getAudioVolumePercent() / 100;
      const clip = current.audio;
      const audio = new Audio(clip.src);
      audio.volume = (clip.volume ?? 0.78) * globalVolume;
      audioRef.current = audio;

      void audio.play().catch(() => undefined);

      // 如果没有指定 durationMs 且没有视觉层，跟随音频自然时长结束
      if (current.durationMs === undefined && !current.visual) {
        audio.addEventListener("ended", () => dismiss(), { once: true });
        return () => { audio.pause(); audioRef.current = null; };
      }
    }

    // ── 定时结束 ─────────────────────────────────────────────────
    if (current.durationMs !== undefined && current.durationMs > 0) {
      const t = setTimeout(() => dismiss(), current.durationMs);
      return () => {
        clearTimeout(t);
        audioRef.current?.pause();
        audioRef.current = null;
      };
    }

    // durationMs === 0 且有视觉层 → 由视频 onEnded 触发 dismiss
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [current]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 无演出或仅音效（无视觉）时不渲染任何 DOM
  if (!current?.visual) return null;

  const { visual, blockInput } = current;

  return (
    <div
      className={`presentation-overlay pos-${visual.position}`}
      style={{ pointerEvents: blockInput ? "all" : "none" }}
    >
      {visual.type === "gif" && (
        <img
          src={visual.src}
          alt=""
          className="presentation-visual"
          style={{ width: visual.width, height: visual.height }}
        />
      )}
      {visual.type === "video" && (
        <video
          src={visual.src}
          autoPlay
          playsInline
          loop={visual.loop ?? false}
          className="presentation-visual"
          style={{ width: visual.width, height: visual.height }}
          onEnded={() => dismiss()}
        />
      )}
    </div>
  );
}
