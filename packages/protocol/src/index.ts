export type CardColor = "red" | "yellow" | "blue" | "green" | "wild";
export type CardKind = "number" | "skip" | "reverse" | "draw_two" | "wild" | "wild_draw_four";

export interface Card {
  id: string;
  color: CardColor;
  kind: CardKind;
  value?: number;
}

export interface SpectatorInfo {
  playerId: string;
}

export interface PlayerPublicState {
  playerId: string;
  seat: number;
  handCount: number;
  connected: boolean;
}

export type TurnPhase = "turn_main" | "snatch_window" | "post_draw_window";
export type AllowedAction = "play" | "draw" | "pass" | "callUno" | "check_uno" | "snatch" | "play_drawn" | "skip_snatch" | "use_skill";

export interface TurnPhaseInfo {
  phase: TurnPhase;
  actingPlayerId: string;
  endsAt: number;
  sourcePlayerId?: string;
  drawnCardPlayable?: boolean;
  skippedSnatchPlayerIds?: string[];
}

export interface GamePublicState {
  roomId: string;
  gameId: string;
  turnId: number;
  currentPlayerId: string;
  direction: 1 | -1;
  topCard: Card;
  previousTopCard?: Card;
  players: PlayerPublicState[];
  drawPileCount: number;
  teams: { teamA: string[]; teamB: string[] };
  winnerTeam?: "teamA" | "teamB";
  drawCardStack: number;
  penaltySourceKind?: CardKind;
  skipConstraint?: {
    targetPlayerId: string;
    requiredKind: CardKind;
    requiredValue?: number;
  };
}

export interface CreateRoomEvent {
  type: "createRoom";
  roomId: string;
  playerId: string;
}

export interface JoinRoomEvent {
  type: "joinRoom";
  roomId: string;
  playerId: string;
}

export interface LeaveRoomEvent {
  type: "leaveRoom";
  roomId?: string;
  playerId: string;
}

export interface StartGameEvent {
  type: "startGame";
  roomId?: string;
  playerId: string;
}

export interface PlayCardEvent {
  type: "playCard";
  roomId?: string;
  playerId: string;
  cardId: string;
  declaredColor?: Exclude<CardColor, "wild">;
  turnId: number;
  seq: number;
}

export interface DrawCardEvent {
  type: "drawCard";
  roomId?: string;
  playerId: string;
  turnId: number;
  seq: number;
}

export interface PassTurnEvent {
  type: "passTurn";
  roomId?: string;
  playerId: string;
  turnId: number;
  seq: number;
}

export interface CallUnoEvent {
  type: "callUno";
  roomId?: string;
  playerId: string;
  turnId: number;
  seq: number;
}

export interface CheckUnoEvent {
  type: "checkUno";
  roomId?: string;
  playerId: string;
}

export interface SkipSnatchEvent {
  type: "skipSnatch";
  roomId?: string;
  playerId: string;
}

export interface ReconnectEvent {
  type: "reconnect";
  roomId: string;
  playerId: string;
}

export interface RegisterEvent {
  type: "register";
  username: string;
  password: string;
}

export interface LoginEvent {
  type: "login";
  username: string;
  password: string;
}

export interface ListCharactersEvent {
  type: "listCharacters";
  token: string;
}

export interface CreateCharacterEvent {
  type: "createCharacter";
  token: string;
  displayName: string;
  overwriteSlotIndex?: number;
}

export interface SelectCharacterEvent {
  type: "selectCharacter";
  token: string;
  characterId: string;
}

export interface RequestLobbyStateEvent {
  type: "requestLobbyState";
}

export interface SnatchCardEvent {
  type: "snatchCard";
  roomId?: string;
  playerId: string;
  cardId: string;
  declaredColor?: Exclude<CardColor, "wild">;
}

export interface ComboPlayEvent {
  type: "comboPlay";
  roomId?: string;
  playerId: string;
  wildCardId: string;
  targetCardId: string;
  declaredColor: Exclude<CardColor, "wild">;
  turnId: number;
  seq: number;
}

export interface SelectGameCharacterEvent {
  type: "selectGameCharacter";
  characterId: string;
}

export interface UseSkillEvent {
  type: "useSkill";
  skillId: string;
  payload?: unknown;
}

export type ChatScope = "room" | "team" | "spectator";

export interface ChatEvent {
  type: "chat";
  message: string;
  scope: ChatScope;
}

export interface JoinRoomAsSpectatorEvent {
  type: "joinRoomAsSpectator";
  roomId: string;
}

export interface LeaveSpectatorEvent {
  type: "leaveSpectator";
}

export interface AddAiPlayerEvent {
  type: "addAiPlayer";
}

export interface RemoveAiPlayerEvent {
  type: "removeAiPlayer";
  playerId: string;
}

