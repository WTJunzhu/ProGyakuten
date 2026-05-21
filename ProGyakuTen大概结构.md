下面按重要性逐个复述所有新建文件的作用。

## 一、根目录配置

**package.json**
Monorepo 根配置。定义了三个 workspace：apps/* 和 packages/*。脚本包括 test:core、test:server、test:integration，分别运行各包的测试。所有子包通过 npm workspace 链接，互相用 @pro-gyakuten/* 作为包名引用。

**tsconfig.base.json**
所有子包共享的 TypeScript 基础配置。Target ES2020，Module ESNext，ModuleResolution Bundler，strict 模式开启。

## 二、packages/protocol — 协议类型定义

**packages/protocol/src/index.ts**
纯类型文件，零运行时代码。定义了客户端和服务器之间通信的所有类型：

- 卡牌类型：Card、CardColor（red/yellow/blue/green/wild）、CardKind（number/skip/reverse/draw_two/wild/wild_draw_four）
- 游戏公共状态：GamePublicState（不含玩家手牌，只有手牌数量）、PlayerPublicState
- 回合阶段：TurnPhase（turn_main/snatch_window/post_draw_window）、TurnPhaseInfo、AllowedAction
- 客户端事件（18种）：CreateRoomEvent、JoinRoomEvent、LeaveRoomEvent、StartGameEvent、PlayCardEvent、DrawCardEvent、PassTurnEvent、CallUnoEvent、CheckUnoEvent、SkipSnatchEvent、SnatchCardEvent、ComboPlayEvent、ReconnectEvent、RequestLobbyStateEvent、RegisterEvent、LoginEvent、ListCharactersEvent、CreateCharacterEvent、SelectCharacterEvent
- 服务器事件（10种）：RoomSnapshotEvent、GameStartEvent、StatePatchEvent、ActionRejectedEvent、LobbyStateEvent、GameOverEvent、AuthResultEvent、CharacterListEvent、CharacterCreatedEvent、CharacterSelectedEvent
- 联合类型：ClientEvent 和 ServerEvent 是所有事件的联合

这个文件是整个项目的"契约"，前后端都依赖它来保证类型安全。

## 三、packages/core — 游戏规则引擎

**packages/core/src/types.ts**
核心内部类型定义：
- GameStateInternal — 完整游戏状态（包含手牌、摸牌堆、弃牌堆、方向、drawCardStack、skipConstraint、teams、rules 等）
- PlayerState — 玩家完整状态（hand、lastSeq、saidUnoForTurnId、missedUnoPending、connected、seat）
- ActionResult — 所有动作的返回值（ok、code、message、announcements、drawnCard）
- COLORS 常量 — 四种颜色

**packages/core/src/setup.ts**
游戏初始化：
- createDeck() — 生成 108 张牌的完整牌组
- createGame(roomId, playerIds, rulesOrOptions?) — 创建游戏实例。处理队伍分配、初始手牌发放、起始顶牌

**packages/core/src/actions.ts**
8 个游戏动作处理器：applyPlayCard、applySnatchCard、applyComboPlay、applyComboSnatch、applyDrawCard、applyPassTurn、applyCallUno、applyCheckUno

**packages/core/src/engine/state.ts**
状态管理工具函数：drawOne、ensureDrawPile、advanceTurn、nextIndex、validateCommon、validatePlayerSeq、finishPlay、replenishPlayerHand、toPublicState、getPlayerHand 等

**packages/core/src/rules/playability.ts**
出牌/抢牌合法性判断：isCardPlayable、isCardSnatchable、isComboPlayable 等

**packages/core/src/rules/cards/** — 卡牌效果注册
- registry.ts — 效果注册表
- number.ts、skip.ts、reverse.ts、drawTwo.ts、wild.ts、wildDrawFour.ts — 各牌效果
- shared.ts — PlayedCardEffectContext 接口

**packages/core/src/modifiers/** — 规则修改系统
- types.ts — GameRuleConfig、GameRuleHookSet
- defaults.ts — 默认配置（allowSnatch=true、maxHandSize=30、unoPenaltyCount=2）

## 四、apps/server — WebSocket 服务器

**apps/server/src/types.ts**
服务器内部类型和配置常量：
- PlayerConn — 连接状态（playerId、ws、roomId、disconnectedAt、token、accountId、characterId、characterName）
- RoomState — 房间状态（players、ownerPlayerId、game、status、teams、phase）
- 环境变量配置：PORT(3001)、TURN_TIMEOUT_MS(30s)、SNATCH_WINDOW_TIMEOUT_MS(30s) 等

**apps/server/src/state.ts**
全局可变状态单例：connections Map、playersById Map、send()

**apps/server/src/room-manager.ts**
房间管理器：封装 rooms Map，提供 create/get/delete 方法

**apps/server/src/auth.ts**
账户认证：register（注册）、login（登录，scrypt 加密）、verifyToken、setTokenCharacter

**apps/server/src/character.ts**
角色管理：listCharacters、createCharacter（最多 3 个槽位）

**apps/server/src/db.ts**
SQLite 数据库初始化（better-sqlite3）

**apps/server/src/persistence.ts**
持久化层：房间、游戏快照、玩家会话、账户、角色的 CRUD 操作

**apps/server/src/db/schema.sql**
数据库 Schema：rooms、room_players、game_snapshots、player_sessions、accounts、characters 表

**apps/server/src/broadcast.ts**
广播和状态构建：roomSnapshot、broadcastToLobby、buildStateEvent、finalizeAction

**apps/server/src/room.ts**
房间管理：setGamePlayerConnected、removePlayerFromLobbyRoom、broadcastRoomSnapshot

**apps/server/src/actions.ts**
允许操作计算和抢牌判断：getAllowedActions、canPlayerSnatch、getSnatchResponders

**apps/server/src/phase.ts**
回合阶段管理：setPhase、startMainTurn、startSnatchWindow、startPostDrawWindow

**apps/server/src/handler.ts**
核心动作路由。根据事件类型和当前阶段分发处理

**apps/server/src/connection.ts**
连接管理：markDisconnected（断线标记+超时清理）、handleReconnect（重连恢复）、handleDisconnect

**apps/server/src/index.ts**
服务器入口：WebSocket 连接管理、事件路由（含注册/登录/角色选择）、断线处理

## 五、apps/client — React 前端

**apps/client/package.json**
依赖：React 19、Zustand 5、@pro-gyakuten/protocol。开发依赖：Vite、TypeScript。

**apps/client/src/main.tsx**
React 入口，StrictMode 包裹 App 组件。

**apps/client/src/utils/websocket.ts**
WebSocket 封装类 GameWebSocket：connect（含 onReconnect 回调）、onEvent、send、close、自动重连（指数退避）

**apps/client/src/stores/gameStore.ts**
Zustand 全局状态存储：
- 导航状态（view: title/login/lobby/room/game）
- 账户认证（token、accountId、setAuth）
- 角色系统（characters、selectedCharacterId、selectedCharacterName）
- 房间（currentRoomId、roomPlayers）
- 游戏状态（gameState、hand、teammateHands、phase、allowedActions）
- 会话持久化（per-player localStorage + per-tab sessionStorage）
- applyEvent — 处理所有服务器事件（含 authResult、characterList、characterCreated、characterSelected）

**apps/client/src/App.tsx**
根组件：建立 WebSocket 连接，onReconnect 回调处理认证/重连/角色选择，根据 view 路由到不同页面

**apps/client/src/components/TitleScreen.tsx**
标题画面，点击进入登录

**apps/client/src/components/LoginScreen.tsx**
登录/注册页：用户名+密码，支持登录和注册两种模式

**apps/client/src/components/CharacterSelect.tsx**
角色选择页：显示已有角色（等级/胜负），创建新角色，满槽时可选择覆盖

**apps/client/src/components/Lobby.tsx**
大厅页：显示房间列表，可创建或加入房间

**apps/client/src/components/Room.tsx**
等待房间：显示玩家列表和在线状态，房主可开始游戏（2/4/6人）

**apps/client/src/components/GameBoard.tsx**
主游戏界面：当前回合/阶段、出牌堆顶牌、玩家状态、操作按钮、手牌区（拖拽+点击出牌）、游戏结束画面

**apps/client/src/components/ColorModal.tsx**
Wild 选色弹窗

**apps/client/src/components/FloatingButtons.tsx**
悬浮按钮：日志面板开关

**apps/client/src/components/RulesOverlay.tsx**
规则说明弹窗

**apps/client/src/components/AudioPanel.tsx**
音频控制面板

**apps/client/src/components/Toast.tsx**
Toast 消息组件

**apps/client/src/audio.ts**
音频控制器。管理 BGM（login_lobby、room_waiting、game_base、game_advantage_、game_disadvantage_、result_win、result_lose）和 SFX（skip_matta、reverse_igiari、draw_stack_kurae 等）。支持音量持久化和场景切换。

## 六、测试文件

**packages/core/tests/core.spec.ts**
单元测试，覆盖：游戏创建、基础流程、skip 约束、罚摸连锁、Wild 组合、补牌机制、UNO 检查、验证逻辑、抢牌、toPublicState

**apps/server/tests/persistence.spec.ts**
持久化层测试
