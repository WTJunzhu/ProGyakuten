# 逆转 Uno (ProGyakuten) — 项目文档

## 游戏玩法

两队对抗的 UNO 变体。每队人数相等（2/4/6 人），先出完手牌的队伍获胜。

### 牌堆（108 张）

| 牌 | 数量 | 效果 |
|---|---|---|
| 数字牌 (1-9) | 72 张 | 无特殊效果，按颜色或数字匹配 |
| 反转 (Reverse) | 12 张 | 翻转出牌方向。在加牌链中可作为同色"反射"牌 |
| 跳过 (Skip) | 4 张 | 下一个同队玩家被限制：只能出与上一张同种类（数字还需同数值）的牌，或 +4 |
| +2 (Draw Two) | 8 张 | 累加 2 张罚牌。后续可接 +2、+4 或同色反转 |
| 变色 (Wild) | 6 张 | 不能单独出，必须与非 Wild、非 +4 的牌组合使用，指定颜色 |
| +4 (Wild Draw Four) | 6 张 | 独立使用，累加 4 张罚牌。后续只能接 +4 或同色反转。需指定颜色 |

### 回合流程

1. **出牌阶段** (`turn_main`)：当前玩家可出牌、摸牌、或（有罚牌栈时）跳过接受罚牌
2. **抢牌窗口** (`snatch_window`)：出牌后开启。其他玩家可精确抢牌（颜色+种类+数值完全匹配），或跳过。5 秒内无抢牌选项的玩家自动跳过，30 秒后窗口关闭
3. **摸牌后窗口** (`post_draw_window`)：主动摸牌后 5 秒内，如果摸到的牌可出，可以选择打出

### 加牌链规则

- `penaltySource` 字段追踪加牌链来源（`"draw_two"` 或 `"wild_draw_four"`）
- +2 来源：可接 +2、+4、同色反转
- +4 来源：只能接 +4、同色反转
- 跳过时摸取 `drawCardStack` 累计张数

### 抢牌规则

纯精确匹配：颜色 + 种类 + 数值（数字牌）完全相同。与加牌链无关。
Wild + 其他牌组合抢牌：Wild 声明颜色，另一张牌必须与顶牌精确匹配。

### UNO 规则

2 张牌打出 1 张时应喊 UNO。未喊被其他玩家检查则罚摸 2 张。误检查（无人处于 UNO 状态）检查者自己罚摸 2 张。

### 初始发牌

- 手牌数 = 队伍人数 + 1
- 初始手牌只有数字牌
- 首张顶牌必须是数字牌

---

## 项目结构

```
ProGyakuten/                          # monorepo 根目录（npm workspaces）
├── packages/
│   ├── protocol/                     # 共享类型和事件定义
│   │   └── src/index.ts              # Card, GamePublicState, ClientEvent, ServerEvent 等
│   └── core/                         # 游戏引擎
│       └── src/
│           ├── index.ts              # 公开 API 导出
│           ├── types.ts              # GameStateInternal, PlayerState, ActionResult
│           ├── setup.ts              # createDeck(), createGame()
│           ├── actions.ts            # applyPlayCard, applySnatchCard, applyComboPlay 等
│           ├── engine/state.ts       # 核心引擎：drawOne, advanceTurn, toPublicState 等
│           ├── modifiers/            # 规则配置系统
│           │   ├── types.ts          # GameRuleConfig, GameRuleHookSet, GameRules
│           │   └── defaults.ts       # 默认规则配置
│           └── rules/
│               ├── playability.ts    # isCardPlayable, isCardSnatchable 及 Lite 变体
│               └── cards/            # 各牌种效果实现
│                   ├── registry.ts   # 效果注册表
│                   ├── drawTwo.ts    # +2 效果
│                   ├── wildDrawFour.ts # +4 效果
│                   ├── reverse.ts    # 反转效果
│                   ├── skip.ts       # 跳过效果
│                   ├── wild.ts       # 变色效果
│                   └── number.ts     # 数字牌（无效果）
├── apps/
│   ├── server/                       # WebSocket 游戏服务器
│   │   └── src/
│   │       ├── index.ts              # 入口：HTTP + WebSocket 服务器，消息路由
│   │       ├── types.ts              # PlayerConn, RoomState, 服务器常量
│   │       ├── state.ts              # 全局连接映射，send() 工具函数
│   │       ├── db.ts                 # SQLite/Turso 客户端初始化
│   │       ├── persistence.ts        # SqlitePersistence：房间、快照、账户、角色
│   │       ├── db/schema.sql         # 数据库表结构（6 张表）
│   │       ├── auth.ts               # 注册/登录/token 验证（scrypt 加密）
│   │       ├── character.ts          # 角色 CRUD（每账户最多 3 个）
│   │       ├── room-manager.ts       # 房间管理器
│   │       ├── room.ts               # 房间生命周期
│   │       ├── connection.ts         # 断线/重连处理
│   │       ├── broadcast.ts          # 广播工具函数
│   │       ├── handler.ts            # 游戏动作分发器
│   │       ├── actions.ts            # 合法动作计算
│   │       └── phase.ts              # 阶段状态机（超时、自动跳过）
│   └── client/                       # React SPA 客户端
│       └── src/
│           ├── main.tsx              # Vite 入口
│           ├── App.tsx               # 根组件：视图路由、WebSocket 生命周期
│           ├── styles.css            # 全局 CSS
│           ├── audio.ts             # 音频控制器（BGM 分组、SFX）
│           ├── components/
│           │   ├── TitleScreen.tsx    # 标题页
│           │   ├── LoginScreen.tsx    # 登录/注册
│           │   ├── CharacterSelect.tsx # 角色选择
│           │   ├── Lobby.tsx         # 房间大厅
│           │   ├── Room.tsx          # 游戏房间（等待开始）
│           │   ├── GameBoard.tsx     # 主游戏界面（手牌、出牌、抢牌、UNO）
│           │   ├── ColorModal.tsx    # Wild 牌颜色选择弹窗
│           │   ├── FloatingButtons.tsx # 浮动按钮（规则、音频、日志）
│           │   ├── AudioPanel.tsx    # 音量调节面板
│           │   ├── RulesOverlay.tsx  # 规则说明覆盖层
│           │   └── Toast.tsx         # 通知提示
│           ├── stores/
│           │   ├── gameStore.ts      # Zustand 主状态管理
│           │   └── toastStore.ts     # 通知状态
│           └── utils/
│               ├── card.ts           # 牌面显示工具
│               └── websocket.ts      # WebSocket 自动重连（指数退避）
└── tests/                            # 集成测试（待补充）
```

