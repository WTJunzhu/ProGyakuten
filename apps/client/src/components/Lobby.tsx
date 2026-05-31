import { useState } from "react";
import { useGameStore } from "../stores/gameStore";
import { useToastStore } from "../stores/toastStore";

export function Lobby({ wsSend }: { wsSend: (e: unknown) => void }) {
  const rooms = useGameStore((s) => s.rooms);
  const playerId = useGameStore((s) => s.playerId);
  const [newRoomId, setNewRoomId] = useState("");
  const toast = useToastStore((s) => s.showToast);

  const createRoom = () => {
    const roomId = newRoomId.trim();
    if (!roomId) { toast("请输入房间名", "warning"); return; }
    wsSend({ type: "createRoom", roomId, playerId: "" });
    setNewRoomId("");
  };

  const joinRoom = (roomId: string, status: string) => {
    if (status === "in_game") { toast("该房间已经开局，可以观战", "info"); return; }
    wsSend({ type: "joinRoom", roomId, playerId: "" });
  };

  const spectateRoom = (roomId: string) => {
    wsSend({ type: "joinRoomAsSpectator", roomId });
  };

  const backToMenu = () => {
    useGameStore.getState().resetGame();
    useGameStore.setState({ token: null, selectedCharacterId: null, selectedCharacterName: null });
    useGameStore.getState().setView("login");
  };

  return (
    <div className="center-view">
      <div className="panel center-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0 }}>房间大厅</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => wsSend({ type: "requestLobbyState" })}>刷新</button>
            <button onClick={backToMenu}>返回主菜单</button>
          </div>
        </div>

        <div className="room-list">
          {rooms.length === 0 ? (
            <div className="room-item" style={{ justifyContent: "center" }}>
              当前没有房间，创建一个吧
            </div>
          ) : (
            rooms.map((room) => {
              const inGame = room.status === "in_game";
              return (
                <div key={room.roomId} className="room-item">
                  <div style={{ flex: 1, cursor: inGame ? "default" : "pointer" }}
                       onClick={() => !inGame && joinRoom(room.roomId, room.status)}>
                    <div style={{ fontWeight: 700 }}>{room.roomId}</div>
                    <div className="hint">房主: {room.ownerPlayerId}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {inGame && room.spectatorCount !== undefined && room.spectatorCount > 0 && (
                      <span className="hint" style={{ fontSize: 12 }}>👁 {room.spectatorCount}</span>
                    )}
                    <span className={`room-item-status ${room.status}`}>
                      {inGame ? "游戏中" : "等待中"}
                    </span>
                    <span>{room.playerCount} / 6</span>
                    {inGame ? (
                      <button
                        className="spectate-btn"
                        onClick={(e) => { e.stopPropagation(); spectateRoom(room.roomId); }}
                      >观战</button>
                    ) : (
                      <button
                        style={{ padding: "3px 10px", fontSize: 12 }}
                        onClick={() => joinRoom(room.roomId, room.status)}
                      >加入</button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ marginTop: 18, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 18 }}>
          <input
            placeholder="输入新房间名并创建"
            value={newRoomId}
            onChange={(e) => setNewRoomId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createRoom()}
          />
          <button onClick={createRoom}>创建房间</button>
        </div>
      </div>
    </div>
  );
}
