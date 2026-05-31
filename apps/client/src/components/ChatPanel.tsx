import { useState, useEffect, useRef } from "react";
import { useGameStore } from "../stores/gameStore";

interface Props {
  wsSend: (e: unknown) => void;
  /** 是否为独队（2人局，无队友），true 时禁用发送 */
  soloTeam: boolean;
}

export function ChatPanel({ wsSend, soloTeam }: Props) {
  const chatMessages = useGameStore((s) => s.chatMessages);
  const playerId = useGameStore((s) => s.playerId);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 有新消息时自动滚到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || soloTeam) return;
    wsSend({ type: "teamChat", message: trimmed });
    setInput("");
    inputRef.current?.focus();
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="chat-panel">
      <div className="chat-messages" ref={listRef}>
        {chatMessages.length === 0 && (
          <div className="chat-empty">
            {soloTeam ? "2人局无队友，聊天不可用" : "暂无消息，向队友说点什么吧"}
          </div>
        )}
        {chatMessages.map((msg, i) => {
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

      <div className="chat-input-row">
        <input
          ref={inputRef}
          className="chat-input"
          value={input}
          disabled={soloTeam}
          maxLength={200}
          placeholder={soloTeam ? "2人局无法聊天" : "输入消息（Enter 发送）"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
            // 阻止游戏快捷键在聊天框触发
            e.stopPropagation();
          }}
        />
        <button
          className="chat-send-btn"
          disabled={!input.trim() || soloTeam}
          onClick={handleSend}
        >
          发送
        </button>
      </div>
    </div>
  );
}
