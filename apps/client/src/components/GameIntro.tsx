import { useGameStore } from "../stores/gameStore";

export function GameIntro() {
  const characterAssignments = useGameStore((s) => s.characterAssignments);
  const entries = Object.entries(characterAssignments);

  return (
    <div className="game-intro-overlay">
      <h2 className="intro-title">游戏即将开始</h2>

      {entries.length > 0 && (
        <div className="intro-reveal">
          <div className="intro-reveal-label">本局角色</div>
          <div className="intro-reveal-list">
            {entries.map(([playerId, char]) => (
              <div key={playerId} className="intro-reveal-item">
                <div className="intro-reveal-portrait">立绘</div>
                <div className="intro-reveal-name">{char.name}</div>
                <div className="intro-reveal-player">{playerId}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="intro-waiting">准备中...</div>
    </div>
  );
}
