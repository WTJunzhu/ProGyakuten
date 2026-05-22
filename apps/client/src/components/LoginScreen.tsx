import { useState } from "react";
import { useGameStore } from "../stores/gameStore";
import { useToastStore } from "../stores/toastStore";

interface Props {
  onConnect: (serverUrl: string) => void;
  wsSend: (e: unknown) => void;
}

export function LoginScreen({ onConnect, wsSend }: Props) {
  const savedServerUrl = useGameStore((s) => s.savedServerUrl);
  const savedPlayerId = useGameStore((s) => s.savedPlayerId);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [localServerUrl, setLocalServerUrl] = useState(() => savedServerUrl ?? import.meta.env.VITE_WS_URL ?? "ws://localhost:3001");
  const [username, setUsername] = useState(() => savedPlayerId ?? "");
  const [password, setPassword] = useState("");
  const setStoreServerUrl = useGameStore((s) => s.setServerUrl);
  const toast = useToastStore((s) => s.showToast);

  const handleSubmit = () => {
    const trimmedUser = username.trim();
    const trimmedUrl = localServerUrl.trim();
    if (!trimmedUser) {
      toast("请输入用户名", "warning");
      return;
    }
    if (!password) {
      toast("请输入密码", "warning");
      return;
    }
    if (!trimmedUrl) {
      toast("请输入服务器地址", "warning");
      return;
    }
    setStoreServerUrl(trimmedUrl);
    onConnect(trimmedUrl);
    // Auth event will be sent after WebSocket connects (handled in App.tsx)
    // Store credentials temporarily for the post-connect callback
    (window as unknown as { __pendingAuth: { mode: string; username: string; password: string } }).__pendingAuth = { mode, username: trimmedUser, password };
  };

  return (
    <div className="center-view">
      <div className="panel center-card">
        <h1>逆转 UNO 联机对战</h1>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => setMode("login")}
            style={{ flex: 1, opacity: mode === "login" ? 1 : 0.5 }}
          >
            登录
          </button>
          <button
            onClick={() => setMode("register")}
            style={{ flex: 1, opacity: mode === "register" ? 1 : 0.5 }}
          >
            注册
          </button>
        </div>
        <input
          placeholder="服务器地址"
          value={localServerUrl}
          onChange={(e) => setLocalServerUrl(e.target.value)}
        />
        <input
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={handleSubmit}>
          {mode === "login" ? "登录" : "注册"}
        </button>
      </div>
    </div>
  );
}
