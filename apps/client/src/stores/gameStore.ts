import { create } from "zustand";
import type {
  Card,
  GamePublicState,
  TurnPhaseInfo,
  AllowedAction,
  LobbyRoomInfo,
  ServerEvent,
  CardColor,
  CharacterPublicInfo,
  SkillInputType,
  ChatScope
} from "@pro-gyakuten/protocol";
import { useToastStore } from "./toastStore";
import { triggerPresentation } from "../presentation/store";
import { playResultBgm, syncGameBgm } from "../audio";

export type View = "title" | "login" | "lobby" | "room" | "game" | "character_draft" | "game_intro";

const SESSIONS_KEY = "new_uno_sessions";
const LAST_PLAYER_KEY = "new_uno_last_player";
const TAB_PLAYER_KEY = "new_uno_tab_player"; // sessionStorage: per-tab player identity

interface SavedSession {
  playerId: string;
  serverUrl: string;
  roomId: string | null;
  token?: string;
  characterId?: string;
  characterName?: string;
}

interface CharacterInfo {
  characterId: string;
  slotIndex: number;
  displayName: string;
  level: number;
  wins: number;
  losses: number;
}

interface GameState {
  view: View;
  setView: (view: View) => void;

  playerId: string;
  setPlayerId: (id: string) => void;

  serverUrl: string;
  setServerUrl: (url: string) => void;

  // Auth
  token: string | null;
  accountId: string | null;
  setAuth: (token: string, accountId: string) => void;

  // Character
  characters: CharacterInfo[];
  selectedCharacterId: string | null;
  selectedCharacterName: string | null;
  setCharacters: (characters: CharacterInfo[]) => void;
  setSelectedCharacter: (characterId: string, displayName: string) => void;

  rooms: LobbyRoomInfo[];

  currentRoomId: string | null;
  setCurrentRoomId: (id: string | null) => void;
  roomPlayers: { playerId: string; seat: number; handCount: number; connected: boolean }[];

  // Session persistence
  savedPlayerId: string | null;
  savedServerUrl: string | null;
  savedRoomId: string | null;
  loadSession: () => SavedSession | null;
  saveSession: () => void;
  clearSession: () => void;

  // Game
  gameState: GamePublicState | null;
  hand: Card[];
  teammateHands: { [playerId: string]: Card[] };
  phase: TurnPhaseInfo | null;
  allowedActions: AllowedAction[];
  lastSeq: number;
  playableDrawnCardId: string | undefined;
  message: string | undefined;

  // Wild combo pending state
  pendingWildCard: Card | null;
  pendingWildColor: Exclude<CardColor, "wild"> | null;
  pendingWildAction: "play" | "snatch" | "combo" | "skill_recolor" | null;
  setPendingWild: (card: Card | null, color: Exclude<CardColor, "wild"> | null, action: "play" | "snatch" | "combo" | "skill_recolor" | null) => void;

  // Skill activation pending state
  pendingSkill: { skillId: string; inputType: SkillInputType } | null;
  setPendingSkill: (skill: { skillId: string; inputType: SkillInputType } | null) => void;

  // Game over
  gameOverState: GamePublicState | null;

  // Log
  logLines: string[];
  addLog: (line: string) => void;

  // Character draft (in-game character selection)
  characterDraftOptions: CharacterPublicInfo[];
  characterDraftTimeoutMs: number;
  characterAssignments: Record<string, CharacterPublicInfo>;

  // Team chat
  chatMessages: { fromPlayerId: string; message: string; scope: ChatScope; timestamp: number }[];

  nextSeq: () => number;
  reorderHand: (fromIndex: number, toIndex: number) => void;

  applyEvent: (event: ServerEvent) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  view: "title",
  setView: (view) => set({ view }),

  playerId: "",
  setPlayerId: (playerId) => set({ playerId }),

  serverUrl: "",
  setServerUrl: (serverUrl) => set({ serverUrl }),

  // Auth
  token: null,
  accountId: null,
  setAuth: (token, accountId) => set({ token, accountId }),