---

## 构建和运行

```bash
# 安装依赖
npm install

# 构建（必须按顺序）
npm run build -w @pro-gyakuten/protocol
npm run build -w @pro-gyakuten/core
npm run build -w @pro-gyakuten/server
npm run build -w @pro-gyakuten/client

# 本地开发
npm run dev -w @pro-gyakuten/server   # 后端 ws://localhost:3001
npm run dev -w @pro-gyakuten/client   # 前端 http://localhost:3000

# 测试
npx vitest run packages/core/tests/core.spec.ts    # 57 个核心测试
npx vitest run apps/server/tests/persistence.spec.ts # 10 个持久化测试
```

---

## 重构阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| 0 | 测试体系建设 | 完成 |
| 1 | 前端架构重构（React + Vite + Zustand） | 完成 |
| 2 | 后端架构重构 + 持久化（SQLite） | 完成 |
| 3 | 账户+角色系统（注册登录、角色槽位、资产等级） | 完成 |
| 4 | 消除代码重复 + 加牌流程修复（penaltySource） | 完成 |
| 5 | 部署（Turso + Render + Vercel） | 完成 |
| 6 | 协议预留（技能、AI、聊天、观战） | 待做 |

---

## 关键技术决策

### penaltySource 字段

加牌链追踪使用 `GameStateInternal.penaltySource: CardKind | null`，替代了从弃牌堆扫描的旧方案。字段在 +2/+4 出牌时设置，在加牌结算或跳过后清空。

### 客户端 Lite 函数

客户端通过 `packages/core` 的 Lite 函数判定出牌/抢牌合法性，不重复实现逻辑：
- `isCardPlayableLite` — 接受公共状态字段，内部复用 core 的匹配逻辑
- `isCardSnatchableLite` — 纯精确匹配
- `matchesSkipConstraintLite` — Skip 约束判定

### Turso 数据库

`@libsql/client` 同时支持本地 SQLite 文件和远程 Turso：
- 不设 `TURSO_URL` → 用 `file:gyakuten.db`（本地开发）
- 设了 `TURSO_URL` → 连接远程 Turso（生产环境）

---

## 环境变量

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `TURSO_URL` | Turso 数据库 URL | `file:gyakuten.db` |
| `TURSO_AUTH_TOKEN` | Turso 认证 token | 无 |
| `VITE_WS_URL` | 客户端 WebSocket 服务器 URL | `ws://localhost:3001` |
| `PORT` | 服务器端口 | `3001` |
| `HOST` | 服务器绑定地址 | `0.0.0.0` |
| `TURN_TIMEOUT_MS` | 出牌超时 | `30000` |
| `SNATCH_WINDOW_TIMEOUT_MS` | 抢牌窗口超时 | `30000` |
| `POST_DRAW_WINDOW_TIMEOUT_MS` | 摸牌后窗口 | `5000` |
| `SNATCH_AUTO_SKIP_MS` | 无抢牌选项自动跳过 | `5000` |
| `RECONNECT_GRACE_MS` | 断线宽限期 | `20000` |

---

## 数据库表

| 表 | 用途 |
|------|------|
| `rooms` | 房间信息（ID、房主、状态、队伍） |
| `room_players` | 房间-玩家关联（座位） |
| `game_snapshots` | 游戏状态快照（JSON 序列化的完整游戏状态） |
| `player_sessions` | 玩家会话（用于断线重连） |
| `accounts` | 账户（用户名、密码哈希） |
| `characters` | 角色（名称、等级、胜负场、资产） |

---

## 已知限制

- Render 免费层 15 分钟无流量会休眠，首次访问冷启动约 30 秒
- 断线重连依赖 `playerId`（角色名），如果两个玩家用同名角色会冲突
- 服务器内存中的房间状态是主要状态，SQLite 是备份（用于重启恢复）
- 手牌区的 hover 展开效果使用高斯函数，但多次尝试添加上下避让效果均未成功
