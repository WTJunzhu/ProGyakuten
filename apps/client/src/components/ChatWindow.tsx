import { useState, useEffect, useRef } from "react";
import { useGameStore } from "../stores/gameStore";
import type { ChatScope } from "@pro-gyakuten/protocol";

interface Props {
  wsSend: (e: unknown) => void;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function ChatWindow({ wsSend }: Props) {
  const chatMessages = useGameStore((s) => s.chatMessages);
  const playerId     = useGameStore((s) => s.playerId);
  const gameState    = useGameStore((s) => s.gameState);

  const [collapsed, setCollapsed]     = useState(false);
  const [activeTab, setActiveTab]     = useState<ChatScope>("room");
  const [input, setInput]             = useState("");
  const [unreadRoom, setUnreadRoom]   = useState(0);
  const [unreadTeam, setUnreadTeam]   = useState(0);

  const listRef    = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const prevLen    = useRef({ room: 0, team: 0 });

  // 游戏开始后才能确定队伍（先判断 soloTeam）
  const myTeam = gameState
    ? (gameState.teams.teamA.includes(playerId) ? "teamA" : "teamB")
    : null;
  const myTeammates = myTeam && gameState
    ? (myTeam === "teamA" ? gameState.teams.teamA : gameState.teams.teamB)
        .filter((id) => id !== playerId)
    : [];
  const soloTeam    = myTeammates.length === 0;
  const gameStarted = !!gameState;

  const roomMsgs = chatMessages.filter((m) => m.scope === "room");
  const teamMsgs = chatMessages.filter((m) => m.scope === "team");
  const activeMsgs = activeTab === "room" ? roomMsgs : teamMsgs;
  const totalUnread = unreadRoom + unreadTeam;

  // 未读计数
  useEffect(() => {
    const nr = roomMsgs.length;
    const nt = teamMsgs.length;

    if (collapsed) {
      if (nr > prevLen.current.room) setUnreadRoom((n) => n + nr - prevLen.current.room);
      if (nt > prevLen.current.team) setUnreadTeam((n) => n + nt - prevLen.current.team);
    } else {
      if (activeTab !== "room" && nr > prevLen.current.room)
        setUnreadRoom((n) => n + nr - prevLen.current.room);
      if (activeTab !== "team" && nt > prevLen.current.team)
        setUnreadTeam((n) => n + nt - prevLen.current.team);
    }

    prevLen.current = { room: nr, team: nt };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages.length]);

  // 自动滚到底部
  useEffect(() => {
    if (!collapsed && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [chatMessages, activeTab, collapsed]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (activeTab === "team" && (!gameStarted || soloTeam)) return;
    wsSend({ type: "chat", message: trimmed, scope: activeTab });
    setInput("");
    inputRef.current?.focus();
  };

  const switchTab = (tab: ChatScope) => {
    setActiveTab(tab);
    if (tab === "room") setUnreadRoom(0);
    else setUnreadTeam(0);
  };

  // ── 折叠状态：仅显示一个悬浮按钮 ──────────────────────────
  if (collapsed) {
    return (
      <button
        className="chat-fab"
        onClick={() => { setCollapsed(false); setUnreadRoom(0); setUnreadTeam(0); }}
        title="展开聊天"
      >
        💬
        {totalUnread > 0 && (
          <span className="chat-fab-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>
        )}
      </button>
    );
  }

  // ── 展开状态 ──────────────────────────────────────────────
  const teamTabDisabled = !gameStarted || soloTeam;
  const teamTabTitle    = !gameStarted
    ? "游戏开始后可用"
    : soloTeam
      ? "2人局无队友"
      : undefined;

  const inputDisabled = activeTab === "team" && teamTabDisabled;
  const inputPlaceholder = inputDisabled
    ? (teamTabTitle ?? "不可用")
    : `发送给${activeTab === "room" ? "所有人" : "队友"}（Enter 发送）`;

  return (
    <div className="chat-window">
      {/* 标题栏 */}
      <div className="chat-window-header">
        <div className="chat-win-tabs">
          <button
            className={activeTab === "room" ? "active" : ""}
            onClick={() => switchTab("room")}
          >
            全员
            {unreadRoom > 0 && (
              <span className="chat-fab-badge">{unreadRoom > 99 ? "99+" : unreadRoom}</span>
            )}
          </button>
          <button
            className={activeTab === "team" ? "active" : ""}
            disabled={teamTabDisabled}
            title={teamTabTitle}
            onClick={() => !teamTabDisabled && switchTab("team")}
          >
            队伍
            {unreadTeam > 0 && (
              <span className="chat-fab-badge">{unreadTeam > 99 ? "99+" : unreadTeam}</span>
            )}
          </button>
        </div>
        <button className="chat-win-collapse" onClick={() => setCollapsed(true)} title="收起">—</button>
      </div>

      {/* 消息列表 */}
      <div className="chat-messages" ref={listRef}>
        {activeMsgs.length === 0 && (
          <div className="chat-empty">
            {activeTab === "team"
              ? (teamTabTitle ?? "暂无队伍消息")
              : "暂无全员消息，快打个招呼吧"}
          </div>
        )}
        {activeMsgs.map((msg, i) => {
          const isOwn = msg.fromPlayerId === playerId;
          return (
            <div key={i} className={`chat-msg${isOwn ? " own" : ""}`}>
              <div className="chat-msg-header">
                <span className="chat-sender">{isOwn ? "你" : msg.fromPlayerId}</span>
                <span className="chat-time">{formatTime(msg.timestamp)}</span>
              </div>
              <div className="chat-bubble">{msg.message}</div>
            </div>
          );
        })}
      </div>

      {/* 输入行 */}
      <div className="chat-input-row">
        <input
          ref={inputRef}
          className="chat-input"
          value={input}
          disabled={inputDisabled}
          maxLength={200}
          placeholder={inputPlaceholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            e.stopPropagation();
          }}
        />
        <button
          className="chat-send-btn"
          disabled={!input.trim() || inputDisabled}
          onClick={handleSend}
        >
          发送
        </button>
      </div>
    </div>
  );
}
