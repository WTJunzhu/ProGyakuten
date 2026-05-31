import { useGameStore } from "../stores/gameStore";

const AI_PREFIX = "AI_";

export function Room({ wsSend }: { wsSend: (e: unknown) => void }) {
  const currentRoomId = useGameStore((s) => s.currentRoomId);
  const roomPlayers   = useGameStore((s) => s.roomPlayers);
  const playerId      = useGameStore((s) => s.playerId);

  const isOwner    = roomPlayers.length > 0 && roomPlayers[0].playerId === playerId;
  const playerCount = roomPlayers.length;
  const canStart   = isOwner && [2, 4, 6].includes(playerCount);
  const canAddAi   = isOwner && playerCount < 6;

  const startGame = () => wsSend({ type: "startGame", playerId: "" });

  const leaveRoom = () => {
    wsSend({ type: "leaveRoom", playerId: "" });
    useGameStore.getState().resetGame();
    useGameStore.getState().setView("lobby");
  };

  const addAi    = () => wsSend({ type: "addAiPlayer" });
  const removeAi = (aiId: string) => wsSend({ type: "removeAiPlayer", playerId: aiId });

  return (
    <div className="center-view">
      <div className="panel center-card">
        <h2>房间: {currentRoomId}</h2>

        <div className="lobby-players">
          {roomPlayers.map((p) => {
            const isAi   = p.playerId.startsWith(AI_PREFIX);
            const isMe   = p.playerId === playerId;
            return (
              <div
                key={p.playerId}
                className="opponent"
                style={{
                  minWidth: 160,
                  borderColor: isAi ? "#9b59b6" : (p.connected ? "#2ecc71" : "#ff6b6b"),
                  position: "relative"
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {isAi ? "🤖 " : ""}{p.playerId}{isMe ? " (我)" : ""}
                </div>
                <div className="hint">{isAi ? "AI 电脑" : (p.connected ? "在线" : "离线")}</div>
                {isOwner && isAi && (
                  <button
                    style={{
                      position: "absolute", top: 4, right: 4,
                      padding: "2px 7px", fontSize: 11,
                      background: "rgba(231,76,60,0.3)", border: "1px solid #e74c3c",
                      borderRadius: 4, cursor: "pointer", color: "#fff"
                    }}
                    onClick={() => removeAi(p.playerId)}
                  >移除</button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button onClick={startGame} disabled={!canStart}>开始游戏</button>
          {isOwner && (
            <button onClick={addAi} disabled={!canAddAi}
              style={{ background: "rgba(155,89,182,0.25)", borderColor: "#9b59b6" }}>
              + 添加 AI
            </button>
          )}
          <button onClick={leaveRoom}>退出房间</button>
        </div>

        {isOwner && (
          <div className="hint" style={{ marginTop: 10, textAlign: "center" }}>
            需要 2 / 4 / 6 人（含 AI）才能开始
          </div>
        )}
      </div>
    </div>
  );
}