export type ClientEvent =
  | CreateRoomEvent
  | JoinRoomEvent
  | LeaveRoomEvent
  | StartGameEvent
  | PlayCardEvent
  | DrawCardEvent
  | PassTurnEvent
  | CallUnoEvent
  | CheckUnoEvent
  | SkipSnatchEvent
  | RequestLobbyStateEvent
  | SnatchCardEvent
  | ComboPlayEvent
  | ReconnectEvent
  | RegisterEvent
  | LoginEvent
  | ListCharactersEvent
  | CreateCharacterEvent
  | SelectCharacterEvent
  | SelectGameCharacterEvent
  | UseSkillEvent
  | ChatEvent
  | AddAiPlayerEvent
  | RemoveAiPlayerEvent
  | JoinRoomAsSpectatorEvent
  | LeaveSpectatorEvent;

export interface RoomSnapshotEvent {
  type: "roomSnapshot";
  roomId: string;
  players: PlayerPublicState[];
  status: "lobby" | "character_selection" | "in_game" | "game_over" | "finished";
  spectators?: SpectatorInfo[];
}

export interface GameViewEventBase {
  state: GamePublicState;
  phase: TurnPhaseInfo;
  hand: Card[];
  teammateHands?: { [playerId: string]: Card[] };
  message?: string;
  lastSeq?: number;
  allowedActions?: AllowedAction[];
  playableDrawnCardId?: string;
  /** 客户端演出系统的触发键，对应 PresentationRegistry 中的 id */
  presentationHint?: string;
}

export interface GameStartEvent extends GameViewEventBase {
  type: "gameStart";
}

export interface StatePatchEvent extends GameViewEventBase {
  type: "statePatch";
}

export interface ActionRejectedEvent {
  type: "actionRejected";
  code:
    | "NOT_YOUR_TURN"
    | "INVALID_CARD"
    | "INVALID_ACTION"
    | "SEQ_MISMATCH"
    | "TURN_MISMATCH"
    | "PHASE_RESTRICTED";
  message: string;
}

export interface GameOverEvent {
  type: "gameOver";
  state: GamePublicState;
}

export interface LobbyRoomInfo {
  roomId: string;
  ownerPlayerId: string;
  playerCount: number;
  status: "lobby" | "in_game";
  spectatorCount?: number;
}

export interface LobbyStateEvent {
  type: "lobbyState";
  rooms: LobbyRoomInfo[];
}

export interface AuthResultEvent {
  type: "authResult";
  ok: boolean;
  token?: string;
  accountId?: string;
  error?: string;
}

export interface CharacterListEvent {
  type: "characterList";
  characters: { characterId: string; slotIndex: number; displayName: string; level: number; wins: number; losses: number }[];
  maxSlots: number;
}

export interface CharacterCreatedEvent {
  type: "characterCreated";
  ok: boolean;
  character?: { characterId: string; slotIndex: number; displayName: string; level: number; wins: number; losses: number };
  error?: string;
  slotFull?: boolean;
}

export interface CharacterSelectedEvent {
  type: "characterSelected";
  ok: boolean;
  characterId?: string;
  displayName?: string;
  error?: string;
}

export type SkillInputType = "none" | "target" | "card" | "card_and_color";

export interface CharacterSkillPublicInfo {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  inputType?: SkillInputType;
  maxUsesPerGame?: number;
  maxUsesPerTurn?: number;
  /** 技能发动时在客户端触发的演出 id（对应 PresentationRegistry） */
  presentationId?: string;
}

export interface CharacterPublicInfo {
  id: string;
  name: string;
  description: string;
  skills: CharacterSkillPublicInfo[];
}

export interface CharacterDraftEvent {
  type: "characterDraft";
  characters: CharacterPublicInfo[];
  timeoutMs: number;
}

export interface GameCharacterRevealEvent {
  type: "gameCharacterReveal";
  assignments: Record<string, CharacterPublicInfo>;
}

export interface ChatMessageEvent {
  type: "chatMessage";
  fromPlayerId: string;
  message: string;
  scope: ChatScope;
  timestamp: number;
}

export interface SpectatorJoinedEvent {
  type: "spectatorJoined";
  playerId: string;
}

export interface SpectatorLeftEvent {
  type: "spectatorLeft";
  playerId: string;
}

export interface SpectatorGameSnapshotEvent {
  type: "spectatorGameSnapshot";
  state: GamePublicState;
  phase: TurnPhaseInfo;
  spectators: SpectatorInfo[];
  characterAssignments?: Record<string, CharacterPublicInfo>;
  message?: string;
}

export type ServerEvent =
  | RoomSnapshotEvent
  | GameStartEvent
  | StatePatchEvent
  | ActionRejectedEvent
  | LobbyStateEvent
  | GameOverEvent
  | AuthResultEvent
  | CharacterListEvent
  | CharacterCreatedEvent
  | CharacterSelectedEvent
  | CharacterDraftEvent
  | GameCharacterRevealEvent
  | ChatMessageEvent
  | SpectatorJoinedEvent
  | SpectatorLeftEvent
  | SpectatorGameSnapshotEvent;
