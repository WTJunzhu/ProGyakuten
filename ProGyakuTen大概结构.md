下面按重要性逐个复述所有新建文件的作用。

一、根目录配置
package.json
Monorepo 根配置。定义了三个 workspace：apps/* 和 packages/*。脚本包括 test:core、test:server、test:integration，分别运行各包的测试。所有子包通过 npm workspace 链接，互相用 @pro-gyakuten/* 作为包名引用。

tsconfig.base.json
所有子包共享的 TypeScript 基础配置。Target ES2020，Module ESNext，ModuleResolution Bundler，strict 模式开启。

二、packages/protocol — 协议类型定义
packages/protocol/src/index.ts
纯类型文件，零运行时代码。 定义了客户端和服务器之间通信的所有类型：

卡牌类型：Card、CardColor（red/yellow/blue/green/wild）、CardKind（number/skip/reverse/draw_two/wild/wild_draw_four）
游戏公共状态：GamePublicState（不含玩家手牌，只有手牌数量）、PlayerPublicState
回合阶段：TurnPhase（turn_main/snatch_window/post_draw_window）、TurnPhaseInfo、AllowedAction
客户端事件（13种）：CreateRoomEvent、JoinRoomEvent、LeaveRoomEvent、StartGameEvent、PlayCardEvent、DrawCardEvent、PassTurnEvent、CallUnoEvent、CheckUnoEvent、SkipSnatchEvent、SnatchCardEvent、ComboPlayEvent、ReconnectEvent、RequestLobbyStateEvent
服务器事件（6种）：RoomSnapshotEvent、GameStartEvent、StatePatchEvent、ActionRejectedEvent、LobbyStateEvent、GameOverEvent
联合类型：ClientEvent 和 ServerEvent 是所有事件的联合
这个文件是整个项目的"契约"，前后端都依赖它来保证类型安全。

三、packages/core — 游戏规则引擎
packages/core/src/types.ts
核心内部类型定义：

GameStateInternal — 完整游戏状态（包含手牌、摸牌堆、弃牌堆、方向、drawCardStack、skipConstraint、teams、rules 等）
PlayerState — 玩家完整状态（hand、lastSeq、saidUnoForTurnId、missedUnoPending、connected、seat）
ActionResult — 所有动作的返回值（ok、code、message、announcements、drawnCard）
COLORS 常量 — 四种颜色
packages/core/src/setup.ts
游戏初始化：

createDeck() — 生成 108 张牌的完整牌组（每色 0-9 各两张 + 功能牌 + 6 张 Wild + 6 张 Wild Draw Four）
createGame(roomId, playerIds, rulesOrOptions?) — 创建游戏实例。处理：队伍分配（奇数索引 vs 偶数索引）、初始手牌发放（teamSize+1 张纯数字牌）、找非功能牌作为起始顶牌、应用起始牌效果（skip 跳过、reverse 反转、draw_two 罚摸）
packages/core/src/actions.ts
8 个游戏动作处理器，每个都先验证（validateCommon/validatePlayerSeq），再执行：

applyPlayCard — 出牌。验证→移除手牌→推入弃牌堆→执行卡牌效果→标记 UNO 状态→finishPlay→清除 skip 约束→advanceTurn
applySnatchCard — 抢牌。非当前回合玩家用相同牌抢夺出牌权
applyComboPlay — Wild 组合出牌。Wild + 非 Wild 牌一起打出，Wild 提供颜色，非 Wild 提供功能
applyComboSnatch — Wild 组合抢牌。用 Wild + 拥有牌组合抢夺
applyDrawCard — 摸牌。摸一张但不结束回合（等待 post_draw_window）
applyPassTurn — 跳过/承受罚摸。如果有 drawCardStack 则摸罚牌并清零
applyCallUno — 喊 UNO。在出牌前（2张）或补救漏喊（1张+missedUnoPending）时调用
applyCheckUno — 检查他人漏喊 UNO。检查所有 1 张牌+missedUnoPending 的玩家，罚摸 2 张；如果没有漏喊者，检查者自己罚摸
packages/core/src/engine/state.ts
状态管理工具函数：

drawOne — 从摸牌堆抽一张，如果超过 maxHandSize(30) 则移除最旧的
ensureDrawPile — 摸牌堆空时重新洗牌
advanceTurn — 推进回合（currentPlayerIndex + direction，turnId++）
nextIndex — 计算下一个玩家索引
validateCommon — 验证 playerId、turnId、seq 三重匹配
validatePlayerSeq — 只验证 playerId 和 seq（用于 UNO 喊话等非回合动作）
matchesSkipConstraint — 检查牌是否匹配 skip 约束
clearSkipConstraintIfConsumed — 约束目标玩家出牌后清除约束
alignTurnToSkipConstraint — 将 currentPlayerIndex 对齐到约束目标
finishPlay — 出牌后处理：手牌为 0 则设置 winnerTeam，否则 replenishPlayerHand
replenishPlayerHand — 补牌：如果手牌没有数字牌，持续摸牌直到有数字牌
markUnoStateAfterPlay — 出牌后检查是否需要标记 missedUnoPending
applyUnoCheck — UNO 检查的实际逻辑
toPublicState — 转换为公共状态（隐藏手牌，只保留数量）
getPlayerHand — 获取玩家手牌副本
packages/core/src/rules/playability.ts
出牌/抢牌合法性判断：

isCardPlayable — 考虑颜色/种类/数值匹配、skip 约束、drawCardStack 叠加规则、Wild 组合支持
isCardSnatchable — 牌是否可抢（与顶牌完全匹配：同色同种类同数值）
isExactSnatchMatch — 精确匹配检查
hasWildComboSnatchOption — 手牌中是否有 Wild + 可组合抢牌的非 Wild 牌
isComboPlayable — 组合出牌合法性
packages/core/src/rules/cards/ — 卡牌效果注册
registry.ts — 效果注册表，按 CardKind 映射到处理函数
number.ts — 数字牌无额外效果
skip.ts — 设置 skipConstraint，锁定下一个玩家必须打出与前一张相同种类/数值的牌
reverse.ts — direction *= -1（反转方向）
drawTwo.ts — drawCardStack += 2
wild.ts — Wild 牌效果（设置 wildBridge 颜色）
wildDrawFour.ts — drawCardStack += 4
shared.ts — PlayedCardEffectContext 接口定义
packages/core/src/modifiers/ — 规则修改系统
types.ts — GameRuleConfig（allowSnatch、maxHandSize 等配置）、GameRuleHookSet（canPlayCard、canSnatchCard、afterCardPlayed、afterCardSnatched、resolveUnoPenalty 钩子）、GameRules、CreateGameRulesOptions
defaults.ts — defaultRuleConfig、createGameRules、withRuleOverrides。默认配置：allowSnatch=true、maxHandSize=30、unoPenaltyCount=2
packages/core/src/index.ts
统一导出入口。导出所有公共 API：createGame、createDeck、8 个 apply* 函数、toPublicState、getPlayerHand、playability 函数、规则创建函数、所有公共类型。

四、apps/server — WebSocket 服务器（模块化）
原项目是 838 行单文件，我拆分为 7 个模块：

apps/server/src/types.ts
服务器内部类型和配置常量：

PlayerConn — 连接状态（playerId、ws、roomId、lastSeenAt、disconnectedAt、isInLobby）
RoomState — 房间状态（players、ownerPlayerId、game、status、teams、phase、phaseToken、drawnCardWindow）
环境变量配置：PORT(3001)、TURN_TIMEOUT_MS(30s)、SNATCH_WINDOW_TIMEOUT_MS(30s)、POST_DRAW_WINDOW_TIMEOUT_MS(5s)、SNATCH_AUTO_SKIP_MS(5s)、RECONNECT_GRACE_MS(20s)
apps/server/src/state.ts
全局可变状态单例：

connections Map — WebSocket → PlayerConn
playersById Map — playerId → PlayerConn
rooms Map — roomId → RoomState
send() — 安全发送（检查 readyState）
apps/server/src/broadcast.ts
广播和状态构建：

getPlayerTeam / getTeammateHands — 获取队友手牌（团队可见性）
roomSnapshot — 房间快照事件
broadcastToLobby — 向大厅所有连接广播
getLobbyStateEvent — 构建大厅状态事件
buildStateEvent — 构建完整游戏状态事件（包含手牌、队友手牌、允许操作）
broadcastGameState — 向房间所有玩家广播游戏状态
finalizeAction — 动作后处理（合并公告、检查游戏结束、发送 gameOver）
apps/server/src/room.ts
房间管理：

setGamePlayerConnected — 设置玩家连接状态
removePlayerFromLobbyRoom — 从大厅房间移除玩家
broadcastRoomSnapshot — 广播房间快照
leaveRoom — 离开房间（大厅状态清理或游戏中标记断开）
apps/server/src/actions.ts
允许操作计算和抢牌判断：

getAllowedActions — 根据当前阶段和玩家身份计算允许的操作列表
canPlayerSnatch — 判断玩家是否有合法抢牌选项
getSnatchResponders — 获取抢牌阶段的响应者列表
apps/server/src/phase.ts
回合阶段管理：

setPhase — 设置新阶段（递增 phaseToken，设置 endsAt）
startMainTurn — 开始主回合（对齐 skip 约束、清除 drawnCardWindow、广播、调度超时）
startSnatchWindow — 开始抢牌窗口（调度超时和自动跳过）
startPostDrawWindow — 开始摸牌后窗口
maybeFinishSnatchWindowEarly — 如果所有其他玩家都跳过抢牌，提前结束
schedulePhaseTimeout / scheduleSnatchAutoSkip — 超时调度
apps/server/src/handler.ts
核心动作路由（约 200 行）。根据事件类型和当前阶段分发处理：

checkUno — 任何时候可执行
skipSnatch / snatchCard / comboPlay(抢牌模式) — 仅 snatch_window 阶段
callUno — 非 snatch_window 阶段
playCard / passTurn(post_draw_window) — 摸牌后窗口
playCard / comboPlay / drawCard / passTurn — turn_main 阶段
每个分支都有阶段检查和权限验证
apps/server/src/index.ts
服务器入口（约 200 行）。处理：

WebSocket 连接管理
事件路由：requestLobbyState、leaveRoom、createRoom、joinRoom、reconnect
startGame：创建游戏实例、发送 gameStart 事件
断线处理：markDisconnected + 20 秒重连宽限期
其他事件委托给 handleAction
五、apps/client — React 前端
apps/client/package.json
依赖：React 19、Zustand 5（状态管理）、@pro-gyakuten/protocol。开发依赖：Vite、@vitejs/plugin-react、TypeScript、Vitest。

apps/client/vite.config.ts
Vite 配置，使用 React 插件，开发服务器端口 3000。

apps/client/index.html
HTML 入口，加载 /src/main.tsx。

apps/client/src/main.tsx
React 入口，StrictMode 包裹 App 组件。

apps/client/src/utils/websocket.ts
WebSocket 封装类 GameWebSocket：

connect() — 建立连接
onEvent(handler) — 注册事件监听，返回取消函数
send(event) — 发送客户端事件
close() — 关闭连接
自动重连（3 秒后重试）
apps/client/src/stores/gameStore.ts
Zustand 全局状态存储，管理：

导航状态（view: title/lobby/room/game）
玩家身份（playerId）
大厅（rooms 列表）
房间（currentRoomId、roomPlayers）
游戏状态（gameState、hand、teammateHands、phase、allowedActions、lastSeq、playableDrawnCardId、message）
游戏结束（gameOverState）
applyEvent(event) — 根据服务器事件类型更新对应状态
resetGame() — 重置游戏状态
apps/client/src/App.tsx
根组件。建立 WebSocket 连接，注册全局事件处理器（applyEvent），根据 view 状态路由到不同页面组件。导出 wsRef 供子组件使用。

apps/client/src/components/TitleScreen.tsx
标题/登录页。输入昵称后进入大厅。

apps/client/src/components/Lobby.tsx
大厅页。显示房间列表，可创建或加入房间。

apps/client/src/components/Room.tsx
等待房间。显示玩家列表，房主可开始游戏，所有人可离开。

apps/client/src/components/GameBoard.tsx
主游戏界面。显示：

当前回合、阶段、摸牌堆数量
系统消息
出牌堆顶牌
所有玩家状态（手牌数、UNO 警告）
操作按钮（摸牌、跳过、UNO）
手牌区（可点击出牌）
游戏结束画面
apps/client/src/audio.ts
音频控制器（从旧项目搬入，450 行）。管理 BGM（7 个场景组：login_lobby、room_waiting、game_base、game_advantage_、game_disadvantage_、result_win、result_lose）和 SFX（6 个：skip_matta、reverse_igiari、draw_stack_kurae + 3 个龙之介语音）。支持音量持久化和心情切换。

六、测试文件
packages/core/tests/core.spec.ts
45 个单元测试，覆盖：

游戏创建（2/4/6 人、手牌大小、纯数字起始手牌）
基础流程（摸牌、跳过、UNO 呼叫、UNO 罚则、反转、skip 约束、Wild 禁止单出、Wild 组合出牌/抢牌、draw stack 叠加、前一张顶牌发布、30 张手牌上限）
skip 约束（设置、限制可出牌、+4 豁免、清除）
罚摸连锁（+2+2→4 张、+2+4→6 张、+4+2 被拒、反转在连锁中）
Wild 组合（+skip、+draw_two、+wild_draw_four 被拒）
补牌机制
UNO 检查边界
验证逻辑（NOT_YOUR_TURN、TURN_MISMATCH、SEQ_MISMATCH）
开局特殊牌效果
抢牌（精确匹配、不匹配被拒、Wild 组合抢牌）
toPublicState（字段完整性、手牌隐藏、前一张顶牌）
getPlayerHand（副本、未知玩家）