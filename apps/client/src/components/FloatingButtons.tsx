import { useState } from "react";
import { useGameStore } from "../stores/gameStore";
import { RulesOverlay } from "./RulesOverlay";
import { AudioPanel } from "./AudioPanel";

interface Props {
  logCollapsed: boolean;
  onToggleLog: () => void;
}

export function FloatingButtons({ logCollapsed, onToggleLog }: Props) {
  const view = useGameStore((s) => s.view);
  const [showRules, setShowRules] = useState(false);
  const [showAudio, setShowAudio] = useState(false);

  return (
    <>
      {/* Rules toggle - top left, all views except title */}
      {view !== "title" && (
        <button
          className="rules-toggle-btn"
          onClick={() => setShowRules(true)}
        >
          规则
        </button>
      )}

      {/* Audio toggle - below rules, all views except title */}
      {view !== "title" && (
        <button
          className="audio-toggle-btn"
          onClick={() => setShowAudio((v) => !v)}
        >
          音频
        </button>
      )}

      {/* Audio panel */}
      <AudioPanel visible={showAudio} />

      {/* Log toggle - top right, game view only */}
      {view === "game" && (
        <button
          className="log-toggle-btn"
          onClick={onToggleLog}
        >
          {logCollapsed ? "显示日志" : "隐藏日志"}
        </button>
      )}

      {/* Rules overlay */}
      {showRules && <RulesOverlay onClose={() => setShowRules(false)} />}
    </>
  );
}
