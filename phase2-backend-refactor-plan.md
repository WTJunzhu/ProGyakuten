# 阶段二：后端架构重构 + 持久化

## 当前架构问题

- server `index.ts` (255行) 承载了 WebSocket 连接管理、所有事件路由、断线处理
- 全局可变单例 (`connections`, `playersById`, `rooms`) 散落在 `state.ts`，无封装
- 所有状态纯内存，服务器重启 = 一切丢失
- 客户端无会话持久化，刷新页面 = 丢失对局
- 客户端 `GameWebSocket` 只有固定 3s 重连，不发送 `reconnect` 事件
- 无服务端测试（房间生命周期、重连、阶段超时）

---

## 改动清单

### 一、前端会话持久化（客户端）

**涉及文件：**
- `apps/client/src/stores/gameStore.ts` — 新增 session 状态和持久化逻辑
- `apps/client/src/App.tsx` — 启动时恢复会话
- `apps/client/src/utils/websocket.ts` — 重连时发送 reconnect
- `apps/client/src/components/LoginScreen.tsx` — 读取已保存的 playerId/serverUrl

**具体改动：**

1. **gameStore.ts 新增 session 字段**
   - `savedPlayerId: string | null`
   - `savedServerUrl: string | null`
   - `savedRoomId: string | null`
   - `loadSession()` — 从 localStorage 读取 `new_uno_session`
   - `saveSession()` — 写入 localStorage
   - `clearSession()` — 清除 localStorage

2. **App.tsx 启动恢复逻辑**
   - `useEffect` 初始化时调用 `loadSession()`
   - 如果有 savedSession 且 savedRoomId 存在，自动调用 `handleConnect` 并发送 `reconnect` 事件
   - 如果只有 savedSession 无 roomId，进入 login 界面并预填 playerId/serverUrl

3. **LoginScreen.tsx 预填**
   - 从 store 读取 `savedPlayerId` / `savedServerUrl` 作为默认值

4. **gameStore.ts applyEvent 中保存**
   - `gameStart` / `statePatch` / `roomSnapshot` 事件中调用 `saveSession()`
   - `leaveRoom` / 返回主菜单时调用 `clearSession()`

### 二、前端断线自动重连（客户端）

**涉及文件：**
- `apps/client/src/utils/websocket.ts` — 重写重连逻辑
- `apps/client/src/App.tsx` — 重连后发送 reconnect

**具体改动：**

1. **GameWebSocket 重写**
   - 指数退避：1s → 2s → 4s → 8s（最大 8s）
   - 重连成功后触发 `onReconnect` 回调
   - 区分"主动关闭"和"意外断线"：主动关闭不重连
   - 新增 `shouldReconnect` 标志

2. **App.tsx 重连处理**
   - `onReconnect` 回调中：如果 `savedRoomId` 存在，发送 `{ type: "reconnect", roomId, playerId }`
   - 否则发送 `requestLobbyState`

3. **gameStore.ts 断线感知**
   - 连接断开时 toast 提示 "连接断开，正在重连..."
   - 重连成功时 toast 提示 "已恢复连接"

### 三、服务端 index.ts 拆分（服务端）

**当前 index.ts 结构 (255行)：**
- L18: WebSocketServer 创建
- L20-66: `markDisconnected` + 超时清理
- L68-76: 内联 `broadcastGameState`
- L78-253: `wss.on("connection")` 内所有事件处理

**拆分方案：**

1. **`connection.ts`**（新建）
   - `markDisconnected(playerId)` — 断线标记 + 超时清理
   - `handleReconnect(conn, event)` — 重连处理
   - `handleDisconnect(conn)` — 连接关闭处理
   - 从 index.ts 移出 L20-66

2. **`event-router.ts`**（新建）
   - `routeEvent(room, event)` — 根据 event.type 分发到 handler
   - 从 index.ts 的 `ws.on("message")` 中提取路由逻辑
   - createRoom / joinRoom / leaveRoom / startGame / reconnect 留在 index.ts（连接级操作）
   - playCard / drawCard / passTurn / callUno / checkUno / skipSnatch / snatchCard / comboPlay 移到 handler.ts（已有）

3. **`index.ts`** 精简为：
   - WebSocketServer 创建
   - connection 事件处理（新建 PlayerConn）
   - message 事件处理（JSON parse + 路由）
   - close 事件处理（调用 connection.ts）
   - 目标：~80 行

### 四、服务端房间管理封装（服务端）

**涉及文件：**
- `apps/server/src/state.ts` — 当前是裸 Map 导出
- 新建 `room-manager.ts`

**具体改动：**

1. **room-manager.ts**（新建）
   - 封装 `rooms` Map 为 RoomManager class
   - `createRoom(roomId, playerId)` → RoomState
   - `getRoom(roomId)` → RoomState | undefined
   - `deleteRoom(roomId)` → void
   - `addPlayer(roomId, playerId)` → void
   - `removePlayer(roomId, playerId)` → void
   - `transferOwnership(roomId)` → void
   - 内部处理 dissolve 逻辑（从 room.ts 移入）

