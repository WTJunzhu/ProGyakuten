import { useGameStore } from "../stores/gameStore";

export function Room({ wsSend }: { wsSend: (e: unknown) => void }) {
  const currentRoomId = useGameStore((s) => s.currentRoomId);
  const roomPlayers = useGameStore((s) => s.roomPlayers);
  const playerId = useGameStore((s) => s.playerId);

  const isOwner = roomPlayers.length > 0 && roomPlayers[0].playerId === playerId;
  const playerCount = roomPlayers.length;
  const canStart = isOwner && [2, 4, 6].includes(playerCount);

  const startGame = () => {
    wsSend({ type: "startGame", playerId: "" });
  };

  const leaveRoom = () => {
    wsSend({ type: "leaveRoom", playerId: "" });
    useGameStore.getState().resetGame();
    useGameStore.getState().setView("lobby");
  };

  return (
    <div className="center-view">
      <div className="panel center-card">
        <h2>房间: {currentRoomId}</h2>
        <div className="lobby-players">
          {roomPlayers.map((p) => (
            <div
              key={p.playerId}
              className="opponent"
              style={{
                minWidth: 160,
                borderColor: p.connected ? "#2ecc71" : "#ff6b6b"
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {p.playerId}{p.playerId === playerId ? " (我)" : ""}
              </div>
              <div className="hint">{p.connected ? "在线" : "离线"}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 16 }}>
          <button onClick={startGame} disabled={!canStart}>开始游戏</button>
          <button onClick={leaveRoom}>退出房间</button>
        </div>
      </div>
    </div>
  );
}
