import { useState, useEffect, useRef } from "react";
import { useGameStore } from "../stores/gameStore";
import type { CharacterPublicInfo } from "@pro-gyakuten/protocol";

interface Props {
  wsSend: (e: unknown) => void;
}

function SkillBadge({ label, variant }: { label: string; variant?: "active" | "limited" }) {
  return (
    <span className={`skill-badge${variant ? ` ${variant}` : ""}`}>{label}</span>
  );
}

function CharacterCard({
  character,
  selected,
  confirmed,
  onClick
}: {
  character: CharacterPublicInfo;
  selected: boolean;
  confirmed: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`draft-card${selected ? " selected" : ""}${confirmed ? " confirmed" : ""}`}
      onClick={onClick}
    >
      <div className="draft-portrait-placeholder">立绘</div>
      <div className="draft-char-name">{character.name}</div>
      <div className="draft-char-desc">{character.description}</div>
      <div className="draft-skills">
        {character.skills.map((skill) => (
          <div key={skill.id} className="draft-skill-item">
            <div className="draft-skill-header">
              <span className="draft-skill-name">{skill.name}</span>
              {skill.isActive && <SkillBadge label="主动" variant="active" />}
              {skill.maxUsesPerGame !== undefined && (
                <SkillBadge label={`限${skill.maxUsesPerGame}次`} variant="limited" />
              )}
            </div>
            <div className="draft-skill-desc">{skill.description}</div>
          </div>
        ))}
        {character.skills.length === 0 && (
          <div className="draft-skill-desc" style={{ color: "#666" }}>暂无技能</div>
        )}
      </div>
    </div>
  );
}

export function CharacterDraft({ wsSend }: Props) {
  const options = useGameStore((s) => s.characterDraftOptions);
  const timeoutMs = useGameStore((s) => s.characterDraftTimeoutMs);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timeoutMs / 1000);
  const startRef = useRef(Date.now());
  const autoFiredRef = useRef(false);

  // Sync timeLeft to elapsed time
  useEffect(() => {
    startRef.current = Date.now();
    setTimeLeft(timeoutMs / 1000);
    autoFiredRef.current = false;

    const interval = setInterval(() => {
      const remaining = Math.max(0, (timeoutMs - (Date.now() - startRef.current)) / 1000);
      setTimeLeft(remaining);

      if (remaining <= 0 && !autoFiredRef.current && !confirmed) {
        autoFiredRef.current = true;
        clearInterval(interval);
        // Auto-select first option if nothing chosen
        const fallback = selectedId ?? options[0]?.id;
        if (fallback) {
          setConfirmed(true);
          wsSend({ type: "selectGameCharacter", characterId: fallback });
        }
      }
    }, 100);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutMs]);

  const handleConfirm = () => {
    if (confirmed || !selectedId) return;
    setConfirmed(true);
    wsSend({ type: "selectGameCharacter", characterId: selectedId });
  };

  return (
    <div className="draft-overlay">
      <div className="draft-header">
        <h2 className="draft-title">选择角色</h2>
        <div className={`draft-timer${timeLeft < 10 ? " urgent" : ""}`}>
          {Math.ceil(timeLeft)}s
        </div>
      </div>

      <div className="draft-cards">
        {options.map((char) => (
          <CharacterCard
            key={char.id}
            character={char}
            selected={selectedId === char.id}
            confirmed={confirmed}
            onClick={() => !confirmed && setSelectedId(char.id)}
          />
        ))}
        {options.length === 0 && (
          <div style={{ color: "#aaa", fontSize: 16 }}>等待角色数据...</div>
        )}
      </div>

      <button
        className="draft-confirm-btn"
        disabled={!selectedId || confirmed}
        onClick={handleConfirm}
      >
        {confirmed ? "等待其他玩家选择..." : "确认选择"}
      </button>
    </div>
  );
}