2. **state.ts** 精简
   - `connections` 和 `playersById` 保留为全局（WebSocket 生命周期绑定进程）
   - `rooms` 改为由 RoomManager 管理
   - `send()` 保留

### 五、服务端持久化层（服务端）

**涉及文件：**
- 新建 `persistence.ts`
- 新建 `db/schema.sql`
- `apps/server/package.json` — 添加 `better-sqlite3` 依赖

**数据库 Schema：**

```sql
-- 房间表
CREATE TABLE rooms (
  room_id TEXT PRIMARY KEY,
  owner_player_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby',
  teams_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 玩家-房间关联
CREATE TABLE room_players (
  room_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  PRIMARY KEY (room_id, player_id),
  FOREIGN KEY (room_id) REFERENCES rooms(room_id)
);

-- 游戏状态快照（每步操作后序列化）
CREATE TABLE game_snapshots (
  room_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  phase_json TEXT,
  saved_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (room_id) REFERENCES rooms(room_id)
);

-- 玩家会话（用于断线重连）
CREATE TABLE player_sessions (
  player_id TEXT PRIMARY KEY,
  room_id TEXT,
  connected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

**persistence.ts 接口：**

```typescript
export interface PersistenceLayer {
  // Room
  saveRoom(room: RoomState): void;
  loadRoom(roomId: string): RoomState | null;
  deleteRoom(roomId: string): void;
  loadAllRooms(): RoomState[];

  // Game snapshot
  saveGameSnapshot(roomId: string, game: GameStateInternal, phase?: TurnPhaseInfo): void;
  loadGameSnapshot(roomId: string): { game: GameStateInternal; phase?: TurnPhaseInfo } | null;

  // Player session
  savePlayerSession(playerId: string, roomId: string | null): void;
  loadPlayerSession(playerId: string): { roomId: string | null } | null;
  deletePlayerSession(playerId: string): void;
}
```

**持久化触发时机：**
- 房间创建/加入/离开 → saveRoom
- 游戏开始/出牌/阶段切换 → saveGameSnapshot
- 玩家连接/断线 → savePlayerSession
- 房间删除 → deleteRoom + deleteGameSnapshot

**启动恢复：**
- 服务器启动时 loadAllRooms()，恢复所有 status="in_game" 的房间
- 恢复 game snapshot 和 phase
- 等待玩家 reconnect

### 六、协议扩展（protocol 包）

**涉及文件：**
- `packages/protocol/src/index.ts`

**新增：**

1. **ReconnectEvent 扩展** — 服务端响应重连时需要区分"恢复游戏"和"回到大厅"
   - 服务端重连响应：如果房间仍在游戏中，发送 `gameStart`（带完整状态）
   - 如果房间已结束或不存在，发送 `lobbyState`

2. **可选：SessionRestoredEvent**
   - 服务端 → 客户端：`{ type: "sessionRestored", roomId, status }`
   - 让客户端知道会话已恢复，可以跳过 login

### 七、服务端测试（服务端）

**新建文件：**
- `apps/server/tests/room-lifecycle.spec.ts`
- `apps/server/tests/reconnect.spec.ts`
- `apps/server/tests/phase-timeout.spec.ts`

**测试用例：**

1. **room-lifecycle.spec.ts**
   - 创建房间 → 加入玩家 → 开始游戏 → 结算 → 回到大厅
   - 房主退出 → 自动转让
   - 所有玩家退出 → 房间自动解散
   - 房间满员 → 拒绝加入
   - 游戏中退出 → 断线标记 + 超时清理

2. **reconnect.spec.ts**
   - 断线 → 重连 → 恢复游戏状态
   - 断线超时 → 被踢出
   - 重连到已结束的房间 → 回到大厅
   - 多次快速断线重连

3. **phase-timeout.spec.ts**
   - 主回合超时 → 自动摸牌/承受罚摸
   - 抢牌窗口超时 → 自动跳过
   - 摸牌判定超时 → 放弃打出

---

## 实施顺序

1. **前端会话持久化** — 独立于后端，可先行
2. **前端断线重连** — 依赖 1
3. **协议扩展** — 小改动，为后续铺路
4. **服务端 index.ts 拆分** — 纯重构，不改行为
5. **服务端房间管理封装** — 依赖 4
6. **服务端持久化层** — 依赖 5
7. **服务端启动恢复** — 依赖 6
8. **服务端测试** — 依赖 4-7

## 预估工作量

- 前端部分（1-2）：约 200 行新增/修改
- 协议扩展（3）：约 30 行
- 服务端拆分（4-5）：约 300 行重构
- 持久化层（6-7）：约 400 行新增
- 测试（8）：约 300 行新增
- 总计：约 1200 行
