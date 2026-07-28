import { create } from "zustand";
import type {
  Card,
  DrawEventInfo,
  GamePublicState,
  TurnPhaseInfo,
  AllowedAction,
  LobbyRoomInfo,
  ServerEvent,
  CardColor,
  CharacterPublicInfo,
  SkillInputType,
  ChatScope,
  SpectatorInfo
} from "@pro-gyakuten/protocol";
import { useToastStore } from "./toastStore";
import { triggerPresentation } from "../presentation/store";
import { playResultBgm, stopBgmImmediately, syncGameBgm } from "../audio";

export type View = "title" | "login" | "lobby" | "room" | "game" | "character_draft" | "game_intro";

/** 聚焦放大目标 */
export type FocusTargetType = "player" | "discard" | "player_then_discard";

export interface FocusTarget {
  type: FocusTargetType;
  /** 聚焦的玩家 ID（type 为 player / player_then_discard 时） */
  playerId?: string;
  /** 动画开始时间戳 */
  startedAt: number;
}

const SESSIONS_KEY = "new_uno_sessions";
const LAST_PLAYER_KEY = "new_uno_last_player";
const TAB_PLAYER_KEY = "new_uno_tab_player"; // sessionStorage: per-tab player identity

let drawAnimIdCounter = 0;

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

  // Focus zoom
  focusTarget: FocusTarget | null;
  setFocusTarget: (target: FocusTarget | null) => void;

  // Burst self (自己爆牌时的手牌数居中动画标记)
  burstSelf: boolean;

  // Log
  logLines: string[];
  addLog: (line: string) => void;

  // Character draft (in-game character selection)
  characterDraftOptions: CharacterPublicInfo[];
  characterDraftTimeoutMs: number;
  characterAssignments: Record<string, CharacterPublicInfo>;

  // Team chat
  chatMessages: { fromPlayerId: string; message: string; scope: ChatScope; timestamp: number }[];

  // Spectating
  isSpectating: boolean;
  spectators: SpectatorInfo[];

  // Draw animation queue
  drawAnims: Array<{
    id: number;
    playerId: string;
    count: number;
    currentIndex: number;
    cards?: Card[];  // teammate: card faces; enemy: undefined
    isReplenish?: boolean;  // true = 补牌 (自己补牌也有动画)
  }>;

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

  focusTarget: null,
  setFocusTarget: (target) => set({ focusTarget: target }),

  burstSelf: false,

  logLines: [],
  addLog: (line) => set((s) => ({ logLines: [`[${new Date().toLocaleTimeString()}] ${line}`, ...s.logLines].slice(0, 100) })),

  characterDraftOptions: [],
  characterDraftTimeoutMs: 30000,
  characterAssignments: {},

  chatMessages: [],

  isSpectating: false,
  spectators: [],
  drawAnims: [],

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
      focusTarget: null,
      burstSelf: false,
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
        // Create draw animations from drawEvents
        // Skip own normal draws, but keep own replenish draws (补牌)
        const newDrawAnims = (event.drawEvents ?? [])
          .filter(de => de.isReplenish || de.playerId !== prev.playerId)
          .map(de => ({
            id: ++drawAnimIdCounter,
            playerId: de.playerId,
            count: de.count,
            currentIndex: 0,
            cards: de.cards,
            isReplenish: !!de.isReplenish
          }));
        set({
          gameState: event.state,
          hand: event.hand,
          teammateHands: event.teammateHands ?? {},
          phase: event.phase,
          allowedActions: event.allowedActions ?? [],
          lastSeq: typeof event.lastSeq === "number" ? event.lastSeq : prev.lastSeq,
          playableDrawnCardId: event.playableDrawnCardId,
          message: event.message,
          view: "game",
          drawAnims: [...prev.drawAnims, ...newDrawAnims]
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

        // ── 聚焦放大效果触发 ──────────────────────────────────────
        {
          const myId = prev.playerId;

          // 1) 打出最后一张牌：game.finishing hint
          if (event.presentationHint === "game.finishing") {
            // 立即停止对局 BGM，聚焦效果期间保持安静
            stopBgmImmediately();
            // 找到出完牌的玩家（handCount === 0 或 saidUno 后刚好空手）
            const finishingPlayer = event.state.players.find((p) => p.handCount === 0);
            if (finishingPlayer) {
              if (finishingPlayer.playerId === myId) {
                // 自己：只放大弃牌堆 1.5s
                set({ focusTarget: { type: "discard", startedAt: Date.now() } });
                setTimeout(() => set({ focusTarget: null }), 2000);
              } else {
                // 他人：先聚焦玩家 0.75s → 平移到弃牌堆 0.75s → 收回
                set({ focusTarget: { type: "player_then_discard", playerId: finishingPlayer.playerId, startedAt: Date.now() } });
                setTimeout(() => set({ focusTarget: null }), 2000);
              }
            }
          }

          // 1b) 爆牌判负：game.burst hint
          if (event.presentationHint === "game.burst") {
            stopBgmImmediately();
            // 找到爆牌玩家（手牌最多且≥20）
            const burstPlayer = event.state.players.reduce((worst, p) =>
              p.handCount > (worst?.handCount ?? 0) ? p : worst, event.state.players[0]);
            if (burstPlayer) {
              if (burstPlayer.playerId === myId) {
                // 自己爆牌：不用聚焦，显示手牌数居中动画
                set({ burstSelf: true });
              } else {
                // 他人：聚焦到爆牌玩家的姓名+手牌区
                set({ focusTarget: { type: "player", playerId: burstPlayer.playerId, startedAt: Date.now() } });
                setTimeout(() => set({ focusTarget: null }), 3000);
              }
            }
          }

          // 2) 喊UNO：检测 saidUno 从 false → true（其他玩家）
          if (!event.presentationHint) {
            const prevPlayers = prev.gameState?.players ?? [];
            for (const p of event.state.players) {
              const prevP = prevPlayers.find((pp) => pp.playerId === p.playerId);
              if (prevP && !prevP.saidUno && p.saidUno && p.playerId !== myId) {
                set({ focusTarget: { type: "player", playerId: p.playerId, startedAt: Date.now() } });
                setTimeout(() => set({ focusTarget: null }), 1500);
              }
            }

            // 3) 累积加牌聚焦：
            //    - 打出 +2/+4 继续累积时聚焦（stack 从 >0 继续增加）
            //    - 在加牌连锁中打出 reverse 时聚焦
            //    - 第一张 +2/+4（prevStack=0→新进入累积）不聚焦
            const prevStack = prev.gameState?.drawCardStack ?? 0;
            const newStack = event.state.drawCardStack;
            const topKind = event.state.topCard.kind;
            const isDrawStackRise = newStack > prevStack && prevStack > 0; // 继续累积（非首张）
            const isReverseInChain = topKind === "reverse" && newStack > 0; // 加牌连锁中打出反转
            if (isDrawStackRise || isReverseInChain) {
              set({ focusTarget: { type: "discard", startedAt: Date.now() } });
              setTimeout(() => set({ focusTarget: null }), 1500);
            }
          }
        }

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
          burstSelf: false,
          focusTarget: null,
          view: "game"
        });
        addLog(`游戏结束: ${won ? "我方胜利" : "我方失败"}`);
        toast(won ? "我方胜利" : "我方失败", won ? "success" : "warning");
        // 胜负 BGM
        playResultBgm(won);
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
            { fromPlayerId: event.fromPlayerId, message: event.message, scope: "team" as ChatScope, timestamp: event.timestamp }
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

      case "spectatorGameSnapshot":
        set({
          gameState: event.state,
          phase: event.phase,
          hand: [],
          teammateHands: {},
          allowedActions: [],
          spectators: event.spectators,
          characterAssignments: event.characterAssignments ?? {},
          isSpectating: true,
          view: "game"
        });
        break;

      case "spectatorJoined":
        set((s) => ({
          spectators: s.spectators.some(sp => sp.playerId === event.playerId)
            ? s.spectators
            : [...s.spectators, { playerId: event.playerId }]
        }));
        break;

      case "spectatorLeft":
        set((s) => ({
          spectators: s.spectators.filter(sp => sp.playerId !== event.playerId)
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
      characterAssignments: {},
      chatMessages: [],
      isSpectating: false,
      spectators: [],
      drawAnims: []
    });
    get().clearSession();
  }
}));