  // Character
  characters: [],
  selectedCharacterId: null,
  selectedCharacterName: null,
  setCharacters: (characters) => set({ characters }),
  setSelectedCharacter: (characterId, displayName) => set({ selectedCharacterId: characterId, selectedCharacterName: displayName, playerId: displayName }),

  rooms: [],

  currentRoomId: null,
  setCurrentRoomId: (currentRoomId) => set({ currentRoomId }),
  roomPlayers: [],

  // Session persistence
  savedPlayerId: null,
  savedServerUrl: null,
  savedRoomId: null,

  loadSession: () => {
    try {
      // Priority: 1) current playerId in store, 2) sessionStorage (per-tab), 3) localStorage (shared fallback)
      const currentPlayerId = get().playerId;
      let session: SavedSession | null = null;

      if (currentPlayerId) {
        const raw = localStorage.getItem(`${SESSIONS_KEY}:${currentPlayerId}`);
        if (raw) session = JSON.parse(raw) as SavedSession;
      }
      if (!session) {
        const tabPlayerId = sessionStorage.getItem(TAB_PLAYER_KEY);
        if (tabPlayerId) {
          const raw = localStorage.getItem(`${SESSIONS_KEY}:${tabPlayerId}`);
          if (raw) session = JSON.parse(raw) as SavedSession;
        }
      }
      if (!session) {
        const lastPlayerId = localStorage.getItem(LAST_PLAYER_KEY);
        if (lastPlayerId) {
          const raw = localStorage.getItem(`${SESSIONS_KEY}:${lastPlayerId}`);
          if (raw) session = JSON.parse(raw) as SavedSession;
        }
      }
      if (!session) return null;

      const serverUrl = session.serverUrl || import.meta.env.VITE_WS_URL || "ws://localhost:3001";
      set({
        savedPlayerId: session.playerId,
        savedServerUrl: serverUrl,
        savedRoomId: session.roomId,
        playerId: session.playerId,
        serverUrl,
        token: session.token ?? null,
        selectedCharacterId: session.characterId ?? null,
        selectedCharacterName: session.characterName ?? null
      });
      // Ensure sessionStorage is set for this tab
      if (session.playerId) {
        sessionStorage.setItem(TAB_PLAYER_KEY, session.playerId);
      }
      return { ...session, serverUrl };
    } catch {
      return null;
    }
  },

  saveSession: () => {
    const { playerId, serverUrl, currentRoomId, token, selectedCharacterId, selectedCharacterName } = get();
    if (!serverUrl) return;
    const key = playerId || token || "anonymous";
    const session: SavedSession = { playerId, serverUrl, roomId: currentRoomId, token: token ?? undefined, characterId: selectedCharacterId ?? undefined, characterName: selectedCharacterName ?? undefined };
    try {
      localStorage.setItem(`${SESSIONS_KEY}:${key}`, JSON.stringify(session));
      localStorage.setItem(LAST_PLAYER_KEY, key);
      sessionStorage.setItem(TAB_PLAYER_KEY, key); // per-tab: remember which player this tab belongs to
      set({ savedPlayerId: playerId, savedServerUrl: serverUrl, savedRoomId: currentRoomId });
    } catch {
      // localStorage full or unavailable
    }
  },

  clearSession: () => {
    const { playerId } = get();
    try {
      if (playerId) {
        localStorage.removeItem(`${SESSIONS_KEY}:${playerId}`);
      }
      sessionStorage.removeItem(TAB_PLAYER_KEY);
    } catch {
      // ignore
    }
    set({ savedPlayerId: null, savedServerUrl: null, savedRoomId: null });
  },

  gameState: null,
  hand: [],
  teammateHands: {},
  phase: null,
  allowedActions: [],
  lastSeq: 0,
  playableDrawnCardId: undefined,
  message: undefined,

  pendingWildCard: null,
  pendingWildColor: null,
  pendingWildAction: null,
  setPendingWild: (card, color, action) => set({ pendingWildCard: card, pendingWildColor: color, pendingWildAction: action }),

  pendingSkill: null,
  setPendingSkill: (skill) => set({ pendingSkill: skill }),

