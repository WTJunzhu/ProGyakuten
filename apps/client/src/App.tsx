import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "./stores/gameStore";
import { GameWebSocket } from "./utils/websocket";
import { TitleScreen } from "./components/TitleScreen";
import { LoginScreen } from "./components/LoginScreen";
import { CharacterSelect } from "./components/CharacterSelect";
import { Lobby } from "./components/Lobby";
import { Room } from "./components/Room";
import { GameBoard } from "./components/GameBoard";
import { ToastContainer } from "./components/Toast";
import { ColorModal } from "./components/ColorModal";
import { FloatingButtons } from "./components/FloatingButtons";
import { useToastStore } from "./stores/toastStore";
import { initAudioSystem, syncViewBgm, startGameBgmCycle } from "./audio";
import "./styles.css";

export default function App() {
  const view = useGameStore((s) => s.view);
  const applyEvent = useGameStore((s) => s.applyEvent);
  const setView = useGameStore((s) => s.setView);
  const wsRef = useRef<GameWebSocket | null>(null);
  const [wsReady, setWsReady] = useState(false);
  const [logCollapsed, setLogCollapsed] = useState(false);

  const wsSend = useCallback((e: unknown) => {
    wsRef.current?.send(e as never);
  }, []);

  // Init audio system once
  useEffect(() => {
    initAudioSystem();
  }, []);

  // Sync BGM on view change
  useEffect(() => {
    if (view === "title") return;
    if (view === "login" || view === "lobby") {
      syncViewBgm("lobby");
    } else if (view === "room") {
      syncViewBgm("room");
    } else if (view === "game") {
      startGameBgmCycle();
    }
  }, [view]);

  // Connect to server. Auth/character events are sent after connection.
  const handleConnect = useCallback((serverUrl: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new GameWebSocket(serverUrl);
    wsRef.current = ws;

    (window as unknown as { __wsRef: { send: (e: unknown) => void } }).__wsRef = {
      send: (e: unknown) => ws.send(e as never)
    };

    const unsub = ws.onEvent((event) => applyEvent(event));

    ws.onDisconnect(() => {
      useToastStore.getState().showToast("连接断开，正在重连...", "warning");
    });

    ws.onReconnect(() => {
      setWsReady(true);
      const state = useGameStore.getState();

      // Check for pending auth from LoginScreen
      const pending = (window as unknown as { __pendingAuth?: { mode: string; username: string; password: string } }).__pendingAuth;
      if (pending) {
        delete (window as unknown as { __pendingAuth?: unknown }).__pendingAuth;
        ws.send({ type: pending.mode === "register" ? "register" : "login", username: pending.username, password: pending.password });
        return;
      }

      // If we have a token + character, try to reconnect to saved room
      if (state.token && state.selectedCharacterId) {
        const savedRoomId = state.savedRoomId;
        if (savedRoomId) {
          ws.send({ type: "reconnect", roomId: savedRoomId, playerId: state.selectedCharacterName ?? "" });
          setView("room");
        } else {
          ws.send({ type: "listCharacters", token: state.token });
          setView("lobby");
          ws.send({ type: "requestLobbyState" });
        }
      } else if (state.token) {
        // Has token but no character — go to character select
        ws.send({ type: "listCharacters", token: state.token });
        setView("lobby"); // will be overridden to character select by characterList handler
      } else {
        // No token — go to login
        setView("login");
      }
    });

    ws.connect()
      .then(() => {
        useToastStore.getState().showToast("连接服务器成功", "success");
      })
      .catch(() => {
        setWsReady(false);
        useToastStore.getState().showToast("连接服务器失败", "error");
        setView("login");
      });

    return () => {
      unsub();
      ws.close();
    };
  }, [applyEvent, setView]);

  // Attempt session recovery on mount
  useEffect(() => {
    const session = useGameStore.getState().loadSession();
    if (session?.serverUrl) {
      handleConnect(session.serverUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Determine effective view: if we have token but no character, show character select
  const token = useGameStore((s) => s.token);
  const selectedCharacterId = useGameStore((s) => s.selectedCharacterId);
  const effectiveView = (view === "lobby" && token && !selectedCharacterId) ? "character" : view;

  return (
    <>
      {effectiveView === "title" && <TitleScreen />}
      {effectiveView === "login" && <LoginScreen onConnect={handleConnect} wsSend={wsSend} />}
      {effectiveView === "character" && wsReady && <CharacterSelect wsSend={wsSend} />}
      {effectiveView === "lobby" && wsReady && <Lobby wsSend={wsSend} />}
      {effectiveView === "room" && wsReady && <Room wsSend={wsSend} />}
      {effectiveView === "game" && wsReady && <GameBoard wsSend={wsSend} logCollapsed={logCollapsed} />}
      <FloatingButtons logCollapsed={logCollapsed} onToggleLog={() => setLogCollapsed((v) => !v)} />
      <ColorModal />
      <ToastContainer />
    </>
  );
}
