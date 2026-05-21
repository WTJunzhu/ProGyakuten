import { useGameStore } from "../stores/gameStore";

export function TitleScreen() {
  const setView = useGameStore((s) => s.setView);

  return (
    <div className="title-view" onClick={() => setView("login")}>
      <div className="title-shell">
        <div className="title-logo">
          逆转
          <span className="title-logo-sub">UNO</span>
        </div>
        <div className="title-tagline">组队对抗版 UNO</div>
        <div className="title-start-hint">点击任意处开始游戏</div>
      </div>
    </div>
  );
}