  gameOverState: null,

  logLines: [],
  addLog: (line) => set((s) => ({ logLines: [`[${new Date().toLocaleTimeString()}] ${line}`, ...s.logLines].slice(0, 100) })),

  characterDraftOptions: [],
  characterDraftTimeoutMs: 30000,
  characterAssignments: {},

  chatMessages: [],

  nextSeq: () => {
    const next = get().lastSeq + 1;
    set({ lastSeq: next });
    return next;
  },

  reorderHand: (fromIndex: number, toIndex: number) => {
    const hand = [...get().hand];
    if (fromIndex < 0 || fromIndex >= hand.length || toIndex < 0 || toIndex >= hand.length || fromIndex === toIndex) return;
    const [moved] = hand.splice(fromIndex, 1);
    hand.splice(toIndex, 0, moved);
    set({ hand });
  },

  applyEvent: (event) => {
    const toast = useToastStore.getState().showToast;
    const addLog = get().addLog;

    switch (event.type) {
      case "lobbyState": {
        const currentRoomId = get().currentRoomId;
        const currentView = get().view;
        set({ rooms: event.rooms });
        if (currentView === "lobby" && currentRoomId) {
          const roomStillExists = event.rooms.some((r) => r.roomId === currentRoomId);
          if (!roomStillExists) {
            set({ currentRoomId: null, chatMessages: [] });  // 房间消失时清空聊天
            get().clearSession();
          }
        }
        break;
      }

      case "roomSnapshot": {
        const currentGameOver = get().gameOverState;
        // If players list is empty, the room was dissolved
        if (event.players.length === 0) {
          set({
            currentRoomId: null,
            roomPlayers: [],
            view: "lobby",
            gameState: null,
            hand: [],
            teammateHands: {},
            phase: null,
            allowedActions: [],
            gameOverState: null,
            chatMessages: []    // 离开房间时清空聊天
          });
          get().clearSession();
          // Request fresh lobby state
          const wsSend = (window as unknown as { __wsRef?: { send: (e: unknown) => void } }).__wsRef;
          wsSend?.send({ type: "requestLobbyState" });
          break;
        }
        set({
          currentRoomId: event.roomId,
          roomPlayers: event.players,
          ...(currentGameOver ? {} : { view: "room" })
        });
        get().saveSession();
        break;
      }

      case "gameStart":
        set({
          gameState: event.state,
          hand: event.hand,
          teammateHands: event.teammateHands ?? {},
          phase: event.phase,
          allowedActions: event.allowedActions ?? [],
          lastSeq: typeof event.lastSeq === "number" ? event.lastSeq : 0,
          playableDrawnCardId: event.playableDrawnCardId,
          message: undefined,
          gameOverState: null,
          pendingWildCard: null,
          pendingWildColor: null,
          pendingWildAction: null,
          view: "game"
        });
        triggerPresentation("game.intro");
        get().saveSession();
        break;

      case "statePatch": {
        const prev = get();
        set({
          gameState: event.state,
          hand: event.hand,
          teammateHands: event.teammateHands ?? {},
          phase: event.phase,
          allowedActions: event.allowedActions ?? [],
          lastSeq: typeof event.lastSeq === "number" ? event.lastSeq : prev.lastSeq,
          playableDrawnCardId: event.playableDrawnCardId,
          message: event.message,
          view: "game"
        });
        if (prev.pendingWildCard && !event.hand.some((c) => c.id === prev.pendingWildCard!.id)) {
          set({ pendingWildCard: null, pendingWildColor: null, pendingWildAction: null });
        }
        if (event.message) {
          addLog(event.message);
          toast(event.message, "info");
        }

        // ── 演出触发 ──────────────────────────────────────────────
        if (event.presentationHint) {
          // 服务端指定演出（技能等）
          triggerPresentation(event.presentationHint);
        } else {
          // 客户端推断：弃牌堆顶牌变化 → 牌效音效
          const prevTop = prev.gameState?.topCard;
          if (prevTop && event.state.topCard.id !== prevTop.id) {
            triggerPresentation(`card.${event.state.topCard.kind}`);
          }
        }

        // ── 动态 BGM（优势/劣势切换）────────────────────────────
        syncGameBgm(event.state, prev.playerId);

        get().saveSession();
        break;
      }

      case "gameOver": {
        const playerId = get().playerId;
        const myTeam = event.state.teams.teamA.includes(playerId) ? "teamA" : "teamB";
        const won = event.state.winnerTeam === myTeam;
        set({
          gameOverState: event.state,
          allowedActions: [],
          view: "game"
        });
        addLog(`游戏结束: ${won ? "我方胜利" : "我方失败"}`);
        toast(won ? "我方胜利" : "我方失败", won ? "success" : "warning");
        // 胜负 BGM + 结算演出
        playResultBgm(won);
        triggerPresentation(won ? "game.result.win" : "game.result.lose");
        break;
      }

      case "actionRejected":
        set({ message: event.message });
        addLog(`操作被拒绝: ${event.message}`);
        toast(event.message, "warning");
        break;

      case "authResult":
        if (event.ok && event.token && event.accountId) {
          set({ token: event.token, accountId: event.accountId, view: "lobby" });
          get().saveSession();
          // Request character list
          const wsSend = (window as unknown as { __wsRef?: { send: (e: unknown) => void } }).__wsRef;
          wsSend?.send({ type: "listCharacters", token: event.token });
        } else if (event.error) {
          toast(event.error, "error");
        }
        break;

      case "characterList":
        set({ characters: event.characters });
        // If we don't have a selected character, show character select
        if (!get().selectedCharacterId) {
          set({ view: "lobby" }); // App.tsx will show CharacterSelect when token && !selectedCharacterId
        }
        break;

      case "characterCreated":
        if (event.ok && event.character) {
          const updated = [...get().characters.filter(c => c.characterId !== event.character!.characterId), event.character];
          set({ characters: updated });
          toast(`角色 "${event.character.displayName}" 创建成功`, "success");
        } else if (event.slotFull) {
          toast("角色槽位已满，请选择要覆盖的角色", "warning");
        } else if (event.error) {
          toast(event.error, "error");
        }
        break;

      case "characterSelected":
        if (event.ok && event.characterId && event.displayName) {
          set({ selectedCharacterId: event.characterId, selectedCharacterName: event.displayName, playerId: event.displayName, view: "lobby" });
          get().saveSession();
          // Request lobby state
          const wsSend = (window as unknown as { __wsRef?: { send: (e: unknown) => void } }).__wsRef;
          wsSend?.send({ type: "requestLobbyState" });
        } else if (event.error) {
          toast(event.error, "error");
        }
        break;

      case "characterDraft":
        set({
          characterDraftOptions: event.characters,
          characterDraftTimeoutMs: event.timeoutMs,
          view: "character_draft"
        });
        break;

      case "gameCharacterReveal":
        set({
          characterAssignments: event.assignments,
          view: "game_intro"
        });
        break;

      case "teamChatMessage":
        set((s) => ({
          chatMessages: [
            ...s.chatMessages,
            { fromPlayerId: event.fromPlayerId, message: event.message, timestamp: event.timestamp }
          ].slice(-200)
        }));
        break;

      case "chatMessage":
        set((s) => ({
          chatMessages: [
            ...s.chatMessages,
            { fromPlayerId: event.fromPlayerId, message: event.message, scope: event.scope, timestamp: event.timestamp }
          ].slice(-200)
        }));
        break;
    }
  },

  resetGame: () => {
    set({
      gameState: null,
      hand: [],
      teammateHands: {},
      phase: null,
      allowedActions: [],
      lastSeq: 0,
      playableDrawnCardId: undefined,
      message: undefined,
      gameOverState: null,
      pendingWildCard: null,
      pendingWildColor: null,
      pendingWildAction: null,
      pendingSkill: null,
      characterDraftOptions: [],
      characterAssignments: {}
      // 注意：chatMessages 不在此清空——游戏重开时聊天记录保留
    });
    get().clearSession();
  }
}));
